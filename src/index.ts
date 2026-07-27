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
  TIMEZONE_OPTIONS,
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

export { BrowserSession } from "./browser-session";

/** Durable Object name that owns every session of the single console user. */
const OWNER = "owner";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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

  if (url.pathname === "/api/sessions" || url.pathname.startsWith("/api/sessions/")) {
    return forwardToSessionHub(request, env, url);
  }

  throw ApiError.notFound();
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
    blockableResources: BLOCKABLE_RESOURCES,
  };
}
