import { constantTimeEqual } from "./security";

/**
 * Short-lived capability tokens for the container screen proxy.
 *
 * An `<iframe>` cannot attach an Authorization header, so the console asks an
 * authenticated endpoint for a ticket and puts it in the screen URL. Tickets
 * are HMAC-signed with a key derived from ADMIN_TOKEN, scoped to one session
 * and valid for minutes, so a leaked screen URL cannot be replayed later or
 * against another session.
 */

export const DEFAULT_TICKET_TTL_SECONDS = 900;
export const MAX_TICKET_TTL_SECONDS = 3600;

export interface ScreenTicket {
  /** Session id the ticket grants access to. */
  sid: string;
  /** Expiry as epoch seconds. */
  exp: number;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`cloudbrowser-screen:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(secret: string, message: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(message),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createScreenTicket(
  secret: string,
  sessionId: string,
  ttlSeconds = DEFAULT_TICKET_TTL_SECONDS,
  now = Date.now(),
): Promise<string> {
  const ttl = Math.min(
    MAX_TICKET_TTL_SECONDS,
    Math.max(30, Math.floor(ttlSeconds)),
  );
  const payload: ScreenTicket = {
    sid: sessionId,
    exp: Math.floor(now / 1000) + ttl,
  };
  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return `${body}.${await sign(secret, body)}`;
}

/**
 * Returns the ticket payload, or null when the ticket is malformed, forged,
 * expired or issued for a different session.
 */
export async function verifyScreenTicket(
  secret: string,
  ticket: string,
  sessionId: string,
  now = Date.now(),
): Promise<ScreenTicket | null> {
  const separator = ticket.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }

  const body = ticket.slice(0, separator);
  const signature = ticket.slice(separator + 1);
  if (!constantTimeEqual(signature, await sign(secret, body))) {
    return null;
  }

  const decoded = base64UrlDecode(body);
  if (!decoded) {
    return null;
  }

  let payload: ScreenTicket;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decoded));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as ScreenTicket).sid !== "string" ||
      typeof (parsed as ScreenTicket).exp !== "number"
    ) {
      return null;
    }
    payload = parsed as ScreenTicket;
  } catch {
    return null;
  }

  if (payload.sid !== sessionId) {
    return null;
  }
  if (payload.exp * 1000 <= now) {
    return null;
  }
  return payload;
}
