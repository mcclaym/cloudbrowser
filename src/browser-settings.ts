import type { Page } from "@cloudflare/puppeteer";

export type BrowserColorScheme = "system" | "light" | "dark";

export interface BrowserSettings {
  viewport: {
    width: number;
    height: number;
    isMobile: boolean;
    hasTouch: boolean;
  };
  userAgent?: string;
  locale?: string;
  timezone?: string;
  colorScheme: BrowserColorScheme;
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

export class BrowserSettingsError extends Error {
  readonly code = "INVALID_BROWSER_SETTINGS";

  constructor(message: string) {
    super(message);
    this.name = "BrowserSettingsError";
  }
}

export const ALLOWED_LOCALES = [
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
  "fr-FR",
  "de-DE",
] as const;

export const ALLOWED_TIMEZONES = [
  "UTC",
  "America/Vancouver",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

const COLOR_SCHEMES = new Set<BrowserColorScheme>([
  "system",
  "light",
  "dark",
]);
const LOCALES = new Set<string>(ALLOWED_LOCALES);
const TIMEZONES = new Set<string>(ALLOWED_TIMEZONES);
const DEFAULT_VIEWPORT = {
  width: 1920,
  height: 1080,
  isMobile: false,
  hasTouch: false,
};

export function normalizeBrowserSettings(raw: unknown): BrowserSettings {
  if (raw === undefined || raw === null) {
    return {
      viewport: { ...DEFAULT_VIEWPORT },
      colorScheme: "system",
    };
  }

  const input = asObject(raw, "浏览器设置格式不正确。");
  const viewportInput =
    input.viewport === undefined
      ? {}
      : asObject(input.viewport, "视口设置格式不正确。");
  const width = readInteger(
    viewportInput.width,
    DEFAULT_VIEWPORT.width,
    320,
    1920,
    "视口宽度",
  );
  const height = readInteger(
    viewportInput.height,
    DEFAULT_VIEWPORT.height,
    480,
    1080,
    "视口高度",
  );
  const isMobile = readBoolean(
    viewportInput.isMobile,
    DEFAULT_VIEWPORT.isMobile,
    "移动设备模式",
  );
  const hasTouch = readBoolean(
    viewportInput.hasTouch,
    DEFAULT_VIEWPORT.hasTouch,
    "触摸模式",
  );

  const userAgent = readOptionalString(input.userAgent, 512, "User-Agent");
  if (userAgent && /[\r\n]/u.test(userAgent)) {
    throw new BrowserSettingsError("User-Agent 不能包含换行符。");
  }

  const locale = readAllowedOptionalString(
    input.locale,
    LOCALES,
    "不支持这个浏览器语言。",
  );
  const timezone = readAllowedOptionalString(
    input.timezone,
    TIMEZONES,
    "不支持这个浏览器时区。",
  );

  const colorScheme =
    input.colorScheme === undefined ? "system" : input.colorScheme;
  if (
    typeof colorScheme !== "string" ||
    !COLOR_SCHEMES.has(colorScheme as BrowserColorScheme)
  ) {
    throw new BrowserSettingsError("配色模式只能是 system、light 或 dark。");
  }

  const settings: BrowserSettings = {
    viewport: {
      width,
      height,
      isMobile,
      hasTouch,
    },
    colorScheme: colorScheme as BrowserColorScheme,
  };

  if (userAgent) {
    settings.userAgent = userAgent;
  }
  if (locale) {
    settings.locale = locale;
  }
  if (timezone) {
    settings.timezone = timezone;
  }
  if (input.geolocation !== undefined && input.geolocation !== null) {
    const geolocation = asObject(
      input.geolocation,
      "地理位置设置格式不正确。",
    );
    settings.geolocation = {
      latitude: readFiniteNumber(
        geolocation.latitude,
        -90,
        90,
        "纬度",
      ),
      longitude: readFiniteNumber(
        geolocation.longitude,
        -180,
        180,
        "经度",
      ),
      accuracy: readFiniteNumber(
        geolocation.accuracy ?? 0,
        0,
        10_000,
        "定位精度",
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
  await page.setViewport({
    ...settings.viewport,
    deviceScaleFactor: 1,
  });

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

  if (settings.colorScheme !== "system") {
    await page.emulateMediaFeatures([
      {
        name: "prefers-color-scheme",
        value: settings.colorScheme,
      },
    ]);
  }

  if (settings.geolocation) {
    await page.browserContext().overridePermissions(
      new URL(targetUrl).origin,
      ["geolocation"],
    );
    await page.setGeolocation(settings.geolocation);
  }
}

function asObject(
  value: unknown,
  errorMessage: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new BrowserSettingsError(errorMessage);
  }
  return value as Record<string, unknown>;
}

function readInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const resolved = value === undefined ? fallback : value;
  if (
    typeof resolved !== "number" ||
    !Number.isInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    throw new BrowserSettingsError(
      `${label}必须是 ${minimum}–${maximum} 之间的整数。`,
    );
  }
  return resolved;
}

function readFiniteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new BrowserSettingsError(
      `${label}必须是 ${minimum}–${maximum} 之间的数字。`,
    );
  }
  return value;
}

function readBoolean(
  value: unknown,
  fallback: boolean,
  label: string,
): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new BrowserSettingsError(`${label}必须是布尔值。`);
  }
  return value;
}

function readOptionalString(
  value: unknown,
  maximumLength: number,
  label: string,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new BrowserSettingsError(`${label}必须是字符串。`);
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > maximumLength) {
    throw new BrowserSettingsError(`${label}不能超过 ${maximumLength} 个字符。`);
  }
  return normalized;
}

function readAllowedOptionalString(
  value: unknown,
  allowedValues: Set<string>,
  errorMessage: string,
): string | undefined {
  const normalized = readOptionalString(value, 64, "设置项");
  if (normalized && !allowedValues.has(normalized)) {
    throw new BrowserSettingsError(errorMessage);
  }
  return normalized;
}

function acceptLanguageHeader(locale: string): string {
  const language = locale.split("-")[0];
  return language && language !== locale
    ? `${locale},${language};q=0.9`
    : locale;
}
