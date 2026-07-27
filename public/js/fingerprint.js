/**
 * Fingerprint coherence rules, shared with the Worker.
 *
 * The Worker owns the catalogues (`regionProfiles`, `userAgentPresets`) and
 * ships them through `/api/config`; this module only applies the rules to them.
 * `tests/fingerprint.test.ts` cross-checks it against the TypeScript
 * implementation in `src/browser-settings.ts` so the two cannot drift.
 */

/** Locale + timezone a given exit region should be paired with. */
export function regionProfile(catalogues, region) {
  return region ? (catalogues.regionProfiles ?? {})[region] : undefined;
}

export function userAgentPresetByValue(catalogues, value) {
  return (catalogues.userAgentPresets ?? []).find(
    (preset) => preset.value === value,
  );
}

/** `desktop` | `mobile` | `unknown` — the default UA counts as desktop. */
export function uaPlatformOf(catalogues, mode) {
  if (mode === "custom") {
    return "unknown";
  }
  return userAgentPresetByValue(catalogues, mode)?.platform ?? "desktop";
}

/** Resolves the console's UA choice into the string sent to the browser. */
export function resolveUserAgent(catalogues, mode, custom) {
  if (mode === "custom") {
    return (custom ?? "").trim();
  }
  return userAgentPresetByValue(catalogues, mode)?.userAgent ?? "";
}

/** UA preset that keeps a device family coherent. */
export function suggestedUaPreset(catalogues, deviceValue) {
  return (catalogues.devicePresets ?? []).find(
    (preset) => preset.value === deviceValue,
  )?.uaPreset;
}

/**
 * Reports every mismatch between region, locale, timezone and UA platform,
 * along with the value a one-click fix would apply.
 */
export function fingerprintIssues(catalogues, input) {
  const issues = [];
  const profile = regionProfile(catalogues, input.region);

  if (profile) {
    if (input.locale && input.locale !== profile.locale) {
      issues.push({ code: "region-locale", suggestion: profile.locale });
    }
    if (input.timezone && input.timezone !== profile.timezone) {
      issues.push({ code: "region-timezone", suggestion: profile.timezone });
    }
  }

  const platform = uaPlatformOf(catalogues, input.uaMode);
  if (platform !== "unknown" && input.deviceMobile !== (platform === "mobile")) {
    const wanted = input.deviceMobile ? "mobile" : "desktop";
    const suggestion = (catalogues.userAgentPresets ?? []).find(
      (preset) => preset.platform === wanted,
    );
    if (suggestion) {
      issues.push({ code: "device-ua", suggestion: suggestion.value });
    }
  }

  return issues;
}

/**
 * Applies every suggestion from {@link fingerprintIssues} to a settings object,
 * returning a new one. Empty locale/timezone are filled from the region so
 * "auto align" produces a fully coherent profile rather than a partial one.
 */
export function alignSettings(catalogues, settings, deviceMobile) {
  const next = { ...settings };
  const profile = regionProfile(catalogues, settings.region);

  if (profile) {
    next.locale = profile.locale;
    next.timezone = profile.timezone;
  }

  const platform = uaPlatformOf(catalogues, next.uaMode);
  if (platform !== "unknown" && deviceMobile !== (platform === "mobile")) {
    const wanted = deviceMobile ? "mobile" : "desktop";
    const preset = (catalogues.userAgentPresets ?? []).find(
      (entry) => entry.platform === wanted,
    );
    if (preset) {
      next.uaMode = preset.value;
    }
  }

  return next;
}
