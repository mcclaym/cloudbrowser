import type { Page } from "@cloudflare/puppeteer";

export type BrowserColorScheme = "system" | "light" | "dark";
export type BlockableResource = "image" | "media" | "font" | "stylesheet";

export interface BrowserSettings {
  viewport: {
    width: number;
    height: number;
    isMobile: boolean;
    hasTouch: boolean;
    deviceScaleFactor: number;
  };
  userAgent?: string;
  locale?: string;
  timezone?: string;
  colorScheme: BrowserColorScheme;
  reducedMotion: boolean;
  region?: string;
  blockedResources: BlockableResource[];
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

export class BrowserSettingsError extends Error {
  readonly code = "INVALID_BROWSER_SETTINGS";
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "BrowserSettingsError";
    this.field = field;
  }
}

export interface LabelledOption {
  value: string;
  label: string;
  labelZh: string;
}

export interface DevicePreset extends LabelledOption {
  width: number;
  height: number;
  isMobile: boolean;
  hasTouch: boolean;
  deviceScaleFactor: number;
  /** UA preset that matches this device family, kept fingerprint-coherent. */
  uaPreset: string;
}

export type UaPlatform = "desktop" | "mobile";

export interface UserAgentPreset extends LabelledOption {
  userAgent: string;
  platform: UaPlatform;
}

/** A coherent locale + timezone default for a Browser Run exit region. */
export interface RegionProfile {
  locale: string;
  timezone: string;
}

export type FingerprintIssueCode =
  | "region-locale"
  | "region-timezone"
  | "device-ua";

export interface FingerprintIssue {
  code: FingerprintIssueCode;
  /** Suggested value the auto-fix would apply. */
  suggestion: string;
}

export const MIN_VIEWPORT_WIDTH = 320;
export const MAX_VIEWPORT_WIDTH = 2560;
export const MIN_VIEWPORT_HEIGHT = 400;
export const MAX_VIEWPORT_HEIGHT = 1600;
export const MAX_DEVICE_SCALE_FACTOR = 3;

export const DEVICE_PRESETS: DevicePreset[] = [
  {
    value: "desktop-fhd",
    label: "Desktop — 1920 × 1080",
    labelZh: "桌面最大化 — 1920 × 1080",
    width: 1920,
    height: 1080,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    uaPreset: "chrome-win",
  },
  {
    value: "desktop-qhd",
    label: "Wide desktop — 2560 × 1440",
    labelZh: "宽屏桌面 — 2560 × 1440",
    width: 2560,
    height: 1440,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    uaPreset: "chrome-win",
  },
  {
    value: "laptop",
    label: "Laptop — 1366 × 768",
    labelZh: "笔记本 — 1366 × 768",
    width: 1366,
    height: 768,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    uaPreset: "chrome-win",
  },
  {
    value: "macbook",
    label: "MacBook Air — 1440 × 900",
    labelZh: "MacBook Air — 1440 × 900",
    width: 1440,
    height: 900,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 2,
    uaPreset: "chrome-mac",
  },
  {
    value: "tablet",
    label: "iPad — 1024 × 768",
    labelZh: "平板 iPad — 1024 × 768",
    width: 1024,
    height: 768,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    uaPreset: "safari-ios",
  },
  {
    value: "phone",
    label: "iPhone 15 — 393 × 852",
    labelZh: "手机 iPhone 15 — 393 × 852",
    width: 393,
    height: 852,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    uaPreset: "safari-ios",
  },
  {
    value: "phone-android",
    label: "Pixel 8 — 412 × 915",
    labelZh: "手机 Pixel 8 — 412 × 915",
    width: 412,
    height: 915,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    uaPreset: "chrome-android",
  },
];

export const LOCALE_OPTIONS: LabelledOption[] = [
  { value: "zh-CN", label: "Chinese (Simplified)", labelZh: "简体中文" },
  { value: "zh-TW", label: "Chinese (Traditional)", labelZh: "繁体中文" },
  { value: "en-US", label: "English (US)", labelZh: "英语（美国）" },
  { value: "en-GB", label: "English (UK)", labelZh: "英语（英国）" },
  { value: "ja-JP", label: "Japanese", labelZh: "日语" },
  { value: "ko-KR", label: "Korean", labelZh: "韩语" },
  { value: "fr-FR", label: "French", labelZh: "法语" },
  { value: "de-DE", label: "German", labelZh: "德语" },
  { value: "es-ES", label: "Spanish", labelZh: "西班牙语" },
  { value: "pt-BR", label: "Portuguese (Brazil)", labelZh: "葡萄牙语（巴西）" },
  { value: "ru-RU", label: "Russian", labelZh: "俄语" },
  { value: "ar-SA", label: "Arabic", labelZh: "阿拉伯语" },
];

export const TIMEZONE_OPTIONS: LabelledOption[] = [
  { value: "UTC", label: "UTC", labelZh: "UTC" },
  { value: "America/Vancouver", label: "Vancouver", labelZh: "温哥华" },
  { value: "America/Los_Angeles", label: "Los Angeles", labelZh: "洛杉矶" },
  { value: "America/Chicago", label: "Chicago", labelZh: "芝加哥" },
  { value: "America/New_York", label: "New York", labelZh: "纽约" },
  { value: "America/Sao_Paulo", label: "São Paulo", labelZh: "圣保罗" },
  { value: "Europe/London", label: "London", labelZh: "伦敦" },
  { value: "Europe/Paris", label: "Paris", labelZh: "巴黎" },
  { value: "Europe/Berlin", label: "Berlin", labelZh: "柏林" },
  { value: "Europe/Moscow", label: "Moscow", labelZh: "莫斯科" },
  { value: "Asia/Dubai", label: "Dubai", labelZh: "迪拜" },
  { value: "Asia/Kolkata", label: "Kolkata", labelZh: "加尔各答" },
  { value: "Asia/Shanghai", label: "Shanghai", labelZh: "上海 / 北京" },
  { value: "Asia/Hong_Kong", label: "Hong Kong", labelZh: "香港" },
  { value: "Asia/Taipei", label: "Taipei", labelZh: "台北" },
  { value: "Asia/Tokyo", label: "Tokyo", labelZh: "东京" },
  { value: "Asia/Seoul", label: "Seoul", labelZh: "首尔" },
  { value: "Asia/Singapore", label: "Singapore", labelZh: "新加坡" },
  { value: "Australia/Sydney", label: "Sydney", labelZh: "悉尼" },
];

/**
 * Browser Run can pin the remote Chrome to a country. Only a curated subset is
 * exposed so the console stays readable.
 */
export const REGION_OPTIONS: LabelledOption[] = [
  { value: "US", label: "United States", labelZh: "美国" },
  { value: "CA", label: "Canada", labelZh: "加拿大" },
  { value: "GB", label: "United Kingdom", labelZh: "英国" },
  { value: "DE", label: "Germany", labelZh: "德国" },
  { value: "FR", label: "France", labelZh: "法国" },
  { value: "NL", label: "Netherlands", labelZh: "荷兰" },
  { value: "ES", label: "Spain", labelZh: "西班牙" },
  { value: "BR", label: "Brazil", labelZh: "巴西" },
  { value: "JP", label: "Japan", labelZh: "日本" },
  { value: "KR", label: "South Korea", labelZh: "韩国" },
  { value: "SG", label: "Singapore", labelZh: "新加坡" },
  { value: "HK", label: "Hong Kong", labelZh: "香港" },
  { value: "TW", label: "Taiwan", labelZh: "台湾" },
  { value: "AU", label: "Australia", labelZh: "澳大利亚" },
  { value: "IN", label: "India", labelZh: "印度" },
];

/**
 * Realistic User-Agent strings so the console never sends an obviously forged
 * UA. Versions are plausible-but-static; refresh them as Chrome/Safari ship.
 * `default` keeps Browser Run's own UA (a desktop Linux Chrome).
 */
export const USER_AGENT_PRESETS: UserAgentPreset[] = [
  {
    value: "chrome-win",
    label: "Chrome · Windows",
    labelZh: "Chrome · Windows",
    platform: "desktop",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  },
  {
    value: "chrome-mac",
    label: "Chrome · macOS",
    labelZh: "Chrome · macOS",
    platform: "desktop",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  },
  {
    value: "safari-mac",
    label: "Safari · macOS",
    labelZh: "Safari · macOS",
    platform: "desktop",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  },
  {
    value: "safari-ios",
    label: "Safari · iPhone",
    labelZh: "Safari · iPhone",
    platform: "mobile",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
  {
    value: "chrome-android",
    label: "Chrome · Android",
    labelZh: "Chrome · Android",
    platform: "mobile",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  },
];

/**
 * Coherent locale + timezone defaults per exit region. Every value here must
 * exist in {@link LOCALE_OPTIONS} / {@link TIMEZONE_OPTIONS} (guarded by tests)
 * so selecting a region can auto-align the fingerprint.
 */
export const REGION_PROFILES: Record<string, RegionProfile> = {
  US: { locale: "en-US", timezone: "America/New_York" },
  CA: { locale: "en-US", timezone: "America/Vancouver" },
  GB: { locale: "en-GB", timezone: "Europe/London" },
  DE: { locale: "de-DE", timezone: "Europe/Berlin" },
  FR: { locale: "fr-FR", timezone: "Europe/Paris" },
  NL: { locale: "en-GB", timezone: "Europe/Paris" },
  ES: { locale: "es-ES", timezone: "Europe/Paris" },
  BR: { locale: "pt-BR", timezone: "America/Sao_Paulo" },
  JP: { locale: "ja-JP", timezone: "Asia/Tokyo" },
  KR: { locale: "ko-KR", timezone: "Asia/Seoul" },
  SG: { locale: "en-GB", timezone: "Asia/Singapore" },
  HK: { locale: "zh-TW", timezone: "Asia/Hong_Kong" },
  TW: { locale: "zh-TW", timezone: "Asia/Taipei" },
  AU: { locale: "en-GB", timezone: "Australia/Sydney" },
  IN: { locale: "en-GB", timezone: "Asia/Kolkata" },
};

export const BLOCKABLE_RESOURCES: BlockableResource[] = [
  "image",
  "media",
  "font",
  "stylesheet",
];

const COLOR_SCHEMES = new Set<BrowserColorScheme>(["system", "light", "dark"]);
const LOCALES = new Set(LOCALE_OPTIONS.map((option) => option.value));
const TIMEZONES = new Set(TIMEZONE_OPTIONS.map((option) => option.value));
const REGIONS = new Set(REGION_OPTIONS.map((option) => option.value));
const RESOURCES = new Set<string>(BLOCKABLE_RESOURCES);

const DEFAULT_VIEWPORT = {
  width: 1920,
  height: 1080,
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
};

export function defaultBrowserSettings(): BrowserSettings {
  return {
    viewport: { ...DEFAULT_VIEWPORT },
    colorScheme: "system",
    reducedMotion: false,
    blockedResources: [],
  };
}

export function normalizeBrowserSettings(raw: unknown): BrowserSettings {
  if (raw === undefined || raw === null) {
    return defaultBrowserSettings();
  }

  const input = asObject(raw, "浏览器设置格式不正确。", "settings");
  const viewportInput =
    input.viewport === undefined
      ? {}
      : asObject(input.viewport, "视口设置格式不正确。", "viewport");

  const settings: BrowserSettings = {
    viewport: {
      width: readInteger(
        viewportInput.width,
        DEFAULT_VIEWPORT.width,
        MIN_VIEWPORT_WIDTH,
        MAX_VIEWPORT_WIDTH,
        "视口宽度",
        "viewport.width",
      ),
      height: readInteger(
        viewportInput.height,
        DEFAULT_VIEWPORT.height,
        MIN_VIEWPORT_HEIGHT,
        MAX_VIEWPORT_HEIGHT,
        "视口高度",
        "viewport.height",
      ),
      isMobile: readBoolean(
        viewportInput.isMobile,
        DEFAULT_VIEWPORT.isMobile,
        "移动设备模式",
        "viewport.isMobile",
      ),
      hasTouch: readBoolean(
        viewportInput.hasTouch,
        DEFAULT_VIEWPORT.hasTouch,
        "触摸模式",
        "viewport.hasTouch",
      ),
      deviceScaleFactor: readInteger(
        viewportInput.deviceScaleFactor,
        DEFAULT_VIEWPORT.deviceScaleFactor,
        1,
        MAX_DEVICE_SCALE_FACTOR,
        "像素比",
        "viewport.deviceScaleFactor",
      ),
    },
    colorScheme: readColorScheme(input.colorScheme),
    reducedMotion: readBoolean(
      input.reducedMotion,
      false,
      "减弱动画",
      "reducedMotion",
    ),
    blockedResources: readBlockedResources(input.blockedResources),
  };

  const userAgent = readOptionalString(
    input.userAgent,
    512,
    "User-Agent",
    "userAgent",
  );
  if (userAgent && /[\r\n]/u.test(userAgent)) {
    throw new BrowserSettingsError("User-Agent 不能包含换行符。", "userAgent");
  }
  if (userAgent) {
    settings.userAgent = userAgent;
  }

  const locale = readAllowedOptionalString(
    input.locale,
    LOCALES,
    "不支持这个浏览器语言。",
    "locale",
  );
  if (locale) {
    settings.locale = locale;
  }

  const timezone = readAllowedOptionalString(
    input.timezone,
    TIMEZONES,
    "不支持这个浏览器时区。",
    "timezone",
  );
  if (timezone) {
    settings.timezone = timezone;
  }

  const region = readAllowedOptionalString(
    input.region,
    REGIONS,
    "不支持这个出口区域。",
    "region",
  );
  if (region) {
    settings.region = region;
  }

  if (input.geolocation !== undefined && input.geolocation !== null) {
    const geolocation = asObject(
      input.geolocation,
      "地理位置设置格式不正确。",
      "geolocation",
    );
    settings.geolocation = {
      latitude: readFiniteNumber(
        geolocation.latitude,
        -90,
        90,
        "纬度",
        "geolocation.latitude",
      ),
      longitude: readFiniteNumber(
        geolocation.longitude,
        -180,
        180,
        "经度",
        "geolocation.longitude",
      ),
      accuracy: readFiniteNumber(
        geolocation.accuracy ?? 0,
        0,
        10_000,
        "定位精度",
        "geolocation.accuracy",
      ),
    };
  }

  return settings;
}

export async function applyBrowserSettings(
  page: Page,
  settings: BrowserSettings,
  targetUrl: string,
): Promise<void> {
  await page.setViewport({ ...settings.viewport });

  if (settings.userAgent) {
    await page.setUserAgent(settings.userAgent);
  }

  if (settings.locale) {
    await page.setExtraHTTPHeaders({
      "Accept-Language": acceptLanguageHeader(settings.locale),
    });
    const cdpSession = await page.createCDPSession();
    try {
      await cdpSession.send("Emulation.setLocaleOverride", {
        locale: settings.locale,
      });
    } finally {
      await cdpSession.detach();
    }
  }

  if (settings.timezone) {
    await page.emulateTimezone(settings.timezone);
  }

  const mediaFeatures: Array<{ name: string; value: string }> = [];
  if (settings.colorScheme !== "system") {
    mediaFeatures.push({
      name: "prefers-color-scheme",
      value: settings.colorScheme,
    });
  }
  if (settings.reducedMotion) {
    mediaFeatures.push({ name: "prefers-reduced-motion", value: "reduce" });
  }
  if (mediaFeatures.length > 0) {
    await page.emulateMediaFeatures(mediaFeatures);
  }

  if (settings.geolocation) {
    await page
      .browserContext()
      .overridePermissions(new URL(targetUrl).origin, ["geolocation"]);
    await page.setGeolocation(settings.geolocation);
  }
}

/** Human readable one line summary used by the console and by logs. */
export function describeBrowserSettings(settings: BrowserSettings): string {
  const parts = [
    `${settings.viewport.width}×${settings.viewport.height}`,
    settings.viewport.isMobile ? "mobile" : "desktop",
  ];
  if (settings.region) {
    parts.push(settings.region);
  }
  if (settings.locale) {
    parts.push(settings.locale);
  }
  if (settings.blockedResources.length > 0) {
    parts.push(`block:${settings.blockedResources.join("+")}`);
  }
  return parts.join(" · ");
}

const UA_PRESETS_BY_VALUE = new Map(
  USER_AGENT_PRESETS.map((preset) => [preset.value, preset]),
);

export function userAgentPresetByValue(
  value: string,
): UserAgentPreset | undefined {
  return UA_PRESETS_BY_VALUE.get(value);
}

export function regionProfile(region?: string): RegionProfile | undefined {
  return region ? REGION_PROFILES[region] : undefined;
}

/**
 * Turns the console's UA choice into the string sent to the browser. `mode` is
 * a preset value, the literal `"custom"`, or empty for the Browser Run default.
 */
export function resolveUserAgent(mode: string, custom: string): string {
  if (mode === "custom") {
    return custom.trim();
  }
  return userAgentPresetByValue(mode)?.userAgent ?? "";
}

/** Effective UA platform of a choice; the default UA is desktop. */
export function uaPlatformOf(mode: string): UaPlatform | "unknown" {
  if (mode === "custom") {
    return "unknown";
  }
  return userAgentPresetByValue(mode)?.platform ?? "desktop";
}

/** The UA preset that keeps a device family fingerprint-coherent. */
export function suggestedUaPreset(deviceValue: string): string | undefined {
  return DEVICE_PRESETS.find((preset) => preset.value === deviceValue)?.uaPreset;
}

/**
 * Cross-checks region, locale, timezone and UA platform against each other and
 * reports what a one-click fix would change. Pure so the console and the tests
 * share one definition of "consistent".
 */
export function fingerprintIssues(input: {
  region?: string;
  locale?: string;
  timezone?: string;
  deviceMobile: boolean;
  uaMode: string;
}): FingerprintIssue[] {
  const issues: FingerprintIssue[] = [];
  const profile = regionProfile(input.region);

  if (profile) {
    if (input.locale && input.locale !== profile.locale) {
      issues.push({ code: "region-locale", suggestion: profile.locale });
    }
    if (input.timezone && input.timezone !== profile.timezone) {
      issues.push({ code: "region-timezone", suggestion: profile.timezone });
    }
  }

  const platform = uaPlatformOf(input.uaMode);
  if (
    platform !== "unknown" &&
    input.deviceMobile !== (platform === "mobile")
  ) {
    const wanted: UaPlatform = input.deviceMobile ? "mobile" : "desktop";
    const suggestion = USER_AGENT_PRESETS.find(
      (preset) => preset.platform === wanted,
    );
    if (suggestion) {
      issues.push({ code: "device-ua", suggestion: suggestion.value });
    }
  }

  return issues;
}

function readColorScheme(value: unknown): BrowserColorScheme {
  const resolved = value === undefined || value === null ? "system" : value;
  if (
    typeof resolved !== "string" ||
    !COLOR_SCHEMES.has(resolved as BrowserColorScheme)
  ) {
    throw new BrowserSettingsError(
      "配色模式只能是 system、light 或 dark。",
      "colorScheme",
    );
  }
  return resolved as BrowserColorScheme;
}

function readBlockedResources(value: unknown): BlockableResource[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new BrowserSettingsError(
      "资源拦截设置必须是数组。",
      "blockedResources",
    );
  }
  const unique = new Set<BlockableResource>();
  for (const entry of value) {
    if (typeof entry !== "string" || !RESOURCES.has(entry)) {
      throw new BrowserSettingsError(
        `不支持拦截这种资源：${String(entry).slice(0, 32)}。`,
        "blockedResources",
      );
    }
    unique.add(entry as BlockableResource);
  }
  return BLOCKABLE_RESOURCES.filter((resource) => unique.has(resource));
}

function asObject(
  value: unknown,
  errorMessage: string,
  field: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BrowserSettingsError(errorMessage, field);
  }
  return value as Record<string, unknown>;
}

function readInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
  field: string,
): number {
  const resolved = value === undefined || value === null ? fallback : value;
  if (
    typeof resolved !== "number" ||
    !Number.isInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    throw new BrowserSettingsError(
      `${label}必须是 ${minimum}–${maximum} 之间的整数。`,
      field,
    );
  }
  return resolved;
}

function readFiniteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
  field: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new BrowserSettingsError(
      `${label}必须是 ${minimum}–${maximum} 之间的数字。`,
      field,
    );
  }
  return value;
}

function readBoolean(
  value: unknown,
  fallback: boolean,
  label: string,
  field: string,
): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new BrowserSettingsError(`${label}必须是布尔值。`, field);
  }
  return value;
}

function readOptionalString(
  value: unknown,
  maximumLength: number,
  label: string,
  field: string,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new BrowserSettingsError(`${label}必须是字符串。`, field);
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > maximumLength) {
    throw new BrowserSettingsError(
      `${label}不能超过 ${maximumLength} 个字符。`,
      field,
    );
  }
  return normalized;
}

function readAllowedOptionalString(
  value: unknown,
  allowedValues: Set<string>,
  errorMessage: string,
  field: string,
): string | undefined {
  const normalized = readOptionalString(value, 64, "设置项", field);
  if (normalized && !allowedValues.has(normalized)) {
    throw new BrowserSettingsError(errorMessage, field);
  }
  return normalized;
}

function acceptLanguageHeader(locale: string): string {
  const language = locale.split("-")[0];
  return language && language !== locale
    ? `${locale},${language};q=0.9`
    : locale;
}
