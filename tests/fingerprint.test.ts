import { describe, expect, it } from "vitest";

import {
  DEVICE_PRESETS,
  fingerprintIssues,
  LOCALE_OPTIONS,
  REGION_OPTIONS,
  REGION_PROFILES,
  resolveUserAgent,
  regionProfile,
  suggestedUaPreset,
  TIMEZONE_OPTIONS,
  uaPlatformOf,
  USER_AGENT_PRESETS,
  userAgentPresetByValue,
} from "../src/browser-settings";
import * as web from "../public/js/fingerprint.js";

/** The same catalogues the Worker ships to the console through /api/config. */
const catalogues = {
  devicePresets: DEVICE_PRESETS,
  userAgentPresets: USER_AGENT_PRESETS,
  regionProfiles: REGION_PROFILES,
};

describe("user agent presets", () => {
  it("covers every region option with a profile", () => {
    for (const region of REGION_OPTIONS) {
      expect(REGION_PROFILES[region.value]).toBeDefined();
    }
  });

  it("only references locales and timezones the API accepts", () => {
    const locales = new Set(LOCALE_OPTIONS.map((option) => option.value));
    const timezones = new Set(TIMEZONE_OPTIONS.map((option) => option.value));
    for (const [region, profile] of Object.entries(REGION_PROFILES)) {
      expect(`${region}:${locales.has(profile.locale)}`).toBe(`${region}:true`);
      expect(`${region}:${timezones.has(profile.timezone)}`).toBe(
        `${region}:true`,
      );
    }
  });

  it("gives every device preset a UA of the matching platform", () => {
    for (const device of DEVICE_PRESETS) {
      const preset = userAgentPresetByValue(device.uaPreset);
      expect(`${device.value}:${preset?.platform}`).toBe(
        `${device.value}:${device.isMobile ? "mobile" : "desktop"}`,
      );
    }
  });

  it("ships plausible UA strings rather than placeholders", () => {
    for (const preset of USER_AGENT_PRESETS) {
      expect(preset.userAgent.startsWith("Mozilla/5.0 (")).toBe(true);
      expect(preset.userAgent).not.toMatch(/[\r\n]/);
      expect(preset.userAgent.length).toBeLessThanOrEqual(512);
    }
  });

  it("resolves the UA choice into the string sent to the browser", () => {
    expect(resolveUserAgent("", "ignored")).toBe("");
    expect(resolveUserAgent("custom", "  My Agent/1.0  ")).toBe("My Agent/1.0");
    expect(resolveUserAgent("chrome-mac", "")).toContain("Macintosh");
    expect(resolveUserAgent("nope", "")).toBe("");
  });

  it("treats the Browser Run default as a desktop UA", () => {
    expect(uaPlatformOf("")).toBe("desktop");
    expect(uaPlatformOf("safari-ios")).toBe("mobile");
    expect(uaPlatformOf("custom")).toBe("unknown");
  });

  it("suggests the UA that belongs with a device", () => {
    expect(suggestedUaPreset("phone-android")).toBe("chrome-android");
    expect(suggestedUaPreset("unknown-device")).toBeUndefined();
  });
});

describe("fingerprintIssues", () => {
  const base = {
    region: "JP",
    locale: "ja-JP",
    timezone: "Asia/Tokyo",
    deviceMobile: false,
    uaMode: "chrome-win",
  };

  it("is quiet when every signal agrees", () => {
    expect(fingerprintIssues(base)).toEqual([]);
  });

  it("flags a locale that contradicts the exit region", () => {
    expect(fingerprintIssues({ ...base, locale: "zh-CN" })).toEqual([
      { code: "region-locale", suggestion: "ja-JP" },
    ]);
  });

  it("flags a timezone that contradicts the exit region", () => {
    expect(fingerprintIssues({ ...base, timezone: "America/Vancouver" })).toEqual(
      [{ code: "region-timezone", suggestion: "Asia/Tokyo" }],
    );
  });

  it("flags a desktop UA on a mobile viewport", () => {
    const issues = fingerprintIssues({ ...base, deviceMobile: true });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("device-ua");
    expect(uaPlatformOf(issues[0].suggestion)).toBe("mobile");
  });

  it("ignores unset fields and the automatic region", () => {
    expect(
      fingerprintIssues({
        region: "",
        locale: "",
        timezone: "",
        deviceMobile: false,
        uaMode: "",
      }),
    ).toEqual([]);
    expect(regionProfile(undefined)).toBeUndefined();
  });

  it("never second-guesses a hand-written UA", () => {
    expect(
      fingerprintIssues({ ...base, deviceMobile: true, uaMode: "custom" }),
    ).toEqual([]);
  });

  it("reports several mismatches at once", () => {
    expect(
      fingerprintIssues({
        region: "DE",
        locale: "zh-CN",
        timezone: "Asia/Shanghai",
        deviceMobile: true,
        uaMode: "chrome-win",
      }).map((issue) => issue.code),
    ).toEqual(["region-locale", "region-timezone", "device-ua"]);
  });
});

describe("console and Worker agree", () => {
  const regions = ["", "JP", "DE", "US"];
  const locales = ["", "ja-JP", "zh-CN", "de-DE"];
  const timezones = ["", "Asia/Tokyo", "Europe/Berlin"];
  const uaModes = ["", "custom", "chrome-win", "safari-ios", "chrome-android"];

  it("produces identical issues across the whole input matrix", () => {
    let checked = 0;
    for (const region of regions) {
      for (const locale of locales) {
        for (const timezone of timezones) {
          for (const deviceMobile of [false, true]) {
            for (const uaMode of uaModes) {
              const input = { region, locale, timezone, deviceMobile, uaMode };
              expect(web.fingerprintIssues(catalogues, input)).toEqual(
                fingerprintIssues(input),
              );
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBe(
      regions.length * locales.length * timezones.length * 2 * uaModes.length,
    );
  });

  it("resolves user agents identically", () => {
    for (const mode of [...uaModes, "unknown"]) {
      expect(web.resolveUserAgent(catalogues, mode, " Custom/1 ")).toBe(
        resolveUserAgent(mode, " Custom/1 "),
      );
      expect(web.uaPlatformOf(catalogues, mode)).toBe(uaPlatformOf(mode));
    }
    for (const device of [...DEVICE_PRESETS.map((p) => p.value), "nope"]) {
      expect(web.suggestedUaPreset(catalogues, device)).toBe(
        suggestedUaPreset(device),
      );
    }
  });
});

describe("alignSettings", () => {
  it("fills locale and timezone from the region and fixes the UA", () => {
    const aligned = web.alignSettings(
      catalogues,
      { region: "JP", locale: "", timezone: "", uaMode: "chrome-win" },
      true,
    );
    expect(aligned).toEqual({
      region: "JP",
      locale: "ja-JP",
      timezone: "Asia/Tokyo",
      uaMode: "safari-ios",
    });
    expect(web.fingerprintIssues(catalogues, { ...aligned, deviceMobile: true })).toEqual(
      [],
    );
  });

  it("leaves an automatic region and a custom UA alone", () => {
    const settings = { region: "", locale: "zh-CN", timezone: "", uaMode: "custom" };
    expect(web.alignSettings(catalogues, settings, true)).toEqual(settings);
  });
});
