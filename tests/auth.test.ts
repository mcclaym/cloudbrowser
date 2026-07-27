import { describe, expect, it } from "vitest";

import { assertAuthorized, bearerToken, LoginThrottle } from "../src/auth";
import { ApiError } from "../src/http";

function requestWith(token?: string, ip = "203.0.113.9"): Request {
  const headers: Record<string, string> = { "cf-connecting-ip": ip };
  if (token !== undefined) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request("https://console.example/api/sessions", { headers });
}

describe("bearerToken", () => {
  it("only accepts the Bearer scheme", () => {
    expect(bearerToken(requestWith("secret"))).toBe("secret");
    expect(
      bearerToken(
        new Request("https://console.example/api", {
          headers: { authorization: "Basic secret" },
        }),
      ),
    ).toBe("");
  });
});

describe("assertAuthorized", () => {
  it("refuses to run without a configured token", () => {
    expect(() => assertAuthorized(requestWith("secret"), undefined)).toThrowError(
      expect.objectContaining({ code: "AUTH_NOT_CONFIGURED", status: 503 }),
    );
  });

  it("accepts the configured token and clears earlier failures", () => {
    const throttle = new LoginThrottle();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(() =>
        assertAuthorized(requestWith("wrong"), "secret", throttle),
      ).toThrowError(expect.objectContaining({ status: 401 }));
    }
    expect(() =>
      assertAuthorized(requestWith("secret"), "secret", throttle),
    ).not.toThrow();
    expect(throttle.retryAfter("203.0.113.9")).toBe(0);
  });

  it("throttles after repeated failures and recovers with time", () => {
    let now = 1_000_000;
    const throttle = new LoginThrottle(() => now);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() =>
        assertAuthorized(requestWith("wrong"), "secret", throttle),
      ).toThrow();
    }

    let thrown: unknown;
    try {
      assertAuthorized(requestWith("secret"), "secret", throttle);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe("TOO_MANY_ATTEMPTS");
    expect((thrown as ApiError).status).toBe(429);

    now += 5000;
    expect(() =>
      assertAuthorized(requestWith("secret"), "secret", throttle),
    ).not.toThrow();
  });

  it("tracks clients independently", () => {
    const throttle = new LoginThrottle();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect(() =>
        assertAuthorized(requestWith("wrong", "198.51.100.7"), "secret", throttle),
      ).toThrow();
    }
    expect(throttle.retryAfter("198.51.100.7")).toBeGreaterThan(0);
    expect(throttle.retryAfter("203.0.113.9")).toBe(0);
  });
});
