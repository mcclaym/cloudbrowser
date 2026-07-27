import { describe, expect, it } from "vitest";

import { defaultBrowserSettings } from "../src/browser-settings";
import { MAX_SESSION_HISTORY_ENTRIES } from "../src/session-config";
import {
  hostnameOf,
  isExpired,
  nextAlarmAt,
  pushHistory,
  sessionKey,
  sortSessions,
  toPublicSession,
} from "../src/session-store";
import type { SessionRecord } from "../src/types";

const NOW = 1_700_000_000_000;

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "abc123",
    browserSessionId: "cf-session-id-1234567890",
    targetUrl: "https://example.com/docs",
    createdAt: NOW,
    expiresAt: NOW + 600_000,
    ttlSeconds: 600,
    extensions: 0,
    navigations: 1,
    lastActivityAt: NOW,
    settings: defaultBrowserSettings(),
    mock: false,
    history: [{ url: "https://example.com/docs", at: NOW }],
    ...overrides,
  };
}

describe("toPublicSession", () => {
  it("never exposes the Browser Run session id", () => {
    const session = toPublicSession(record(), NOW + 60_000);
    expect(JSON.stringify(session)).not.toContain("cf-session-id-1234567890");
    expect(session.ref).toBe("cf-sessi");
    expect(session.hostname).toBe("example.com");
    expect(session.remainingSeconds).toBe(540);
    expect(session.extensionsRemaining).toBe(12);
  });

  it("clamps the countdown at zero once expired", () => {
    expect(toPublicSession(record(), NOW + 900_000).remainingSeconds).toBe(0);
    expect(isExpired(record(), NOW + 900_000)).toBe(true);
    expect(isExpired(record(), NOW)).toBe(false);
  });
});

describe("pushHistory", () => {
  it("collapses repeated visits to the same URL", () => {
    const history = pushHistory(
      [{ url: "https://example.com/", at: NOW }],
      { url: "https://example.com/", title: "Example", at: NOW + 1000 },
    );
    expect(history).toHaveLength(1);
    expect(history[0].title).toBe("Example");
  });

  it("keeps only the most recent entries", () => {
    let history: Array<{ url: string; at: number }> = [];
    for (let index = 0; index < MAX_SESSION_HISTORY_ENTRIES + 10; index += 1) {
      history = pushHistory(history, {
        url: `https://example.com/${index}`,
        at: NOW + index,
      });
    }
    expect(history).toHaveLength(MAX_SESSION_HISTORY_ENTRIES);
    expect(history[0].url).toBe("https://example.com/10");
  });
});

describe("nextAlarmAt", () => {
  it("returns null when nothing is running", () => {
    expect(nextAlarmAt([], NOW)).toBeNull();
  });

  it("fires at the earliest expiry for short sessions", () => {
    const alarm = nextAlarmAt(
      [
        record({ expiresAt: NOW + 300_000 }),
        record({ id: "second", expiresAt: NOW + 120_000 }),
      ],
      NOW,
    );
    expect(alarm).toBe(NOW + 120_000);
  });

  it("schedules a heartbeat for sessions longer than keep_alive", () => {
    const alarm = nextAlarmAt(
      [record({ ttlSeconds: 3600, expiresAt: NOW + 3_600_000 })],
      NOW,
      240_000,
    );
    expect(alarm).toBe(NOW + 240_000);
  });

  it("does not heartbeat mock sessions", () => {
    const alarm = nextAlarmAt(
      [record({ mock: true, ttlSeconds: 3600, expiresAt: NOW + 3_600_000 })],
      NOW,
      240_000,
    );
    expect(alarm).toBe(NOW + 3_600_000);
  });

  it("never schedules an alarm in the past", () => {
    expect(nextAlarmAt([record({ expiresAt: NOW - 10_000 })], NOW)).toBe(
      NOW + 1000,
    );
  });
});

describe("helpers", () => {
  it("prefixes storage keys", () => {
    expect(sessionKey("abc")).toBe("session:abc");
  });

  it("orders sessions by creation time", () => {
    const ordered = sortSessions([
      record({ id: "b", createdAt: NOW + 10 }),
      record({ id: "a", createdAt: NOW }),
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("falls back to the raw value for unparseable URLs", () => {
    expect(hostnameOf("not a url")).toBe("not a url");
  });
});
