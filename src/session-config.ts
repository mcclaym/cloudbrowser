export const DEFAULT_SESSION_TTL_SECONDS = 600;
export const MIN_SESSION_TTL_SECONDS = 60;
export const MAX_SESSION_TTL_SECONDS = 86_400;
export const MAX_BROWSER_KEEP_ALIVE_SECONDS = 600;

export function configuredSessionTtlSeconds(value?: string): number {
  const configured = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(configured)) {
    return DEFAULT_SESSION_TTL_SECONDS;
  }

  return Math.min(
    MAX_SESSION_TTL_SECONDS,
    Math.max(MIN_SESSION_TTL_SECONDS, configured),
  );
}

export function browserKeepAliveMilliseconds(sessionTtlSeconds: number): number {
  return (
    Math.min(MAX_BROWSER_KEEP_ALIVE_SECONDS, sessionTtlSeconds) *
    1000
  );
}
