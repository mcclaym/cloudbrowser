const state = {
  token: sessionStorage.getItem("cloudbrowser_token") || "",
  session: null,
  sessionTtlSeconds: 600,
  countdownInterval: null,
  pollInterval: null,
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
  idleTimerChip: document.querySelector("#idle-timer-chip"),
  emptySession: document.querySelector("#empty-session"),
  activeSession: document.querySelector("#active-session"),
  sessionReference: document.querySelector("#session-reference"),
  countdownRing: document.querySelector("#countdown-ring"),
  countdownValue: document.querySelector("#countdown-value"),
  sessionHostname: document.querySelector("#session-hostname"),
  sessionUrl: document.querySelector("#session-url"),
  openLiveLink: document.querySelector("#open-live-link"),
  refreshLinkButton: document.querySelector("#refresh-link-button"),
  stopButton: document.querySelector("#stop-button"),
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

function renderSession(session, liveUrls = {}) {
  state.session = session?.active ? session : null;

  if (!state.session) {
    elements.activeSession.classList.add("hidden");
    elements.emptySession.classList.remove("hidden");
    elements.launchButton.disabled = false;
    elements.targetUrl.disabled = false;
    elements.idleTimerChip.textContent = `最长 ${formatDuration(state.sessionTtlSeconds)}`;
    elements.openLiveLink.href = "#";
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
    elements.openLiveLink.href = liveUrls.liveUrl;
    state.liveUrlRefreshedAt = Date.now();
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

async function refreshLiveUrl(showFeedback = true) {
  elements.refreshLinkButton.disabled = true;
  try {
    const result = await api("/api/session/live-url", { method: "POST" });
    renderSession(result, result);
    if (showFeedback) {
      showMessage(elements.formMessage, "实时访问链接已刷新。", "success");
    }
  } catch (error) {
    showMessage(elements.formMessage, error.message);
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
    state.sessionTtlSeconds = config.sessionTtlSeconds || 600;
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
    renderSession(result, result);
    showMessage(
      elements.formMessage,
      result.mock
        ? "本地模拟会话已启动。"
        : "云端浏览器已准备完成，可以打开实时页面。",
      "success",
    );
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
  void refreshLiveUrl(true);
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

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.token) {
    void refreshStatus();
  }
});

async function boot() {
  try {
    const config = await fetch("/api/config").then((response) => response.json());
    state.sessionTtlSeconds = config.sessionTtlSeconds || 600;
    elements.idleTimerChip.textContent = `最长 ${formatDuration(state.sessionTtlSeconds)}`;
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
