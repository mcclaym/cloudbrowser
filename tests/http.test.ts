import { describe, expect, it } from "vitest";

import {
  ApiError,
  binaryResponse,
  errorResponseFrom,
  json,
  readJsonBody,
  sanitizeFileName,
} from "../src/http";

describe("json", () => {
  it("always sends no-store and hardening headers", async () => {
    const response = json({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("errorResponseFrom", () => {
  it("serializes the code, field and retry hint", async () => {
    const response = errorResponseFrom(
      new ApiError(429, "TOO_MANY_ATTEMPTS", "慢一点", { retryAfter: 12 }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(await response.json()).toEqual({
      error: { code: "TOO_MANY_ATTEMPTS", message: "慢一点", retryAfter: 12 },
    });
  });

  it("includes the offending field when present", async () => {
    const response = errorResponseFrom(
      ApiError.badRequest("INVALID_BROWSER_SETTINGS", "语言不支持", "locale"),
    );
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_BROWSER_SETTINGS",
        message: "语言不支持",
        field: "locale",
      },
    });
  });
});

describe("readJsonBody", () => {
  function post(body: string, headers: Record<string, string> = {}): Request {
    return new Request("https://console.example/api/sessions", {
      method: "POST",
      headers,
      body,
    });
  }

  it("parses objects and treats an empty body as {}", async () => {
    expect(await readJsonBody(post('{"url":"https://example.com"}'))).toEqual({
      url: "https://example.com",
    });
    expect(await readJsonBody(post(""))).toEqual({});
  });

  it("rejects arrays, invalid JSON and oversized payloads", async () => {
    await expect(readJsonBody(post("[1,2,3]"))).rejects.toThrowError(
      expect.objectContaining({ code: "INVALID_JSON" }),
    );
    await expect(readJsonBody(post("{oops}"))).rejects.toThrowError(
      expect.objectContaining({ code: "INVALID_JSON" }),
    );
    await expect(
      readJsonBody(post(`{"url":"${"a".repeat(9000)}"}`)),
    ).rejects.toThrowError(expect.objectContaining({ status: 413 }));
  });

  it("refuses a declared content-length over the limit without reading it", async () => {
    await expect(
      readJsonBody(post("{}", { "content-length": "99999" })),
    ).rejects.toThrowError(expect.objectContaining({ status: 413 }));
  });
});

describe("binaryResponse", () => {
  it("streams bytes as a download", async () => {
    const response = binaryResponse(
      new Uint8Array([1, 2, 3]),
      "image/png",
      "example.com shot.png",
    );
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="example.com-shot.png"',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("keeps file names free of path and quote characters", () => {
    expect(sanitizeFileName('../../etc/"passwd"')).toBe("etc-passwd");
    expect(sanitizeFileName("///")).toBe("cloudbrowser");
  });
});
