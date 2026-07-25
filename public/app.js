const state = {
  token: sessionStorage.getItem("cloudbrowser_token") || "",
  session: null,
  sessionTtlSeconds: 600,
  countdownInterval: null,
  pollInterval: null,
  liveUrl: "",
  liveUrlRefreshedAt: 0,
};

const SETTINGS_STORAGE_KEY = "cloudbrowser_browser_settings_v1";
const VIEWPORT_PRESETS = {
  "desktop-large": {
    width: 1920,
    height: 1080,
    isMobile: false,
    hasTouch: false,
  },
  "desktop-laptop": {
    width: 1366,
    height: 768,
    isMobile: false,
    hasTouch: false,
  },
  tablet: {
    width: 1024,
    height: 768,
    isMobile: true,
    hasTouch: true,
  },
  mobile: {
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  },
};

const elements = {
  authBackdrop: document.querySelector("#auth-backdrop"),
  authForm: document.querySelector("#auth-form"),
  authButton: document.querySelector("#auth-button"),
  accessToken: document.querySelector("#access-token"),
  authMessage: document.querySelector("#auth-message"),
  logoutButton: document.querySelector("#logout-button"),
  launchForm: document.querySelector("#launch-form"),
  launchButton: document.querySelector("#launch-button"),
  targetUrl: document.querySelector("#target-url"),
  browserSettings: document.querySelector("#browser-settings"),
  browserSettingsFields: document.querySelector("#browser-settings-fields"),
  settingsSummary: document.querySelector("#settings-summary"),
  viewportPreset: document.querySelector("#viewport-preset"),
  customViewport: document.querySelector("#custom-viewport"),
  viewportWidth: document.querySelector("#viewport-width"),
  viewportHeight: document.querySelector("#viewport-height"),
  mobileEmulation: document.querySelector("#mobile-emulation"),
  browserLocale: document.querySelector("#browser-locale"),
  browserTimezone: document.querySelector("#browser-timezone"),
  colorScheme: document.querySelector("#color-scheme"),
  customUserAgent: document.querySelector("#custom-user-agent"),
  geolocationToggle: document.querySelector("#geolocation-toggle"),
  geolocationFields: document.querySelector("#geolocation-fields"),
  geoLatitude: document.querySelector("#geo-latitude"),
  geoLongitude: document.querySelector("#geo-longitude"),
  geoAccuracy: document.querySelector("#geo-accuracy"),
  formMessage: document.querySelector("#form-message"),
  sessionDurationLabel: document.querySelector("#session-duration-label"),
  idleTimerChip: document.querySelector("#idle-timer-chip"),
  emptySession: document.querySelector("#empty-session"),
  activeSession: document.querySelector("#active-session"),
  sessionReference: document.querySelector("#session-reference"),
  countdownRing: document.querySelector("#countdown-ring"),
  countdownValue: document.querySelector("#countdown-value"),
  sessionHostname: document.querySelector("#session-hostname"),
  sessionUrl: document.querySelector("#session-url"),
  showLiveButton: document.querySelector("#show-live-button"),
  refreshLinkButton: document.querySelector("#refresh-link-button"),
  stopButton: document.querySelector("#stop-button"),
  browserStage: document.querySelector("#browser-stage"),
  fullscreenLiveButton: document.querySelector("#fullscreen-live-button"),
  liveBrowserFrame: document.querySelector("#live-browser-frame"),
  liveFramePlaceholder: document.querySelector("#live-frame-placeholder"),
};

class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("authorization", `Bearer ${state.token}`);
  if (options.body) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      lockConsole();
    }
    throw new ApiError(
      payload?.error?.message || `请求失败（${response.status}）`,
      payload?.error?.code || "REQUEST_FAILED",
      response.status,
    );
  }
  return payload;
}

function setBusy(button, busy, busyText, idleText) {
  button.disabled = busy;
  const label = button.querySelector("span");
  if (label) {
    label.textContent = busy ? busyText : idleText;
  } else {
    button.textContent = busy ? busyText : idleText;
  }
}

function showMessage(element, message, type = "error") {
  element.textContent = message;
  element.classList.toggle("success", type === "success");
  element.classList.remove("hidden");
}

function clearMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
  element.classList.remove("success");
}

function viewportSettings() {
  const preset = VIEWPORT_PRESETS[elements.viewportPreset.value];
  if (preset) {
    return { ...preset };
  }

  const width = validatedNumber(
    elements.viewportWidth,
    320,
    1920,
    "视口宽度",
  );
  const height = validatedNumber(
    elements.viewportHeight,
    480,
    1080,
    "视口高度",
  );
  const mobileMode = elements.mobileEmulation.checked;
  return {
    width,
    height,
    isMobile: mobileMode,
    hasTouch: mobileMode,
  };
}

function collectBrowserSettings() {
  const settings = {
    viewport: viewportSettings(),
    colorScheme: elements.colorScheme.value,
  };
  const userAgent = elements.customUserAgent.value.trim();
  if (userAgent) {
    settings.userAgent = userAgent;
  }
  if (elements.browserLocale.value) {
    settings.locale = elements.browserLocale.value;
  }
  if (elements.browserTimezone.value) {
    settings.timezone = elements.browserTimezone.value;
  }
  if (elements.geolocationToggle.checked) {
    settings.geolocation = {
      latitude: validatedNumber(
        elements.geoLatitude,
        -90,
        90,
        "纬度",
      ),
      longitude: validatedNumber(
        elements.geoLongitude,
        -180,
        180,
        "经度",
      ),
      accuracy: validatedNumber(
        elements.geoAccuracy,
        0,
        10_000,
        "定位精度",
      ),
    };
  }
  return settings;
}

function validatedNumber(input, minimum, maximum, label) {
  const value = input.valueAsNumber;
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label}必须在 ${minimum}–${maximum} 之间。`);
  }
  return value;
}

function updateSettingsUi() {
  const customViewport = elements.viewportPreset.value === "custom";
  elements.customViewport.classList.toggle("hidden", !customViewport);
  elements.geolocationFields.classList.toggle(
    "hidden",
    !elements.geolocationToggle.checked,
  );

  let viewport;
  try {
    viewport = viewportSettings();
  } catch {
    viewport = { width: "?", height: "?" };
  }
  const uaLabel = elements.customUserAgent.value.trim()
    ? "自定义 UA"
    : "默认 UA";
  const colorLabel = {
    system: "系统配色",
    light: "浅色",
    dark: "深色",
  }[elements.colorScheme.value] || "系统配色";
  elements.settingsSummary.textContent =
    `${viewport.width} × ${viewport.height} · ${uaLabel} · ${colorLabel}`;
}

function saveBrowserSettings() {
  const preferences = {
    viewportPreset: elements.viewportPreset.value,
    viewportWidth: elements.viewportWidth.value,
    viewportHeight: elements.viewportHeight.value,
    mobileEmulation: elements.mobileEmulation.checked,
    locale: elements.browserLocale.value,
    timezone: elements.browserTimezone.value,
    colorScheme: elements.colorScheme.value,
    userAgent: elements.customUserAgent.value,
    geolocationEnabled: elements.geolocationToggle.checked,
    latitude: elements.geoLatitude.value,
    longitude: elements.geoLongitude.value,
    accuracy: elements.geoAccuracy.value,
  };
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Private browsing modes can disable localStorage; settings still work now.
  }
}

function loadBrowserSettings() {
  let preferences;
  try {
    preferences = JSON.parse(
      localStorage.getItem(SETTINGS_STORAGE_KEY) || "null",
    );
  } catch {
    preferences = null;
  }
  if (!preferences || typeof preferences !== "object") {
    updateSettingsUi();
    return;
  }

  setSelectValue(elements.viewportPreset, preferences.viewportPreset);
  setInputValue(elements.viewportWidth, preferences.viewportWidth);
  setInputValue(elements.viewportHeight, preferences.viewportHeight);
  elements.mobileEmulation.checked = preferences.mobileEmulation === true;
  setSelectValue(elements.browserLocale, preferences.locale);
  setSelectValue(elements.browserTimezone, preferences.timezone);
  setSelectValue(elements.colorScheme, preferences.colorScheme);
  if (typeof preferences.userAgent === "string") {
    elements.customUserAgent.value = preferences.userAgent.slice(0, 512);
  }
  elements.geolocationToggle.checked =
    preferences.geolocationEnabled === true;
  setInputValue(elements.geoLatitude, preferences.latitude);
  setInputValue(elements.geoLongitude, preferences.longitude);
  setInputValue(elements.geoAccuracy, preferences.accuracy);
  updateSettingsUi();
}

function setSelectValue(select, value) {
  if (
    typeof value === "string" &&
    [...select.options].some((option) => option.value === value)
  ) {
    select.value = value;
  }
}

function setInputValue(input, value) {
  if (typeof value === "string" && value.length <= 32) {
    input.value = value;
  }
}

function setSettingsDisabled(disabled) {
  elements.browserSettingsFields.disabled = disabled;
}

function unlockConsole() {
  elements.authBackdrop.classList.add("dismissed");
  elements.logoutButton.classList.remove("hidden");
  elements.targetUrl.focus();
}

function lockConsole() {
  state.token = "";
  sessionStorage.removeItem("cloudbrowser_token");
  stopTimers();
  clearLiveView();
  elements.authBackdrop.classList.remove("dismissed");
  elements.logoutButton.classList.add("hidden");
  elements.accessToken.value = "";
  elements.accessToken.focus();
}

function stopTimers() {
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
  if (state.pollInterval) {
    clearInterval(state.pollInterval);
    state.pollInterval = null;
  }
}

function clearLiveView() {
  state.liveUrl = "";
  state.liveUrlRefreshedAt = 0;
  elements.liveBrowserFrame.removeAttribute("src");
  elements.liveBrowserFrame.classList.add("hidden");
  elements.liveFramePlaceholder.classList.remove("hidden");
  elements.browserStage.classList.add("hidden");
  if (document.fullscreenElement === elements.browserStage) {
    void document.exitFullscreen().catch(() => {});
  }
}

function setLiveViewUrl(liveUrl, reloadFrame = false) {
  let url;
  try {
    url = new URL(liveUrl);
  } catch {
    throw new Error("Cloudflare 返回了无效的 Live View 地址。");
  }

  if (url.protocol !== "https:" || url.hostname !== "live.browser.run") {
    throw new Error("Cloudflare 返回了非预期的 Live View 地址。");
  }

  state.liveUrl = url.toString();
  state.liveUrlRefreshedAt = Date.now();
  elements.browserStage.classList.remove("hidden");

  if (reloadFrame || !elements.liveBrowserFrame.hasAttribute("src")) {
    elements.liveBrowserFrame.classList.add("hidden");
    elements.liveFramePlaceholder.classList.remove("hidden");
    elements.liveBrowserFrame.src = state.liveUrl;
  }
}

function renderSession(session, liveUrls = {}, options = {}) {
  state.session = session?.active ? session : null;

  if (!state.session) {
    elements.activeSession.classList.add("hidden");
    elements.emptySession.classList.remove("hidden");
    elements.launchButton.disabled = false;
    elements.targetUrl.disabled = false;
    setSettingsDisabled(false);
    elements.idleTimerChip.textContent = `最长 ${formatDuration(state.sessionTtlSeconds)}`;
    clearLiveView();
    return;
  }

  elements.emptySession.classList.add("hidden");
  elements.activeSession.classList.remove("hidden");
  elements.targetUrl.disabled = true;
  elements.launchButton.disabled = true;
  setSettingsDisabled(true);
  elements.sessionReference.textContent = `#${state.session.sessionRef}`;
  elements.sessionUrl.textContent = state.session.targetUrl;

  try {
    elements.sessionHostname.textContent = new URL(state.session.targetUrl).hostname;
  } catch {
    elements.sessionHostname.textContent = "远程页面";
  }

  if (liveUrls.liveUrl) {
    setLiveViewUrl(liveUrls.liveUrl, options.reloadLiveFrame);
  }

  updateCountdown();
  if (!state.countdownInterval) {
    state.countdownInterval = setInterval(updateCountdown, 1000);
  }
}

function updateCountdown() {
  if (!state.session?.expiresAt) {
    return;
  }

  const totalMs = state.sessionTtlSeconds * 1000;
  const remainingMs = Math.max(0, Date.parse(state.session.expiresAt) - Date.now());
  const progress = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  elements.countdownValue.textContent = formatDuration(Math.ceil(remainingMs / 1000));
  elements.countdownRing.style.setProperty("--progress", `${progress}%`);
  elements.idleTimerChip.textContent = `剩余 ${formatDuration(Math.ceil(remainingMs / 1000))}`;

  if (remainingMs <= 0) {
    renderSession({ active: false });
    void refreshStatus();
  }
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatSessionDuration(totalSeconds) {
  const seconds = Math.max(60, Math.floor(totalSeconds));
  if (seconds % 3600 === 0) {
    return `${seconds / 3600} 小时`;
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} 小时 ${minutes} 分钟`;
  }
  return `${Math.floor(seconds / 60)} 分钟`;
}

function applySessionConfig(config) {
  state.sessionTtlSeconds = config.sessionTtlSeconds || 600;
  elements.sessionDurationLabel.textContent =
    `${formatSessionDuration(state.sessionTtlSeconds)}隔离会话`;
  elements.idleTimerChip.textContent =
    `最长 ${formatDuration(state.sessionTtlSeconds)}`;
}

async function refreshStatus() {
  if (!state.token) {
    return;
  }

  try {
    const session = await api("/api/session");
    renderSession(session);

    if (
      session.active &&
      Date.now() - state.liveUrlRefreshedAt > 4 * 60 * 1000
    ) {
      await refreshLiveUrl(false);
    }
  } catch (error) {
    if (error.status !== 401) {
      showMessage(elements.formMessage, error.message);
    }
  }
}

async function refreshLiveUrl(showFeedback = true, reloadFrame = showFeedback) {
  elements.refreshLinkButton.disabled = true;
  try {
    const result = await api("/api/session/live-url", { method: "POST" });
    renderSession(result, result, { reloadLiveFrame: reloadFrame });
    if (showFeedback) {
      showMessage(elements.formMessage, "嵌入画面已重新连接。", "success");
    }
    return result;
  } catch (error) {
    showMessage(elements.formMessage, error.message);
    return null;
  } finally {
    elements.refreshLinkButton.disabled = false;
  }
}

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(elements.authMessage);
  const token = elements.accessToken.value;
  if (!token) {
    showMessage(elements.authMessage, "请输入访问口令。");
    return;
  }

  state.token = token;
  setBusy(elements.authButton, true, "正在验证…", "进入控制台");
  try {
    const [session, config] = await Promise.all([
      api("/api/session"),
      fetch("/api/config").then((response) => response.json()),
    ]);
    applySessionConfig(config);
    sessionStorage.setItem("cloudbrowser_token", token);
    unlockConsole();
    renderSession(session);
    state.pollInterval = setInterval(refreshStatus, 20_000);
  } catch (error) {
    state.token = "";
    showMessage(elements.authMessage, error.message);
  } finally {
    setBusy(elements.authButton, false, "正在验证…", "进入控制台");
  }
});

elements.launchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(elements.formMessage);
  setBusy(elements.launchButton, true, "正在启动…", "启动浏览器");

  try {
    const settings = collectBrowserSettings();
    saveBrowserSettings();
    const result = await api("/api/session", {
      method: "POST",
      body: JSON.stringify({
        url: elements.targetUrl.value,
        settings,
      }),
    });
    renderSession(result, result, { reloadLiveFrame: true });
    showMessage(
      elements.formMessage,
      result.mock
        ? "本地模拟会话已启动。"
        : "云端浏览器已准备完成，实时画面已嵌入下方。",
      "success",
    );
    elements.browserStage.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showMessage(elements.formMessage, error.message);
    elements.launchButton.disabled = false;
    elements.targetUrl.disabled = false;
    setSettingsDisabled(false);
  } finally {
    setBusy(elements.launchButton, false, "正在启动…", "启动浏览器");
    if (state.session) {
      elements.launchButton.disabled = true;
      elements.targetUrl.disabled = true;
    }
  }
});

elements.refreshLinkButton.addEventListener("click", () => {
  clearMessage(elements.formMessage);
  void refreshLiveUrl(true, true);
});

elements.showLiveButton.addEventListener("click", async () => {
  clearMessage(elements.formMessage);
  if (!state.liveUrl) {
    const result = await refreshLiveUrl(false, true);
    if (!result) {
      return;
    }
  }
  elements.browserStage.classList.remove("hidden");
  elements.browserStage.scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.fullscreenLiveButton.addEventListener("click", async () => {
  clearMessage(elements.formMessage);
  try {
    if (document.fullscreenElement === elements.browserStage) {
      await document.exitFullscreen();
    } else {
      await elements.browserStage.requestFullscreen();
    }
  } catch {
    showMessage(
      elements.formMessage,
      "当前浏览器不允许进入全屏，请使用浏览器自身的全屏功能。",
    );
  }
});

elements.stopButton.addEventListener("click", async () => {
  clearMessage(elements.formMessage);
  elements.stopButton.disabled = true;
  try {
    await api("/api/session", { method: "DELETE" });
    renderSession({ active: false });
    elements.targetUrl.value = "";
    showMessage(elements.formMessage, "会话已关闭并销毁。", "success");
  } catch (error) {
    showMessage(elements.formMessage, error.message);
  } finally {
    elements.stopButton.disabled = false;
  }
});

elements.logoutButton.addEventListener("click", () => {
  lockConsole();
});

elements.liveBrowserFrame.addEventListener("load", () => {
  elements.liveFramePlaceholder.classList.add("hidden");
  elements.liveBrowserFrame.classList.remove("hidden");
});

elements.browserSettingsFields.addEventListener("input", () => {
  updateSettingsUi();
  saveBrowserSettings();
});

elements.browserSettingsFields.addEventListener("change", () => {
  updateSettingsUi();
  saveBrowserSettings();
});

document.addEventListener("fullscreenchange", () => {
  const fullscreen = document.fullscreenElement === elements.browserStage;
  elements.fullscreenLiveButton.querySelector("span").textContent =
    fullscreen ? "退出全屏" : "全屏显示";
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.token) {
    void refreshStatus();
  }
});

async function boot() {
  try {
    const config = await fetch("/api/config").then((response) => response.json());
    applySessionConfig(config);
  } catch {
    // The protected API will provide a useful error when the user signs in.
  }

  if (!state.token) {
    elements.accessToken.focus();
    return;
  }

  try {
    const session = await api("/api/session");
    unlockConsole();
    renderSession(session);
    state.pollInterval = setInterval(refreshStatus, 20_000);
  } catch {
    lockConsole();
  }
}

loadBrowserSettings();
void boot();
