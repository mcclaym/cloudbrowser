import type { LiveViewUrls } from "./types";

export interface BrowserTarget {
  id: string;
  type: string;
  url: string;
  title: string;
  devtoolsFrontendUrl: string;
  webSocketDebuggerUrl?: string;
}

export type { LiveViewUrls };

interface CloudflareEnvelope<T> {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
}

export async function getLiveViewUrls(
  accountId: string,
  apiToken: string,
  sessionId: string,
  expectedUrl?: string,
): Promise<LiveViewUrls> {
  const response = await fetch(
    browserApiUrl(accountId, `/devtools/browser/${encodeURIComponent(sessionId)}/json/list`),
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  );

  const payload = await parseApiResponse<BrowserTarget[]>(response);
  const targets = Array.isArray(payload) ? payload : [];
  const pages = targets.filter(
    (target) => target.type === "page" && Boolean(target.devtoolsFrontendUrl),
  );

  const target =
    pages.find((candidate) => expectedUrl && candidate.url === expectedUrl) ??
    pages.find((candidate) => candidate.url !== "about:blank") ??
    pages[0];

  if (!target) {
    throw new Error("Browser Run 会话已创建，但没有找到可打开的页面。");
  }

  return {
    liveUrl: toHostedViewUrl(target.devtoolsFrontendUrl, "tab"),
    inspectorUrl: toHostedViewUrl(target.devtoolsFrontendUrl, "devtools"),
  };
}

export async function closeBrowserSession(
  accountId: string,
  apiToken: string,
  sessionId: string,
): Promise<void> {
  const response = await fetch(
    browserApiUrl(accountId, `/devtools/browser/${encodeURIComponent(sessionId)}`),
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  );

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    await parseApiResponse(response);
  }
}

function browserApiUrl(accountId: string, suffix: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering${suffix}`;
}

function toHostedViewUrl(rawUrl: string, mode: "tab" | "devtools"): string {
  const url = new URL(rawUrl);
  url.protocol = "https:";
  url.hostname = "live.browser.run";
  url.pathname = "/ui/view";
  url.searchParams.set("mode", mode);
  return url.toString();
}

async function parseApiResponse<T = unknown>(response: Response): Promise<T> {
  let payload: T | CloudflareEnvelope<T> | undefined;
  try {
    payload = (await response.json()) as T | CloudflareEnvelope<T>;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const envelope = payload as CloudflareEnvelope<T> | undefined;
    const message =
      envelope?.errors?.map((error) => error.message).filter(Boolean).join("；") ||
      `Cloudflare Browser Run API 返回 ${response.status}`;
    throw new Error(message);
  }

  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "result" in payload
  ) {
    const envelope = payload as CloudflareEnvelope<T>;
    if (envelope.success === false) {
      const message =
        envelope.errors?.map((error) => error.message).filter(Boolean).join("；") ||
        "Cloudflare Browser Run API 请求失败。";
      throw new Error(message);
    }
    return envelope.result as T;
  }

  return payload as T;
}
