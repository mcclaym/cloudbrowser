import puppeteer, {
  type Browser,
  type BrowserWorker,
  type Page,
} from "@cloudflare/puppeteer";

import type { BrowserSettings } from "./browser-settings";
import { ApiError } from "./http";
import { isBrowserRequestAllowed, normalizeTargetUrl } from "./security";
import type { PageSnapshot } from "./types";

export const NAVIGATION_TIMEOUT_MS = 30_000;
export const MAX_EXTRACT_CHARACTERS = 40_000;
export const MAX_EXTRACT_LINKS = 200;

export type HistoryDirection = "back" | "forward" | "reload";

export interface ExtractResult extends PageSnapshot {
  text: string;
  description?: string;
  links: Array<{ text: string; href: string }>;
  truncated: boolean;
}

/**
 * Reconnects to a live Browser Run session, hands the first page to `run`, and
 * always drops the CDP connection afterwards so `keep_alive` can take over.
 */
export async function withSessionPage<T>(
  binding: BrowserWorker,
  browserSessionId: string,
  run: (page: Page, browser: Browser) => Promise<T>,
): Promise<T> {
  let browser: Browser;
  try {
    browser = await puppeteer.connect(binding, browserSessionId);
  } catch (error) {
    throw new ApiError(
      410,
      "BROWSER_SESSION_GONE",
      `无法连接到这个云端浏览器，它可能已被回收。${errorDetail(error)}`,
    );
  }

  try {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
    return await run(page, browser);
  } finally {
    try {
      browser.disconnect();
    } catch {
      // The session is already gone; nothing left to release.
    }
  }
}

/**
 * Blocks navigation to private ranges and optionally drops heavy sub-resources.
 * Interception only lives as long as the current CDP connection.
 */
export async function installRequestGuard(
  page: Page,
  settings: BrowserSettings,
): Promise<void> {
  const blocked = new Set(settings.blockedResources);
  await page.setRequestInterception(true);
  page.on("request", (interceptedRequest) => {
    void (async () => {
      try {
        if (!isBrowserRequestAllowed(interceptedRequest.url())) {
          await interceptedRequest.abort("blockedbyclient");
          return;
        }
        if (blocked.size > 0 && blocked.has(interceptedRequest.resourceType() as never)) {
          await interceptedRequest.abort("blockedbyclient");
          return;
        }
        await interceptedRequest.continue();
      } catch {
        try {
          await interceptedRequest.abort("blockedbyclient");
        } catch {
          // The request already finished; nothing to do.
        }
      }
    })();
  });
}

export async function navigate(
  page: Page,
  rawUrl: string,
): Promise<PageSnapshot> {
  const targetUrl = normalizeTargetUrl(rawUrl);
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  return snapshot(page);
}

export async function moveInHistory(
  page: Page,
  direction: HistoryDirection,
): Promise<PageSnapshot> {
  const options = {
    waitUntil: "domcontentloaded" as const,
    timeout: NAVIGATION_TIMEOUT_MS,
  };

  if (direction === "reload") {
    await page.reload(options);
  } else if (direction === "back") {
    const response = await page.goBack(options);
    if (!response) {
      throw new ApiError(409, "NO_HISTORY_ENTRY", "没有可以后退的页面。");
    }
  } else {
    const response = await page.goForward(options);
    if (!response) {
      throw new ApiError(409, "NO_HISTORY_ENTRY", "没有可以前进的页面。");
    }
  }

  return snapshot(page);
}

export async function snapshot(page: Page): Promise<PageSnapshot> {
  const [url, title] = await Promise.all([
    Promise.resolve(page.url()),
    page.title().catch(() => ""),
  ]);
  return { url, title: title.slice(0, 200) };
}

export async function screenshot(
  page: Page,
  options: { fullPage?: boolean; format?: "png" | "jpeg" } = {},
): Promise<Uint8Array> {
  const format = options.format === "jpeg" ? "jpeg" : "png";
  const raw = (await page.screenshot({
    type: format,
    fullPage: options.fullPage === true,
    ...(format === "jpeg" ? { quality: 85 } : {}),
  })) as unknown as Uint8Array;
  return raw;
}

export async function renderPdf(page: Page): Promise<Uint8Array> {
  const raw = (await page.pdf({
    format: "A4",
    printBackground: true,
  })) as unknown as Uint8Array;
  return raw;
}

/**
 * Runs in the page, so it is authored as a string: the Worker tsconfig has no
 * DOM lib and this code never executes inside the Worker isolate.
 */
const EXTRACT_SCRIPT = `(() => {
  const maxCharacters = ${MAX_EXTRACT_CHARACTERS};
  const maxLinks = ${MAX_EXTRACT_LINKS};
  const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
  const raw = (document.body && document.body.innerText) || "";
  const text = raw.replace(/\\n{3,}/g, "\\n\\n").trim();
  const links = Array.from(document.querySelectorAll("a[href]"))
    .slice(0, maxLinks)
    .map((anchor) => ({
      text: (anchor.textContent || "").trim().slice(0, 120),
      href: anchor.href,
    }))
    .filter((link) => link.href.indexOf("http") === 0);
  return {
    description: meta ? meta.getAttribute("content") || undefined : undefined,
    text: text.slice(0, maxCharacters),
    truncated: text.length > maxCharacters,
    links,
  };
})()`;

export async function extract(page: Page): Promise<ExtractResult> {
  const { url, title } = await snapshot(page);
  const result = (await page.evaluate(EXTRACT_SCRIPT)) as Omit<
    ExtractResult,
    "url" | "title"
  >;
  return { url, title, ...result };
}

/** Touches a session so Cloudflare restarts its idle `keep_alive` window. */
export async function heartbeat(
  binding: BrowserWorker,
  browserSessionId: string,
): Promise<PageSnapshot> {
  return withSessionPage(binding, browserSessionId, (page) => snapshot(page));
}

function errorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message ? `（${message.slice(0, 120)}）` : "";
}
