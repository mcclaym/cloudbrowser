import { DEFAULT_LANGUAGE, LANGUAGES } from "./i18n.js";

const TOKEN_KEY = "cloudbrowser.token";
const PREFS_KEY = "cloudbrowser.prefs.v2";
const HISTORY_KEY = "cloudbrowser.history.v2";
const MAX_HISTORY = 24;

export const DEFAULT_SETTINGS = {
  preset: "desktop-fhd",
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  isMobile: false,
  region: "",
  locale: "",
  timezone: "",
  colorScheme: "system",
  userAgent: "",
  reducedMotion: false,
  blockedResources: [],
  geolocationEnabled: false,
  latitude: 49.2827,
  longitude: -123.1207,
  accuracy: 25,
};

/** In-memory application state. Persisted slices live in `prefs`. */
export const state = {
  config: null,
  sessions: [],
  activeId: null,
  /** sessionId -> { liveUrl, inspectorUrl, refreshedAt } */
  live: {},
  capacity: null,
  stats: null,
  launching: false,
  /** Keeps the launcher card visible on top of a running session. */
  showLauncher: false,
  ready: false,
};

export const prefs = {
  language: DEFAULT_LANGUAGE,
  theme: "system",
  railCollapsed: false,
  settings: { ...DEFAULT_SETTINGS },
};

export function setState(patch) {
  Object.assign(state, patch);
}

export function activeSession() {
  return state.sessions.find((session) => session.id === state.activeId) ?? null;
}

export function liveFor(sessionId) {
  return state.live[sessionId] ?? null;
}

export function rememberLive(sessionId, urls) {
  state.live = {
    ...state.live,
    [sessionId]: { ...urls, refreshedAt: Date.now() },
  };
}

export function forgetLive(sessionId) {
  const next = { ...state.live };
  delete next[sessionId];
  state.live = next;
}

/* ------------------------------------------------------------------ token */

export function loadToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function saveToken(token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private modes without sessionStorage still work for this tab.
  }
}

export function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clean up.
  }
}

/* ------------------------------------------------------------- preferences */

export function loadPrefs() {
  const stored = readJson(PREFS_KEY);
  if (stored && typeof stored === "object") {
    if (LANGUAGES.includes(stored.language)) {
      prefs.language = stored.language;
    }
    if (["system", "light", "dark"].includes(stored.theme)) {
      prefs.theme = stored.theme;
    }
    prefs.railCollapsed = stored.railCollapsed === true;
    prefs.settings = sanitizeSettings(stored.settings);
  }
  return prefs;
}

export function savePrefs() {
  writeJson(PREFS_KEY, {
    language: prefs.language,
    theme: prefs.theme,
    railCollapsed: prefs.railCollapsed,
    settings: prefs.settings,
  });
}

function sanitizeSettings(raw) {
  const merged = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") {
    return merged;
  }
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = raw[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(DEFAULT_SETTINGS[key])) {
      merged[key] = Array.isArray(value)
        ? value.filter((entry) => typeof entry === "string").slice(0, 8)
        : [];
    } else if (typeof DEFAULT_SETTINGS[key] === typeof value) {
      merged[key] = value;
    }
  }
  return merged;
}

/* ---------------------------------------------------------------- history */

export function loadHistory() {
  const stored = readJson(HISTORY_KEY);
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored
    .filter(
      (entry) =>
        entry && typeof entry.url === "string" && typeof entry.at === "number",
    )
    .slice(0, MAX_HISTORY);
}

export function rememberVisit(history, url, title) {
  const next = [
    { url, title: title || "", at: Date.now() },
    ...history.filter((entry) => entry.url !== url),
  ].slice(0, MAX_HISTORY);
  writeJson(HISTORY_KEY, next);
  return next;
}

export function clearHistory() {
  writeJson(HISTORY_KEY, []);
  return [];
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable; the console still works for this session.
  }
}
