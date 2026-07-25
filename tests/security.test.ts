import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  isBrowserRequestAllowed,
  normalizeTargetUrl,
} from "../src/security";

describe("normalizeTargetUrl", () => {
  it("adds HTTPS and removes fragments", () => {
    expect(normalizeTargetUrl("example.com/path#private")).toBe(
      "https://example.com/path",
    );
  });

  it("allows public HTTP and HTTPS URLs", () => {
    expect(normalizeTargetUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeTargetUrl("https://[2606:4700:4700::1111]/")).toBe(
      "https://[2606:4700:4700::1111]/",
    );
  });

  it.each([
    "ftp://example.com/file",
    "http://localhost",
    "http://service.internal",
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://10.1.2.3",
    "http://100.64.0.1",
    "http://169.254.169.254/latest/meta-data",
    "http://172.31.1.1",
    "http://192.168.1.1",
    "http://198.18.0.1",
    "http://224.0.0.1",
    "http://[::1]",
    "http://[fc00::1]",
    "http://[fe80::1]",
    "http://[2001:db8::1]",
    "https://user:password@example.com",
    "https://example.com:8443",
  ])("rejects private or unsafe target %s", (target) => {
    expect(() => normalizeTargetUrl(target)).toThrow();
  });
});

describe("isBrowserRequestAllowed", () => {
  it("allows page data URLs and public subresources", () => {
    expect(isBrowserRequestAllowed("data:image/png;base64,AA==")).toBe(true);
    expect(isBrowserRequestAllowed("https://cdn.example.com/app.js")).toBe(true);
  });

  it("blocks unsafe redirects and browser protocols", () => {
    expect(isBrowserRequestAllowed("http://169.254.169.254/")).toBe(false);
    expect(isBrowserRequestAllowed("file:///etc/passwd")).toBe(false);
    expect(isBrowserRequestAllowed("chrome://settings")).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("compares tokens without early length exits", () => {
    expect(constantTimeEqual("correct-token", "correct-token")).toBe(true);
    expect(constantTimeEqual("correct-token", "wrong-token")).toBe(false);
    expect(constantTimeEqual("", "wrong-token")).toBe(false);
  });
});
