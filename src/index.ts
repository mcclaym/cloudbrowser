import { DurableObject } from "cloudflare:workers";
import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";

import { closeBrowserSession, getLiveViewUrls, type LiveViewUrls } from "./cloudflare-api";
import {
  constantTimeEqual,
  isBrowserRequestAllowed,
  normalizeTargetUrl,
  TargetUrlError,
} from "./security";

interface Env {
  ASSETS: Fetcher;
  BROWSER: BrowserWorker;
  BROWSER_SESSIONS: DurableObjectNamespace<BrowserSession>;
  ADMIN_TOKEN?: string;
  BROWSER_SESSION_TTL_SECONDS?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_BROWSER_TOKEN?: string;
  BROWSER_MOCK?: string;
}

interface SessionRecord {
  sessionId: string;
  targetUrl: string;
  createdAt: string;
  expiresAt: string;
  mock: boolean;
}

interface SessionStatus {
  active: boolean;
  targetUrl?: string;
  createdAt?: string;
  expiresAt?: string;
  sessionRef?: string;
  mock?: boolean;
}

const SESSION_KEY = "browser-session";
const MAX_BODY_BYTES = 4096;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 600;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      return json({
        sessionTtlSeconds: sessionTtlSeconds(env),
        authConfigured: Boolean(env.ADMIN_TOKEN),
      });
    }

    if (!url.pathname.startsWith("/api/session")) {
      return errorResponse(404, "NOT_FOUND", "没有这个 API 路径。");
    }

    const authFailure = authenticateRequest(request, env);
    if (authFailure) {
      return authFailure;
    }

    const session = env.BROWSER_SESSIONS.getByName("owner");
    let destination = "/status";

    if (url.pathname === "/api/session") {
      if (request.method === "POST") {
        destination = "/start";
      } else if (request.method === "DELETE") {
        destination = "/stop";
      } else if (request.method !== "GET") {
        return methodNotAllowed("GET, POST, DELETE");
      }
    } else if (
      url.pathname === "/api/session/live-url" &&
      request.method === "POST"
    ) {
      destination = "/live-url";
    } else {
      return errorResponse(404, "NOT_FOUND", "没有这个 API 路径。");
    }

    const body = request.method === "POST" ? await readLimitedBody(request) : undefined;
    if (body instanceof Response) {
      return body;
    }

    const response = await session.fetch(
      new Request(`https://session.internal${destination}`, {
        method: request.method,
        headers: {
          "content-type": "application/json",
        },
        body,
      }),
    );

    return withApiHeaders(response);
  },
};

export class BrowserSession extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/status" && request.method === "GET") {
        return json(await this.getStatus());
      }

      if (url.pathname === "/start" && request.method === "POST") {
        const payload = await request.json<{ url?: unknown }>();
        return json(await this.start(payload.url), 201);
      }

      if (url.pathname === "/live-url" && request.method === "POST") {
        return json(await this.refreshLiveUrl());
      }

      if (url.pathname === "/stop" && request.method === "DELETE") {
        await this.stop();
        return json({ active: false });
      }

      return errorResponse(404, "NOT_FOUND", "没有这个会话操作。");
    } catch (error) {
      if (error instanceof TargetUrlError) {
        return errorResponse(400, error.code, error.message);
      }

      console.error("Browser session error", error);
      return errorResponse(
        502,
        "BROWSER_SESSION_ERROR",
        error instanceof Error ? error.message : "云端浏览器暂时不可用。",
      );
    }
  }

  async alarm(): Promise<void> {
    const record = await this.ctx.storage.get<SessionRecord>(SESSION_KEY);
    if (record) {
      await this.stop(record);
    }
  }

  private async getStatus(): Promise<SessionStatus> {
    const record = await this.ctx.storage.get<SessionRecord>(SESSION_KEY);
    if (!record) {
      return { active: false };
    }

    if (Date.parse(record.expiresAt) <= Date.now()) {
      await this.stop(record);
      return { active: false };
    }

    return publicStatus(record);
  }

  private async start(rawUrl: unknown): Promise<SessionStatus & LiveViewUrls> {
    const targetUrl = normalizeTargetUrl(rawUrl);
    const existing = await this.ctx.storage.get<SessionRecord>(SESSION_KEY);
    if (existing) {
      await this.stop(existing);
    }

    const now = Date.now();
    const expiresAt = now + sessionTtlSeconds(this.env) * 1000;

    if (this.env.BROWSER_MOCK === "true") {
      const record: SessionRecord = {
        sessionId: `mock-${crypto.randomUUID()}`,
        targetUrl,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        mock: true,
      };
      await this.persist(record);
      return {
        ...publicStatus(record),
        liveUrl: targetUrl,
        inspectorUrl: targetUrl,
      };
    }

    assertBrowserApiConfigured(this.env);

    const browser = await puppeteer.launch(this.env.BROWSER, {
      keep_alive: sessionTtlSeconds(this.env) * 1000,
      recording: false,
    });

    try {
      const pages = await browser.pages();
      const page = pages[0] ?? (await browser.newPage());

      await page.setRequestInterception(true);
      page.on("request", async (interceptedRequest) => {
        try {
          if (isBrowserRequestAllowed(interceptedRequest.url())) {
            await interceptedRequest.continue();
          } else {
            await interceptedRequest.abort("blockedbyclient");
          }
        } catch {
          await interceptedRequest.abort("blockedbyclient");
        }
      });

      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      const finalUrl = normalizeTargetUrl(page.url());
      const sessionId = browser.sessionId();
      browser.disconnect();

      const record: SessionRecord = {
        sessionId,
        targetUrl: finalUrl,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        mock: false,
      };
      const liveView = await getLiveViewUrls(
        this.env.CLOUDFLARE_ACCOUNT_ID!,
        this.env.CLOUDFLARE_BROWSER_TOKEN!,
        sessionId,
        finalUrl,
      );

      await this.persist(record);
      return { ...publicStatus(record), ...liveView };
    } catch (error) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Unable to close failed browser session", closeError);
      }
      throw error;
    }
  }

  private async refreshLiveUrl(): Promise<SessionStatus & LiveViewUrls> {
    const record = await this.ctx.storage.get<SessionRecord>(SESSION_KEY);
    if (!record || Date.parse(record.expiresAt) <= Date.now()) {
      if (record) {
        await this.stop(record);
      }
      throw new Error("当前没有运行中的云端浏览器。");
    }

    if (record.mock) {
      return {
        ...publicStatus(record),
        liveUrl: record.targetUrl,
        inspectorUrl: record.targetUrl,
      };
    }

    assertBrowserApiConfigured(this.env);
    const liveView = await getLiveViewUrls(
      this.env.CLOUDFLARE_ACCOUNT_ID!,
      this.env.CLOUDFLARE_BROWSER_TOKEN!,
      record.sessionId,
      record.targetUrl,
    );
    return { ...publicStatus(record), ...liveView };
  }

  private async stop(record?: SessionRecord): Promise<void> {
    const current = record ?? (await this.ctx.storage.get<SessionRecord>(SESSION_KEY));
    if (!current) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    try {
      if (
        !current.mock &&
        this.env.CLOUDFLARE_ACCOUNT_ID &&
        this.env.CLOUDFLARE_BROWSER_TOKEN
      ) {
        await closeBrowserSession(
          this.env.CLOUDFLARE_ACCOUNT_ID,
          this.env.CLOUDFLARE_BROWSER_TOKEN,
          current.sessionId,
        );
      }
    } finally {
      await this.ctx.storage.delete(SESSION_KEY);
      await this.ctx.storage.deleteAlarm();
    }
  }

  private async persist(record: SessionRecord): Promise<void> {
    await this.ctx.storage.put(SESSION_KEY, record);
    await this.ctx.storage.setAlarm(Date.parse(record.expiresAt));
  }
}

function authenticateRequest(request: Request, env: Env): Response | null {
  if (!env.ADMIN_TOKEN) {
    return errorResponse(
      503,
      "AUTH_NOT_CONFIGURED",
      "服务端尚未设置 ADMIN_TOKEN。",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!supplied || !constantTimeEqual(supplied, env.ADMIN_TOKEN)) {
    return errorResponse(401, "UNAUTHORIZED", "访问口令不正确。", {
      "www-authenticate": 'Bearer realm="CloudBrowser"',
    });
  }

  return null;
}

function assertBrowserApiConfigured(
  env: Env,
): asserts env is Env & {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_BROWSER_TOKEN: string;
} {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_BROWSER_TOKEN) {
    throw new Error(
      "尚未配置 CLOUDFLARE_ACCOUNT_ID 或 CLOUDFLARE_BROWSER_TOKEN。",
    );
  }
}

function sessionTtlSeconds(env: Env): number {
  const configured = Number.parseInt(env.BROWSER_SESSION_TTL_SECONDS ?? "", 10);
  if (!Number.isFinite(configured)) {
    return MAX_TTL_SECONDS;
  }
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, configured));
}

function publicStatus(record: SessionRecord): SessionStatus {
  return {
    active: true,
    targetUrl: record.targetUrl,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    sessionRef: record.sessionId.slice(0, 8),
    mock: record.mock,
  };
}

async function readLimitedBody(request: Request): Promise<string | Response> {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "请求内容过大。");
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "请求内容过大。");
  }
  return body;
}

function methodNotAllowed(allow: string): Response {
  return errorResponse(405, "METHOD_NOT_ALLOWED", "不支持这个请求方法。", {
    allow,
  });
}

function json(data: unknown, status = 200): Response {
  return withApiHeaders(
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    }),
  );
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  headers: HeadersInit = {},
): Response {
  return withApiHeaders(
    new Response(JSON.stringify({ error: { code, message } }), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...headers,
      },
    }),
  );
}

function withApiHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
