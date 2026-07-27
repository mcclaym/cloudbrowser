import type { Page } from "@cloudflare/puppeteer";
import { describe, expect, it, vi } from "vitest";

import {
  applyBrowserSettings,
  BLOCKABLE_RESOURCES,
  defaultBrowserSettings,
  describeBrowserSettings,
  DEVICE_PRESETS,
  LOCALE_OPTIONS,
  normalizeBrowserSettings,
  REGION_OPTIONS,
  TIMEZONE_OPTIONS,
} from "../src/browser-settings";

describe("normalizeBrowserSettings", () => {
  it("uses a desktop-sized viewport and system preferences by default", () => {
    expect(normalizeBrowserSettings(undefined)).toEqual({
      viewport: {
        width: 1920,
        height: 1080,
        isMobile: false,
        hasTouch: false,
        deviceScaleFactor: 1,
      },
      colorScheme: "system",
      reducedMotion: false,
      blockedResources: [],
    });
    expect(normalizeBrowserSettings(null)).toEqual(defaultBrowserSettings());
  });

  it("accepts the supported browser controls", () => {
    expect(
      normalizeBrowserSettings({
        viewport: {
          width: 393,
          height: 852,
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 3,
        },
        userAgent: "Test Browser/1.0",
        locale: "zh-CN",
        timezone: "Asia/Shanghai",
        region: "JP",
        colorScheme: "dark",
        reducedMotion: true,
        blockedResources: ["media", "image", "image"],
        geolocation: {
          latitude: 31.2304,
          longitude: 121.4737,
          accuracy: 25,
        },
      }),
    ).toEqual({
      viewport: {
        width: 393,
        height: 852,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
      userAgent: "Test Browser/1.0",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      region: "JP",
      colorScheme: "dark",
      reducedMotion: true,
      blockedResources: ["image", "media"],
      geolocation: {
        latitude: 31.2304,
        longitude: 121.4737,
        accuracy: 25,
      },
    });
  });

  it.each([
    [{ viewport: { width: 319 } }, "视口宽度"],
    [{ viewport: { height: 1601 } }, "视口高度"],
    [{ viewport: { deviceScaleFactor: 4 } }, "像素比"],
    [{ userAgent: "Browser\r\nX-Test: injected" }, "换行符"],
    [{ locale: "invalid" }, "浏览器语言"],
    [{ timezone: "Mars/Olympus" }, "浏览器时区"],
    [{ region: "XX" }, "出口区域"],
    [{ colorScheme: "sepia" }, "配色模式"],
    [{ blockedResources: "image" }, "数组"],
    [{ blockedResources: ["script"] }, "拦截"],
    [{ reducedMotion: "yes" }, "布尔值"],
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

  it("reports the offending field so the console can highlight it", () => {
    expect(() => normalizeBrowserSettings({ locale: "nope" })).toThrowError(
      expect.objectContaining({ field: "locale" }),
    );
  });
});

describe("catalogues exposed to the console", () => {
  it("keeps preset and option values unique and bilingual", () => {
    for (const options of [
      DEVICE_PRESETS,
      LOCALE_OPTIONS,
      TIMEZONE_OPTIONS,
      REGION_OPTIONS,
    ]) {
      const values = options.map((option) => option.value);
      expect(new Set(values).size).toBe(values.length);
      expect(options.every((option) => option.label && option.labelZh)).toBe(true);
    }
  });

  it("only advertises resources the request guard understands", () => {
    expect(BLOCKABLE_RESOURCES).toEqual(["image", "media", "font", "stylesheet"]);
  });

  it("summarizes settings for status displays", () => {
    const settings = normalizeBrowserSettings({
      viewport: { width: 1024, height: 768, isMobile: true },
      region: "SG",
      locale: "en-US",
      blockedResources: ["image"],
    });
    expect(describeBrowserSettings(settings)).toBe(
      "1024×768 · mobile · SG · en-US · block:image",
    );
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
        width: 393,
        height: 852,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
      userAgent: "Test Browser/1.0",
      locale: "ja-JP",
      timezone: "Asia/Tokyo",
      colorScheme: "dark",
      reducedMotion: true,
      geolocation: { latitude: 35.68, longitude: 139.69, accuracy: 10 },
    });

    await applyBrowserSettings(page, settings, "https://example.com/path");

    expect(page.setViewport).toHaveBeenCalledWith({
      width: 393,
      height: 852,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });
    expect(page.setUserAgent).toHaveBeenCalledWith("Test Browser/1.0");
    expect(page.setExtraHTTPHeaders).toHaveBeenCalledWith({
      "Accept-Language": "ja-JP,ja;q=0.9",
    });
    expect(send).toHaveBeenCalledWith("Emulation.setLocaleOverride", {
      locale: "ja-JP",
    });
    expect(detach).toHaveBeenCalledOnce();
    expect(page.emulateTimezone).toHaveBeenCalledWith("Asia/Tokyo");
    expect(page.emulateMediaFeatures).toHaveBeenCalledWith([
      { name: "prefers-color-scheme", value: "dark" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    expect(overridePermissions).toHaveBeenCalledWith("https://example.com", [
      "geolocation",
    ]);
    expect(page.setGeolocation).toHaveBeenCalledWith({
      latitude: 35.68,
      longitude: 139.69,
      accuracy: 10,
    });
  });

  it("leaves media emulation untouched for system defaults", async () => {
    const page = {
      setViewport: vi.fn().mockResolvedValue(undefined),
      emulateMediaFeatures: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await applyBrowserSettings(
      page,
      defaultBrowserSettings(),
      "https://example.com/",
    );

    expect(page.emulateMediaFeatures).not.toHaveBeenCalled();
  });
});
