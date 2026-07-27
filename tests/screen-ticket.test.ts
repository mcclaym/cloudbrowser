import { describe, expect, it } from "vitest";

import {
  base64UrlDecode,
  base64UrlEncode,
  createScreenTicket,
  DEFAULT_TICKET_TTL_SECONDS,
  MAX_TICKET_TTL_SECONDS,
  verifyScreenTicket,
} from "../src/screen-ticket";

const SECRET = "an-admin-token-long-enough-to-be-real";
const NOW = 1_800_000_000_000;

describe("base64url", () => {
  it("round-trips bytes without padding or unsafe characters", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    const encoded = base64UrlEncode(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(base64UrlDecode(encoded)).toEqual(bytes);
  });

  it("returns null for values that are not base64", () => {
    expect(base64UrlDecode("!!!!")).toBeNull();
  });
});

describe("screen tickets", () => {
  it("accepts a fresh ticket for its own session", async () => {
    const ticket = await createScreenTicket(SECRET, "sess-1", 900, NOW);
    const payload = await verifyScreenTicket(SECRET, ticket, "sess-1", NOW);
    expect(payload).toEqual({ sid: "sess-1", exp: NOW / 1000 + 900 });
  });

  it("rejects a ticket issued for another session", async () => {
    const ticket = await createScreenTicket(SECRET, "sess-1", 900, NOW);
    expect(await verifyScreenTicket(SECRET, ticket, "sess-2", NOW)).toBeNull();
  });

  it("rejects a ticket once it expires", async () => {
    const ticket = await createScreenTicket(SECRET, "sess-1", 60, NOW);
    expect(
      await verifyScreenTicket(SECRET, ticket, "sess-1", NOW + 59_000),
    ).not.toBeNull();
    expect(
      await verifyScreenTicket(SECRET, ticket, "sess-1", NOW + 61_000),
    ).toBeNull();
  });

  it("rejects a ticket signed with a different admin token", async () => {
    const ticket = await createScreenTicket(SECRET, "sess-1", 900, NOW);
    expect(
      await verifyScreenTicket("another-token", ticket, "sess-1", NOW),
    ).toBeNull();
  });

  it("rejects tampered payloads and signatures", async () => {
    const ticket = await createScreenTicket(SECRET, "sess-1", 900, NOW);
    const [body, signature] = ticket.split(".");

    const forgedBody = base64UrlEncode(
      new TextEncoder().encode(
        JSON.stringify({ sid: "sess-1", exp: NOW / 1000 + 999_999 }),
      ),
    );
    expect(
      await verifyScreenTicket(SECRET, `${forgedBody}.${signature}`, "sess-1", NOW),
    ).toBeNull();
    expect(
      await verifyScreenTicket(SECRET, `${body}.${signature}x`, "sess-1", NOW),
    ).toBeNull();
  });

  it.each(["", ".", "no-separator", "a.b", "..."])(
    "rejects malformed ticket %#",
    async (ticket) => {
      expect(await verifyScreenTicket(SECRET, ticket, "sess-1", NOW)).toBeNull();
    },
  );

  it("clamps the requested lifetime", async () => {
    const long = await createScreenTicket(SECRET, "s", 99_999, NOW);
    expect(
      (await verifyScreenTicket(SECRET, long, "s", NOW))?.exp,
    ).toBe(NOW / 1000 + MAX_TICKET_TTL_SECONDS);

    const short = await createScreenTicket(SECRET, "s", 1, NOW);
    expect((await verifyScreenTicket(SECRET, short, "s", NOW))?.exp).toBe(
      NOW / 1000 + 30,
    );
  });

  it("defaults to a lifetime measured in minutes, not hours", () => {
    expect(DEFAULT_TICKET_TTL_SECONDS).toBeLessThanOrEqual(3600);
    expect(DEFAULT_TICKET_TTL_SECONDS).toBeGreaterThanOrEqual(60);
  });

  it("is URL safe so it can travel in a query string", async () => {
    const ticket = await createScreenTicket(SECRET, "sess-1", 900, NOW);
    expect(encodeURIComponent(ticket)).toBe(ticket);
  });
});
