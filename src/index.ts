import { assertAuthorized } from "./auth";
import {
  BLOCKABLE_RESOURCES,
  DEVICE_PRESETS,
  LOCALE_OPTIONS,
  MAX_DEVICE_SCALE_FACTOR,
  MAX_VIEWPORT_HEIGHT,
  MAX_VIEWPORT_WIDTH,
  MIN_VIEWPORT_HEIGHT,
  MIN_VIEWPORT_WIDTH,
  REGION_OPTIONS,
  REGION_PROFILES,
  TIMEZONE_OPTIONS,
  USER_AGENT_PRESETS,
} from "./browser-settings";
import { APP_VERSION, type Env } from "./env";
import {
  ApiError,
  errorResponseFrom,
  json,
  MAX_BODY_BYTES,
  methodNotAllowed,
  withApiHeaders,
} from "./http";
import {
  configuredMaxSessions,
  configuredSessionTtlSeconds,
  MAX_EXTENSION_SECONDS,
  MAX_EXTENSIONS_PER_SESSION,
  MAX_SESSION_TTL_SECONDS,
} from "./session-config";

import {
  createScreenTicket,
  DEFAULT_TICKET_TTL_SECONDS,
  verifyScreenTicket,
} from "./screen-ticket";

export { BrowserSession } from "./browser-session";
export { BrowserContainer } from "./browser-container";

/** Durable Object name that owns every session of the single console user. */
const OWNER = "owner";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/screen/")) {
      try {
        return await handleScreen(request, env, url);
      } catch (error) {
        if (error instanceof ApiError) {
          return errorResponseFrom(error);
        }
        console.error("Screen proxy error", error);
        return errorResponseFrom(
          new ApiError(502, "SCREEN_UNAVAILABLE", "远程画面暂时不可用。"),
        );
      }
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await handleApi(request, env, url);
    } catch (error) {
      if (error instanceof ApiError) {
        return errorResponseFrom(error);
      }
      console.error("Unhandled API error", error);
      return errorResponseFrom(
        new ApiError(500, "INTERNAL_ERROR", "服务端出现未处理的错误。"),
      );
    }
  },
};

async function handleApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (url.pathname === "/api/config") {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }
    return json(consoleConfig(env));
  }

  if (url.pathname === "/api/health") {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }
    return json({
      status: "ok",
      version: APP_VERSION,
      authConfigured: Boolean(env.ADMIN_TOKEN),
      browserApiConfigured: Boolean(
        env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_BROWSER_TOKEN,
      ),
      mock: env.BROWSER_MOCK === "true",
    });
  }

  assertAuthorized(request, env.ADMIN_TOKEN);

  if (url.pathname === "/api/verify") {
    if (request.method !== "POST") {
      return methodNotAllowed("POST");
    }
    return json({ ok: true, ...consoleConfig(env) });
  }

  const ticketMatch = /^\/api\/sessions\/([\w-]+)\/screen-ticket$/.exec(
    url.pathname,
  );
  if (ticketMatch) {
    if (request.method !== "POST") {
      return methodNotAllowed("POST");
    }
    const sessionId = ticketMatch[1];
    const ticket = await createScreenTicket(
      env.ADMIN_TOKEN as string,
      sessionId,
      DEFAULT_TICKET_TTL_SECONDS,
    );
    return json({
      url: `/screen/${sessionId}/?t=${encodeURIComponent(ticket)}`,
      expiresInSeconds: DEFAULT_TICKET_TTL_SECONDS,
    });
  }

  if (url.pathname === "/api/sessions" || url.pathname.startsWith("/api/sessions/")) {
    return forwardToSessionHub(request, env, url);
  }

  throw ApiError.notFound();
}

/**
 * Streams a container session's desktop to the console. The `<iframe>` cannot
 * send an Authorization header, so access is proven by a signed, short-lived,
 * session-scoped ticket instead. noVNC only carries the ticket on its first
 * request, so once validated the ticket is remembered in a host-only cookie
 * for the subresources and the WebSocket upgrade.
 */
async function handleScreen(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "服务端尚未设置 ADMIN_TOKEN。");
  }

  const match = /^\/screen\/([\w-]+)(\/.*)?$/.exec(url.pathname);
  if (!match) {
    throw ApiError.notFound();
  }
  const sessionId = match[1];
  const rest = match[2] ?? "/";

  const supplied =
    url.searchParams.get("t") ?? screenCookie(request, sessionId) ?? "";
  const ticket = supplied
    ? await verifyScreenTicket(env.ADMIN_TOKEN, supplied, sessionId)
    : null;
  if (!ticket) {
    throw new ApiError(401, "INVALID_SCREEN_TICKET", "画面访问票据无效或已过期。");
  }

  const target = new URL(`https://container.internal${rest}${url.search}`);
  target.searchParams.delete("t");

  const container = env.BROWSER_CONTAINERS.getByName(sessionId);
  const response = await container.fetch(
    new Request(target, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    }),
  );

  // WebSocket upgrades must be returned untouched.
  if (response.webSocket) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "no-referrer");
  if (url.searchParams.has("t")) {
    headers.append(
      "set-cookie",
      `cb_screen_${sessionId}=${supplied}; Path=/screen/${sessionId}/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DEFAULT_TICKET_TTL_SECONDS}`,
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function screenCookie(request: Request, sessionId: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)cb_screen_${sessionId}=([^;]+)`).exec(
    cookies,
  );
  return match ? match[1] : null;
}

async function forwardToSessionHub(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const bodyText = await readBoundedBody(request);
  const hub = env.BROWSER_SESSIONS.getByName(OWNER);
  const internalUrl = new URL(
    `https://session.internal${url.pathname.slice("/api".length)}${url.search}`,
  );

  const response = await hub.fetch(
    new Request(internalUrl, {
      method: request.method,
      headers: { "content-type": "application/json" },
      body: bodyText,
    }),
  );

  return withApiHeaders(response);
}

async function readBoundedBody(request: Request): Promise<string | undefined> {
  if (request.method !== "POST" && request.method !== "PUT") {
    return undefined;
  }

  const declared = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "请求内容过大。");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "请求内容过大。");
  }
  return text || undefined;
}

function consoleConfig(env: Env) {
  return {
    version: APP_VERSION,
    authConfigured: Boolean(env.ADMIN_TOKEN),
    mock: env.BROWSER_MOCK === "true",
    sessionTtlSeconds: configuredSessionTtlSeconds(
      env.BROWSER_SESSION_TTL_SECONDS,
    ),
    maxSessions: configuredMaxSessions(env.MAX_CONCURRENT_SESSIONS),
    limits: {
      maxSessionTtlSeconds: MAX_SESSION_TTL_SECONDS,
      maxExtensionSeconds: MAX_EXTENSION_SECONDS,
      maxExtensions: MAX_EXTENSIONS_PER_SESSION,
      viewport: {
        minWidth: MIN_VIEWPORT_WIDTH,
        maxWidth: MAX_VIEWPORT_WIDTH,
        minHeight: MIN_VIEWPORT_HEIGHT,
        maxHeight: MAX_VIEWPORT_HEIGHT,
        maxDeviceScaleFactor: MAX_DEVICE_SCALE_FACTOR,
      },
    },
    devicePresets: DEVICE_PRESETS,
    locales: LOCALE_OPTIONS,
    timezones: TIMEZONE_OPTIONS,
    regions: REGION_OPTIONS,
    regionProfiles: REGION_PROFILES,
    userAgentPresets: USER_AGENT_PRESETS,
    blockableResources: BLOCKABLE_RESOURCES,
  };
}
