import { $, el, show } from "./dom.js";
import {
  alignSettings,
  fingerprintIssues,
  resolveUserAgent,
  suggestedUaPreset,
} from "./fingerprint.js";
import { optionLabel, t } from "./i18n.js";
import { DEFAULT_SETTINGS, prefs, state } from "./state.js";

const CUSTOM_PRESET = "custom";
export const CUSTOM_UA = "custom";
export const DEFAULT_UA = "";

function presetById(id) {
  return (state.config?.devicePresets ?? []).find((preset) => preset.value === id);
}

/** Resolves the stored preferences into a concrete viewport. */
export function resolvedViewport(settings = prefs.settings) {
  const preset = presetById(settings.preset);
  if (preset) {
    return {
      width: preset.width,
      height: preset.height,
      isMobile: preset.isMobile,
      hasTouch: preset.hasTouch,
      deviceScaleFactor: preset.deviceScaleFactor,
    };
  }
  return {
    width: clamp(settings.width, viewportLimits().minWidth, viewportLimits().maxWidth),
    height: clamp(settings.height, viewportLimits().minHeight, viewportLimits().maxHeight),
    isMobile: settings.isMobile === true,
    hasTouch: settings.isMobile === true,
    deviceScaleFactor: clamp(settings.deviceScaleFactor, 1, 3),
  };
}

function viewportLimits() {
  return (
    state.config?.limits?.viewport ?? {
      minWidth: 320,
      maxWidth: 2560,
      minHeight: 400,
      maxHeight: 1600,
    }
  );
}

function clamp(value, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}

/** Builds the payload the Worker expects. */
export function toApiSettings(settings = prefs.settings) {
  const payload = {
    viewport: resolvedViewport(settings),
    colorScheme: settings.colorScheme,
    reducedMotion: settings.reducedMotion === true,
    blockedResources: [...settings.blockedResources],
  };
  const userAgent = resolveUserAgent(
    state.config ?? {},
    settings.uaMode,
    settings.userAgent,
  );
  if (userAgent) {
    payload.userAgent = userAgent;
  }
  if (settings.locale) {
    payload.locale = settings.locale;
  }
  if (settings.timezone) {
    payload.timezone = settings.timezone;
  }
  if (settings.region) {
    payload.region = settings.region;
  }
  if (settings.geolocationEnabled) {
    payload.geolocation = {
      latitude: Number(settings.latitude),
      longitude: Number(settings.longitude),
      accuracy: Number(settings.accuracy),
    };
  }
  return payload;
}

export function settingsSummary(settings = prefs.settings) {
  const viewport = resolvedViewport(settings);
  const parts = [`${viewport.width} × ${viewport.height}`];
  if (settings.region) {
    parts.push(
      optionLabel(
        (state.config?.regions ?? []).find((region) => region.value === settings.region),
      ) || settings.region,
    );
  }
  if (settings.locale) {
    parts.push(settings.locale);
  }
  if (settings.blockedResources.length > 0) {
    parts.push(
      settings.blockedResources.map((resource) => t(`resource.${resource}`)).join(" / "),
    );
  }
  return parts.join(" · ");
}

/* ------------------------------------------------------------ drawer form */

export function buildSettingsForm() {
  const config = state.config;
  if (!config) {
    return;
  }

  fillSelect(
    $("#setting-preset"),
    [
      ...config.devicePresets.map((preset) => ({
        value: preset.value,
        text: optionLabel(preset),
      })),
      { value: CUSTOM_PRESET, text: t("drawer.custom") },
    ],
  );
  fillSelect($("#setting-region"), [
    { value: "", text: t("drawer.regionAuto") },
    ...config.regions.map((region) => ({
      value: region.value,
      text: optionLabel(region),
    })),
  ]);
  fillSelect($("#setting-locale"), [
    { value: "", text: t("drawer.localeDefault") },
    ...config.locales.map((locale) => ({
      value: locale.value,
      text: `${optionLabel(locale)} (${locale.value})`,
    })),
  ]);
  fillSelect($("#setting-timezone"), [
    { value: "", text: t("drawer.timezoneDefault") },
    ...config.timezones.map((timezone) => ({
      value: timezone.value,
      text: optionLabel(timezone),
    })),
  ]);

  fillSelect($("#setting-ua-preset"), [
    { value: DEFAULT_UA, text: t("drawer.uaDefault") },
    ...config.userAgentPresets.map((preset) => ({
      value: preset.value,
      text: optionLabel(preset),
    })),
    { value: CUSTOM_UA, text: t("drawer.uaCustom") },
  ]);

  const limits = viewportLimits();
  setRange($("#setting-width"), limits.minWidth, limits.maxWidth);
  setRange($("#setting-height"), limits.minHeight, limits.maxHeight);

  const chipHost = $("#blocked-resources");
  chipHost.replaceChildren(
    ...config.blockableResources.map((resource) =>
      el("label", { class: "chip" }, [
        el("input", {
          type: "checkbox",
          value: resource,
          dataset: { resource },
          checked: prefs.settings.blockedResources.includes(resource),
        }),
        el("span", { textContent: t(`resource.${resource}`) }),
      ]),
    ),
  );

  writeSettingsForm();
}

function fillSelect(select, options) {
  if (!select) {
    return;
  }
  const previous = select.value;
  select.replaceChildren(
    ...options.map((option) =>
      el("option", { value: option.value, textContent: option.text }),
    ),
  );
  if (options.some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function setRange(input, minimum, maximum) {
  if (input) {
    input.min = String(minimum);
    input.max = String(maximum);
  }
}

export function writeSettingsForm() {
  const settings = prefs.settings;
  setValue("#setting-preset", settings.preset);
  setValue("#setting-width", settings.width);
  setValue("#setting-height", settings.height);
  setValue("#setting-scale", settings.deviceScaleFactor);
  setChecked("#setting-mobile", settings.isMobile);
  setValue("#setting-region", settings.region);
  setValue("#setting-locale", settings.locale);
  setValue("#setting-timezone", settings.timezone);
  setValue("#setting-color-scheme", settings.colorScheme);
  setValue("#setting-ua-preset", settings.uaMode);
  setValue("#setting-user-agent", settings.userAgent);
  setChecked("#setting-reduced-motion", settings.reducedMotion);
  setChecked("#setting-geolocation", settings.geolocationEnabled);
  setValue("#setting-latitude", settings.latitude);
  setValue("#setting-longitude", settings.longitude);
  setValue("#setting-accuracy", settings.accuracy);

  for (const input of document.querySelectorAll("#blocked-resources input")) {
    input.checked = settings.blockedResources.includes(input.value);
  }
  syncConditionalRows();
}

export function readSettingsForm() {
  const limits = viewportLimits();
  const settings = {
    ...prefs.settings,
    preset: value("#setting-preset", DEFAULT_SETTINGS.preset),
    width: clamp(value("#setting-width", 1920), limits.minWidth, limits.maxWidth),
    height: clamp(value("#setting-height", 1080), limits.minHeight, limits.maxHeight),
    deviceScaleFactor: clamp(value("#setting-scale", 1), 1, 3),
    isMobile: checked("#setting-mobile"),
    region: value("#setting-region", ""),
    locale: value("#setting-locale", ""),
    timezone: value("#setting-timezone", ""),
    colorScheme: value("#setting-color-scheme", "system"),
    uaMode: value("#setting-ua-preset", DEFAULT_UA),
    userAgent: String(value("#setting-user-agent", "")).slice(0, 512),
    reducedMotion: checked("#setting-reduced-motion"),
    geolocationEnabled: checked("#setting-geolocation"),
    latitude: clampFloat(value("#setting-latitude", 0), -90, 90),
    longitude: clampFloat(value("#setting-longitude", 0), -180, 180),
    accuracy: clamp(value("#setting-accuracy", 25), 0, 10_000),
    blockedResources: [...document.querySelectorAll("#blocked-resources input")]
      .filter((input) => input.checked)
      .map((input) => input.value),
  };
  syncConditionalRows();
  return settings;
}

/** Switches the preset to “custom” when a size chip is picked from the launcher. */
export function selectPreset(presetId) {
  prefs.settings = { ...prefs.settings, preset: presetId };
  const preset = presetById(presetId);
  if (preset) {
    prefs.settings.width = preset.width;
    prefs.settings.height = preset.height;
    prefs.settings.deviceScaleFactor = preset.deviceScaleFactor;
    prefs.settings.isMobile = preset.isMobile;
  }
  onDeviceChanged(presetId);
  writeSettingsForm();
}

function syncConditionalRows() {
  show($("#custom-size-row"), value("#setting-preset", "") === CUSTOM_PRESET);
  show($("#geolocation-row"), checked("#setting-geolocation"));

  const uaMode = value("#setting-ua-preset", DEFAULT_UA);
  show($("#custom-ua-row"), uaMode === CUSTOM_UA);
  const preview = $("#ua-preview");
  if (preview) {
    const resolved = resolveUserAgent(
      state.config ?? {},
      uaMode,
      value("#setting-user-agent", ""),
    );
    preview.textContent = resolved || t("drawer.uaDefaultPreview");
  }
  renderFingerprintBanner();
}

/* ----------------------------------------------------- fingerprint coherence */

/** Mismatches between the current form values, in display order. */
export function currentFingerprintIssues(settings = prefs.settings) {
  return fingerprintIssues(state.config ?? {}, {
    region: settings.region,
    locale: settings.locale,
    timezone: settings.timezone,
    deviceMobile: resolvedViewport(settings).isMobile,
    uaMode: settings.uaMode,
  });
}

/** Rewrites the stored settings so every fingerprint signal agrees. */
export function alignFingerprint() {
  prefs.settings = alignSettings(
    state.config ?? {},
    prefs.settings,
    resolvedViewport(prefs.settings).isMobile,
  );
  writeSettingsForm();
  return prefs.settings;
}

/**
 * Picking a region fills in the locale and timezone that belong with it, and
 * picking a device family switches to the matching UA — so the common path
 * stays coherent without the user thinking about it.
 */
export function onRegionChanged(region) {
  const profile = (state.config?.regionProfiles ?? {})[region];
  if (!profile) {
    return;
  }
  prefs.settings = {
    ...prefs.settings,
    region,
    locale: profile.locale,
    timezone: profile.timezone,
  };
  writeSettingsForm();
}

export function onDeviceChanged(presetValue) {
  const uaPreset = suggestedUaPreset(state.config ?? {}, presetValue);
  if (!uaPreset || prefs.settings.uaMode === CUSTOM_UA) {
    return;
  }
  prefs.settings = { ...prefs.settings, uaMode: uaPreset };
  writeSettingsForm();
}

function renderFingerprintBanner() {
  const banner = $("#fingerprint-banner");
  if (!banner) {
    return;
  }
  const issues = currentFingerprintIssues(readSettingsFormRaw());
  show(banner, issues.length > 0);
  const text = $("#fingerprint-text");
  if (text) {
    text.textContent = issues
      .map((issue) => t(`fingerprint.${issue.code}`, { value: issue.suggestion }))
      .join(" ");
  }
}

/** Form values without the side effects of {@link readSettingsForm}. */
function readSettingsFormRaw() {
  return {
    ...prefs.settings,
    preset: value("#setting-preset", DEFAULT_SETTINGS.preset),
    isMobile: checked("#setting-mobile"),
    region: value("#setting-region", ""),
    locale: value("#setting-locale", ""),
    timezone: value("#setting-timezone", ""),
    uaMode: value("#setting-ua-preset", DEFAULT_UA),
  };
}

function setValue(selector, next) {
  const node = $(selector);
  if (node !== null && next !== undefined && next !== null) {
    node.value = String(next);
  }
}

function setChecked(selector, next) {
  const node = $(selector);
  if (node) {
    node.checked = Boolean(next);
  }
}

function value(selector, fallback) {
  const node = $(selector);
  return node ? node.value : fallback;
}

function checked(selector) {
  const node = $(selector);
  return node ? node.checked : false;
}

function clampFloat(raw, minimum, maximum) {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(maximum, Math.max(minimum, numeric));
}
