export const DEFAULT_SESSION_TTL_SECONDS = 600;
export const MIN_SESSION_TTL_SECONDS = 60;
export const MAX_SESSION_TTL_SECONDS = 86_400;
export const MAX_BROWSER_KEEP_ALIVE_SECONDS = 600;

export const DEFAULT_MAX_SESSIONS = 3;
export const MIN_MAX_SESSIONS = 1;
export const MAX_MAX_SESSIONS = 10;

/**
 * Cloudflare keeps an idle browser for at most `keep_alive` milliseconds, so a
 * session that should outlive that window needs a periodic reconnect.
 */
export const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;

/** Longest single extension granted through `/api/sessions/:id/extend`. */
export const MAX_EXTENSION_SECONDS = 3600;
/** Number of times one session may be extended. */
export const MAX_EXTENSIONS_PER_SESSION = 12;

/** Visited URLs kept per session for the in-console history list. */
export const MAX_SESSION_HISTORY_ENTRIES = 25;

export function configuredSessionTtlSeconds(value?: string): number {
  return clampInteger(
    value,
    DEFAULT_SESSION_TTL_SECONDS,
    MIN_SESSION_TTL_SECONDS,
    MAX_SESSION_TTL_SECONDS,
  );
}

export function configuredMaxSessions(value?: string): number {
  return clampInteger(
    value,
    DEFAULT_MAX_SESSIONS,
    MIN_MAX_SESSIONS,
    MAX_MAX_SESSIONS,
  );
}

export function browserKeepAliveMilliseconds(sessionTtlSeconds: number): number {
  return Math.min(MAX_BROWSER_KEEP_ALIVE_SECONDS, sessionTtlSeconds) * 1000;
}

/**
 * True when a session lives longer than a single `keep_alive` window and
 * therefore needs the Durable Object to reconnect periodically.
 */
export function needsHeartbeat(sessionTtlSeconds: number): boolean {
  return sessionTtlSeconds > MAX_BROWSER_KEEP_ALIVE_SECONDS;
}

/**
 * New expiry for an extension request. A session never lives longer than
 * `MAX_SESSION_TTL_SECONDS` counted from its creation.
 */
export function extendedExpiry(options: {
  now: number;
  createdAt: number;
  expiresAt: number;
  requestedSeconds: number;
}): number {
  const requested = Math.min(
    MAX_EXTENSION_SECONDS,
    Math.max(MIN_SESSION_TTL_SECONDS, Math.floor(options.requestedSeconds)),
  );
  const hardLimit = options.createdAt + MAX_SESSION_TTL_SECONDS * 1000;
  const base = Math.max(options.expiresAt, options.now);
  return Math.min(hardLimit, base + requested * 1000);
}

function clampInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, parsed));
}
