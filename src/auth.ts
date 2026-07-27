import { ApiError } from "./http";
import { constantTimeEqual } from "./security";

export const FAILURES_BEFORE_THROTTLE = 5;
export const MAX_THROTTLE_SECONDS = 300;
/** Failure counters older than this are forgotten. */
export const THROTTLE_MEMORY_MS = 15 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 5000;

interface AttemptRecord {
  failures: number;
  blockedUntil: number;
  updatedAt: number;
}

/**
 * Best-effort brute force protection. Counters live in the Worker isolate, so
 * they are not shared globally — they only raise the cost of guessing without
 * adding a round trip to storage on every request.
 */
export class LoginThrottle {
  private readonly attempts = new Map<string, AttemptRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Seconds the caller must wait, or 0 when the request may proceed. */
  retryAfter(clientKey: string): number {
    const record = this.attempts.get(clientKey);
    if (!record) {
      return 0;
    }
    const remaining = record.blockedUntil - this.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  recordFailure(clientKey: string): number {
    this.prune();
    const now = this.now();
    const record = this.attempts.get(clientKey) ?? {
      failures: 0,
      blockedUntil: 0,
      updatedAt: now,
    };
    record.failures += 1;
    record.updatedAt = now;

    if (record.failures >= FAILURES_BEFORE_THROTTLE) {
      const penalty = Math.min(
        MAX_THROTTLE_SECONDS,
        2 ** (record.failures - FAILURES_BEFORE_THROTTLE + 1),
      );
      record.blockedUntil = now + penalty * 1000;
    }

    this.attempts.set(clientKey, record);
    return this.retryAfter(clientKey);
  }

  recordSuccess(clientKey: string): void {
    this.attempts.delete(clientKey);
  }

  private prune(): void {
    const now = this.now();
    for (const [key, record] of this.attempts) {
      if (now - record.updatedAt > THROTTLE_MEMORY_MS) {
        this.attempts.delete(key);
      }
    }
    if (this.attempts.size > MAX_TRACKED_CLIENTS) {
      const overflow = this.attempts.size - MAX_TRACKED_CLIENTS;
      let removed = 0;
      for (const key of this.attempts.keys()) {
        this.attempts.delete(key);
        removed += 1;
        if (removed >= overflow) {
          break;
        }
      }
    }
  }
}

export const loginThrottle = new LoginThrottle();

export function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}

/**
 * Throws an {@link ApiError} when the caller may not use the protected API.
 */
export function assertAuthorized(
  request: Request,
  adminToken: string | undefined,
  throttle: LoginThrottle = loginThrottle,
): void {
  if (!adminToken) {
    throw new ApiError(
      503,
      "AUTH_NOT_CONFIGURED",
      "服务端尚未设置 ADMIN_TOKEN。",
    );
  }

  const key = clientKey(request);
  const waitSeconds = throttle.retryAfter(key);
  if (waitSeconds > 0) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "尝试次数过多，请稍后再试。", {
      retryAfter: waitSeconds,
    });
  }

  const supplied = bearerToken(request);
  if (!supplied || !constantTimeEqual(supplied, adminToken)) {
    const retryAfter = throttle.recordFailure(key);
    throw new ApiError(401, "UNAUTHORIZED", "访问口令不正确。", {
      retryAfter: retryAfter || undefined,
    });
  }

  throttle.recordSuccess(key);
}
