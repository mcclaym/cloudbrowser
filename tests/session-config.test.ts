import { describe, expect, it } from "vitest";

import {
  browserKeepAliveMilliseconds,
  configuredMaxSessions,
  configuredSessionTtlSeconds,
  extendedExpiry,
  MAX_SESSION_TTL_SECONDS,
  needsHeartbeat,
} from "../src/session-config";

describe("configuredSessionTtlSeconds", () => {
  it("uses ten minutes by default", () => {
    expect(configuredSessionTtlSeconds()).toBe(600);
    expect(configuredSessionTtlSeconds("not-a-number")).toBe(600);
  });

  it("accepts a one-hour configured session", () => {
    expect(configuredSessionTtlSeconds("3600")).toBe(3600);
  });

  it("keeps configured sessions within safe bounds", () => {
    expect(configuredSessionTtlSeconds("10")).toBe(60);
    expect(configuredSessionTtlSeconds("999999")).toBe(86_400);
  });
});

describe("configuredMaxSessions", () => {
  it("defaults to three concurrent browsers", () => {
    expect(configuredMaxSessions()).toBe(3);
    expect(configuredMaxSessions("")).toBe(3);
  });

  it("clamps to a range Browser Run can serve", () => {
    expect(configuredMaxSessions("1")).toBe(1);
    expect(configuredMaxSessions("0")).toBe(1);
    expect(configuredMaxSessions("50")).toBe(10);
  });
});

describe("browserKeepAliveMilliseconds", () => {
  it("respects Cloudflare's ten-minute inactivity limit", () => {
    expect(browserKeepAliveMilliseconds(60)).toBe(60_000);
    expect(browserKeepAliveMilliseconds(3600)).toBe(600_000);
  });

  it("only long sessions need the reconnect heartbeat", () => {
    expect(needsHeartbeat(600)).toBe(false);
    expect(needsHeartbeat(601)).toBe(true);
  });
});

describe("extendedExpiry", () => {
  const now = 1_000_000;

  it("adds the requested time to the current expiry", () => {
    expect(
      extendedExpiry({
        now,
        createdAt: now - 60_000,
        expiresAt: now + 120_000,
        requestedSeconds: 600,
      }),
    ).toBe(now + 120_000 + 600_000);
  });

  it("counts from now when the session is about to expire", () => {
    expect(
      extendedExpiry({
        now,
        createdAt: now - 600_000,
        expiresAt: now - 1000,
        requestedSeconds: 300,
      }),
    ).toBe(now + 300_000);
  });

  it("never extends past the absolute session lifetime", () => {
    const createdAt = now - MAX_SESSION_TTL_SECONDS * 1000 + 10_000;
    expect(
      extendedExpiry({
        now,
        createdAt,
        expiresAt: now + 5000,
        requestedSeconds: 3600,
      }),
    ).toBe(createdAt + MAX_SESSION_TTL_SECONDS * 1000);
  });

  it("clamps absurd extension requests", () => {
    expect(
      extendedExpiry({
        now,
        createdAt: now,
        expiresAt: now,
        requestedSeconds: 999_999,
      }),
    ).toBe(now + 3600 * 1000);
    expect(
      extendedExpiry({
        now,
        createdAt: now,
        expiresAt: now,
        requestedSeconds: 1,
      }),
    ).toBe(now + 60_000);
  });
});
