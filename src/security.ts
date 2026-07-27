export class TargetUrlError extends Error {
  readonly code = "INVALID_TARGET_URL";

  constructor(message: string) {
    super(message);
    this.name = "TargetUrlError";
  }
}

export const MAX_TARGET_URL_LENGTH = 2048;

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".home.arpa",
  ".arpa",
  ".onion",
  ".test",
  ".invalid",
  ".example",
];

export function normalizeTargetUrl(input: unknown): string {
  if (typeof input !== "string") {
    throw new TargetUrlError("请输入有效的网址。");
  }

  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_TARGET_URL_LENGTH) {
    throw new TargetUrlError(
      `网址不能为空，且不能超过 ${MAX_TARGET_URL_LENGTH} 个字符。`,
    );
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new TargetUrlError("网址格式不正确。");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new TargetUrlError("只允许访问 HTTP 或 HTTPS 网址。");
  }

  if (parsed.username || parsed.password) {
    throw new TargetUrlError("网址中不能包含用户名或密码。");
  }

  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    throw new TargetUrlError("只允许使用 80 或 443 端口。");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || isBlockedHostname(hostname)) {
    throw new TargetUrlError("该地址属于本机、私有网络或保留地址，不能访问。");
  }

  parsed.hash = "";
  return parsed.toString();
}

export function isBrowserRequestAllowed(rawUrl: string): boolean {
  if (
    rawUrl.startsWith("data:") ||
    rawUrl.startsWith("blob:") ||
    rawUrl === "about:blank"
  ) {
    return true;
  }

  try {
    normalizeTargetUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}

export function isBlockedHostname(rawHostname: string): boolean {
  const hostname = stripIpv6Brackets(rawHostname.toLowerCase().replace(/\.$/, ""));

  if (
    hostname === "localhost" ||
    hostname === "localhost.localdomain" ||
    BLOCKED_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  ) {
    return true;
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4) {
    return isBlockedIpv4(ipv4);
  }

  if (hostname.includes(":")) {
    return isBlockedIpv6(hostname);
  }

  return false;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const values = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return Number.NaN;
    }
    return Number(part);
  });

  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }

  return values as [number, number, number, number];
}

function isBlockedIpv4([a, b]: [number, number, number, number]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 88) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isBlockedIpv6(hostname: string): boolean {
  const withoutZone = hostname.split("%", 1)[0];

  if (withoutZone.includes(".")) {
    const ipv4Tail = withoutZone.slice(withoutZone.lastIndexOf(":") + 1);
    const ipv4 = parseIpv4(ipv4Tail);
    if (ipv4) {
      return isBlockedIpv4(ipv4);
    }
  }

  const expanded = expandIpv6(withoutZone);
  if (!expanded) {
    return true;
  }

  const first = expanded[0];
  const second = expanded[1];

  // Public unicast IPv6 currently lives in 2000::/3. Blocking everything else
  // keeps link-local, loopback, ULA, multicast and transition ranges out.
  if (first < 0x2000 || first > 0x3fff) {
    return true;
  }

  // Documentation prefix 2001:db8::/32.
  return first === 0x2001 && second === 0x0db8;
}

function expandIpv6(address: string): number[] | null {
  if (!/^[0-9a-f:]+$/i.test(address) || (address.match(/::/g) ?? []).length > 1) {
    return null;
  }

  const [leftRaw, rightRaw = ""] = address.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];

  if (!address.includes("::") && left.length !== 8) {
    return null;
  }

  const missing = 8 - left.length - right.length;
  if (missing < 0 || (address.includes("::") && missing < 1)) {
    return null;
  }

  const parts = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
    return null;
  }

  return parts.map((part) => Number.parseInt(part, 16));
}
