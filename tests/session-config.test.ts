import { describe, expect, it } from "vitest";

import {
  browserKeepAliveMilliseconds,
  configuredSessionTtlSeconds,
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

describe("browserKeepAliveMilliseconds", () => {
  it("respects Cloudflare's ten-minute inactivity limit", () => {
    expect(browserKeepAliveMilliseconds(60)).toBe(60_000);
    expect(browserKeepAliveMilliseconds(3600)).toBe(600_000);
  });
});
