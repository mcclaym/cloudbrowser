const state = {
  token: sessionStorage.getItem("cloudbrowser_token") || "",
  session: null,
  sessionTtlSeconds: 600,
  countdownInterval: null,
  pollInterval: null,
  liveUrl: "",
  liveUrlRefreshedAt: 0,
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
    elements.idleTimerChip.textContent = `最长 ${formatDuration(state.sessionTtlSeconds)}`;
    clearLiveView();
    return;
  }

  elements.emptySession.classList.add("hidden");
  elements.activeSession.classList.remove("hidden");
  elements.targetUrl.disabled = true;
  elements.launchButton.disabled = true;
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
    const result = await api("/api/session", {
      method: "POST",
      body: JSON.stringify({ url: elements.targetUrl.value }),
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

void boot();
