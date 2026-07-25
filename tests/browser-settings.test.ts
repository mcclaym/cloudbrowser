import type { Page } from "@cloudflare/puppeteer";
import { describe, expect, it, vi } from "vitest";

import {
  applyBrowserSettings,
  normalizeBrowserSettings,
} from "../src/browser-settings";

describe("normalizeBrowserSettings", () => {
  it("uses a desktop-sized viewport and system preferences by default", () => {
    expect(normalizeBrowserSettings(undefined)).toEqual({
      viewport: {
        width: 1920,
        height: 1080,
        isMobile: false,
        hasTouch: false,
      },
      colorScheme: "system",
    });
  });

  it("accepts the supported browser controls", () => {
    expect(
      normalizeBrowserSettings({
        viewport: {
          width: 390,
          height: 844,
          isMobile: true,
          hasTouch: true,
        },
        userAgent: "Test Browser/1.0",
        locale: "zh-CN",
        timezone: "Asia/Shanghai",
        colorScheme: "dark",
        geolocation: {
          latitude: 31.2304,
          longitude: 121.4737,
          accuracy: 25,
        },
      }),
    ).toEqual({
      viewport: {
        width: 390,
        height: 844,
        isMobile: true,
        hasTouch: true,
      },
      userAgent: "Test Browser/1.0",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      colorScheme: "dark",
      geolocation: {
        latitude: 31.2304,
        longitude: 121.4737,
        accuracy: 25,
      },
    });
  });

  it.each([
    [{ viewport: { width: 319 } }, "视口宽度"],
    [{ viewport: { height: 1081 } }, "视口高度"],
    [{ userAgent: "Browser\r\nX-Test: injected" }, "换行符"],
    [{ locale: "invalid" }, "浏览器语言"],
    [{ timezone: "Mars/Olympus" }, "浏览器时区"],
    [{ colorScheme: "sepia" }, "配色模式"],
    [
      {
        geolocation: {
          latitude: 91,
          longitude: 0,
          accuracy: 0,
        },
      },
      "纬度",
    ],
  ])("rejects invalid settings %#", (settings, message) => {
    expect(() => normalizeBrowserSettings(settings)).toThrow(message);
  });
});

describe("applyBrowserSettings", () => {
  it("applies settings before navigation using Puppeteer and CDP", async () => {
    const detach = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue(undefined);
    const overridePermissions = vi.fn().mockResolvedValue(undefined);
    const page = {
      setViewport: vi.fn().mockResolvedValue(undefined),
      setUserAgent: vi.fn().mockResolvedValue(undefined),
      setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
      createCDPSession: vi.fn().mockResolvedValue({ send, detach }),
      emulateTimezone: vi.fn().mockResolvedValue(undefined),
      emulateMediaFeatures: vi.fn().mockResolvedValue(undefined),
      browserContext: vi.fn().mockReturnValue({ overridePermissions }),
      setGeolocation: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
    const settings = normalizeBrowserSettings({
      viewport: {
        width: 390,
        height: 844,
        isMobile: true,
        hasTouch: true,
      },
      userAgent: "Test Browser/1.0",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      colorScheme: "dark",
      geolocation: {
        latitude: 31.2304,
        longitude: 121.4737,
        accuracy: 25,
      },
    });

    await applyBrowserSettings(page, settings, "https://example.com/path");

    expect(page.setViewport).toHaveBeenCalledWith({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    expect(page.setUserAgent).toHaveBeenCalledWith("Test Browser/1.0");
    expect(page.setExtraHTTPHeaders).toHaveBeenCalledWith({
      "Accept-Language": "zh-CN,zh;q=0.9",
    });
    expect(send).toHaveBeenCalledWith("Emulation.setLocaleOverride", {
      locale: "zh-CN",
    });
    expect(detach).toHaveBeenCalledOnce();
    expect(page.emulateTimezone).toHaveBeenCalledWith("Asia/Shanghai");
    expect(page.emulateMediaFeatures).toHaveBeenCalledWith([
      { name: "prefers-color-scheme", value: "dark" },
    ]);
    expect(overridePermissions).toHaveBeenCalledWith(
      "https://example.com",
      ["geolocation"],
    );
    expect(page.setGeolocation).toHaveBeenCalledWith({
      latitude: 31.2304,
      longitude: 121.4737,
      accuracy: 25,
    });
  });
});
