import { api, ApiError, onAuthFailure, setToken } from "./api.js";
import {
  $,
  copyText,
  downloadBlob,
  el,
  formatClock,
  hostOf,
  isTypingTarget,
  prettyUrl,
  show,
  toggleClass,
} from "./dom.js";
import {
  applyTranslations,
  getLanguage,
  nextLanguage,
  setLanguage,
  t,
} from "./i18n.js";
import {
  getLocalHistory,
  initRender,
  reloadFrame,
  renderApp,
  renderCountdowns,
  renderHistory,
  setLoadingStep,
  setLocalHistory,
} from "./render.js";
import {
  alignFingerprint,
  buildSettingsForm,
  onDeviceChanged,
  onRegionChanged,
  readSettingsForm,
  settingsSummary,
  toApiSettings,
  writeSettingsForm,
} from "./settings.js";
import {
  activeSession,
  clearHistory,
  clearToken,
  DEFAULT_SETTINGS,
  forgetLive,
  liveFor,
  loadHistory,
  loadPrefs,
  loadToken,
  prefs,
  rememberLive,
  rememberVisit,
  savePrefs,
  saveToken,
  setState,
  state,
} from "./state.js";
import {
  applyTheme,
  closeOverlay,
  closeTopOverlay,
  isOverlayOpen,
  openOverlay,
  registerOverlay,
  toast,
  watchSystemTheme,
} from "./ui.js";

const POLL_INTERVAL_MS = 15_000;
const LIVE_REFRESH_MS = 4 * 60 * 1000;
const LIVE_VIEW_HOST = "live.browser.run";

let pollTimer = null;
let tickTimer = null;
let liveTimer = null;
let pollCycle = 0;

/* ------------------------------------------------------------------- boot */

async function boot() {
  loadPrefs();
  setLanguage(prefs.language);
  applyTheme(prefs.theme);
  applyTranslations();
  setLocalHistory(loadHistory());
  toggleClass($("#rail"), "collapsed", prefs.railCollapsed);

  initRender({
    onSelectSession: selectSession,
    onStopSession: stopSession,
    onOpenUrl: openUrl,
    onSettingsChanged: () => {
      savePrefs();
      renderApp();
    },
  });

  registerOverlays();
  wireEvents();
  onAuthFailure(lockConsole);

  try {
    setState({ config: await api.config() });
    buildSettingsForm();
  } catch {
    // The auth call surfaces a useful error if the API is unreachable.
  }
  $("#auth-version").textContent = state.config
    ? `v${state.config.version}${state.config.mock ? " · mock" : ""}`
    : "";
  updateAuthLanguageButton();

  const token = loadToken();
  if (!token) {
    $("#auth-token").focus();
    return;
  }

  setToken(token);
  try {
    await enterConsole();
  } catch {
    lockConsole();
  }
}

async function enterConsole() {
  const config = await api.verify();
  setState({ config: { ...state.config, ...config }, ready: true });
  buildSettingsForm();
  applyTranslations();

  $("#app").hidden = false;
  $("#auth-screen").classList.add("dismissed");
  await refreshSessions({ capacity: true });
  startTimers();
  $("#launch-url").focus();
}

function lockConsole() {
  stopTimers();
  setToken("");
  clearToken();
  setState({ sessions: [], activeId: null, live: {}, capacity: null, ready: false });
  $("#app").hidden = true;
  $("#auth-screen").classList.remove("dismissed");
  $("#auth-token").value = "";
  $("#auth-token").focus();
}

function startTimers() {
  stopTimers();
  tickTimer = setInterval(onTick, 1000);
  pollTimer = setInterval(() => {
    pollCycle += 1;
    void refreshSessions({ capacity: pollCycle % 4 === 0 });
  }, POLL_INTERVAL_MS);
  liveTimer = setInterval(refreshLiveUrls, LIVE_REFRESH_MS);
}

function stopTimers() {
  for (const timer of [pollTimer, tickTimer, liveTimer]) {
    if (timer) {
      clearInterval(timer);
    }
  }
  pollTimer = tickTimer = liveTimer = null;
}

function onTick() {
  renderCountdowns();
  const expired = state.sessions.some(
    (session) => Date.parse(session.expiresAt) <= Date.now(),
  );
  if (expired) {
    void refreshSessions();
  }
}

/* --------------------------------------------------------------- sessions */

async function refreshSessions({ capacity = false } = {}) {
  try {
    const result = await api.listSessions(capacity);
    const sessions = result.sessions;
    const activeId =
      sessions.find((session) => session.id === state.activeId)?.id ??
      sessions[sessions.length - 1]?.id ??
      null;

    for (const id of Object.keys(state.live)) {
      if (!sessions.some((session) => session.id === id)) {
        forgetLive(id);
      }
    }

    setState({
      sessions,
      activeId,
      stats: result.stats,
      capacity: result.capacity ?? state.capacity,
      config: {
        ...state.config,
        maxSessions: result.maxSessions,
        sessionTtlSeconds: result.sessionTtlSeconds,
      },
    });

    if (activeId) {
      await ensureLive(activeId);
    }
    renderApp();
  } catch (error) {
    if (error instanceof ApiError && error.status !== 401) {
      toast(error.localized, { type: "error" });
    }
  }
}

function isTrustedLiveUrl(rawUrl) {
  if (rawUrl.startsWith("/mock-live.html") || rawUrl.startsWith("/screen/")) {
    return true;
  }
  try {
    const url = new URL(rawUrl, location.origin);
    return url.protocol === "https:" && url.hostname === LIVE_VIEW_HOST;
  } catch {
    return false;
  }
}

async function ensureLive(sessionId, { force = false } = {}) {
  const existing = liveFor(sessionId);
  if (existing && !force && Date.now() - existing.refreshedAt < LIVE_REFRESH_MS) {
    return existing;
  }

  const session = state.sessions.find((entry) => entry.id === sessionId);
  // Mock container sessions have no real desktop behind them, so they keep the
  // local placeholder instead of a ticketed screen path.
  if (session?.kind === "container" && !session.mock) {
    const ticket = await api.screenTicket(sessionId);
    rememberLive(sessionId, {
      liveUrl: ticket.url,
      inspectorUrl: ticket.url,
    });
    return liveFor(sessionId);
  }

  const result = await api.liveUrl(sessionId);
  if (!isTrustedLiveUrl(result.liveUrl)) {
    throw new ApiError("Unexpected live view URL", "INVALID_LIVE_URL", 502);
  }
  rememberLive(sessionId, {
    liveUrl: result.liveUrl,
    inspectorUrl: result.inspectorUrl,
  });
  upsertSession(result.session);
  return liveFor(sessionId);
}

async function refreshLiveUrls() {
  for (const session of state.sessions) {
    try {
      await ensureLive(session.id, { force: true });
    } catch {
      // A stale session is dropped by the next poll.
    }
  }
  renderApp();
}

function upsertSession(session) {
  if (!session) {
    return;
  }
  const sessions = state.sessions.some((entry) => entry.id === session.id)
    ? state.sessions.map((entry) => (entry.id === session.id ? session : entry))
    : [...state.sessions, session];
  setState({ sessions });
}

function selectSession(sessionId) {
  if (isCompactViewport()) {
    setRailOpen(false);
  }
  setState({ activeId: sessionId, showLauncher: false });
  void ensureLive(sessionId).catch(() => {});
  renderApp();
}

async function launchSession(rawUrl) {
  const url = rawUrl.trim();
  if (!url || state.launching) {
    return;
  }
  if (state.sessions.length >= (state.config?.maxSessions ?? 3)) {
    toast(t("session.limit"), { type: "error" });
    return;
  }

  const kind = selectedSessionKind();
  setState({ launching: true });
  setLoadingStep("validate");
  renderApp();
  $("#loading-title").textContent =
    kind === "container" ? t("kind.containerStarting") : t("stage.loadingTitle");
  const launchLabel = $("#launch-button").querySelector("span");
  launchLabel.textContent = t("launcher.launching");
  const stepTimer = setTimeout(() => setLoadingStep("launch"), 700);
  const navigateTimer = setTimeout(
    () => setLoadingStep("navigate"),
    kind === "container" ? 20_000 : 3200,
  );

  try {
    const result = await api.createSession(url, toApiSettings(), kind);
    rememberLive(result.session.id, {
      liveUrl: result.liveUrl,
      inspectorUrl: result.inspectorUrl,
    });
    setState({
      launching: false,
      activeId: result.session.id,
      showLauncher: false,
    });
    upsertSession(result.session);
    setLocalHistory(
      rememberVisit(getLocalHistory(), result.session.targetUrl, result.session.title),
    );
    $("#launch-url").value = "";
    if (result.session.kind === "container") {
      await ensureLive(result.session.id, { force: true });
    }
    toast(t("session.created"), { type: "success" });
    renderApp();
  } catch (error) {
    setState({ launching: false });
    renderApp();
    reportError(error);
  } finally {
    clearTimeout(stepTimer);
    clearTimeout(navigateTimer);
    launchLabel.textContent = t("launcher.launch");
  }
}

function openUrl(url) {
  const session = activeSession();
  if (session) {
    void navigateSession({ url });
    return;
  }
  $("#launch-url").value = url;
  void launchSession(url);
}

async function navigateSession(payload) {
  const session = activeSession();
  if (!session) {
    toast(t("session.none"), { type: "error" });
    return;
  }

  const omnibox = $("#omnibox");
  omnibox.classList.add("busy");
  try {
    const result = await api.navigate(session.id, payload);
    upsertSession(result.session);
    setLocalHistory(
      rememberVisit(getLocalHistory(), result.session.targetUrl, result.session.title),
    );
    toast(t("session.navigated", { host: hostOf(result.session.targetUrl) }), {
      type: "success",
      duration: 2200,
    });
    renderApp();
  } catch (error) {
    reportError(error);
  } finally {
    omnibox.classList.remove("busy");
  }
}

async function stopSession(sessionId) {
  const id = sessionId ?? state.activeId;
  if (!id) {
    return;
  }
  try {
    await api.stopSession(id);
    forgetLive(id);
    setState({
      sessions: state.sessions.filter((session) => session.id !== id),
      activeId: state.activeId === id ? null : state.activeId,
    });
    toast(t("session.stopped"), { type: "success" });
    await refreshSessions();
  } catch (error) {
    reportError(error);
    await refreshSessions();
  }
}

async function stopAllSessions() {
  if (state.sessions.length === 0) {
    return;
  }
  try {
    const result = await api.stopAll();
    toast(t("session.stoppedAll", { count: result.stopped.length }), {
      type: "success",
    });
  } catch (error) {
    reportError(error);
  }
  setState({ sessions: [], activeId: null, live: {} });
  await refreshSessions();
}

async function extendSession() {
  const session = activeSession();
  if (!session) {
    return;
  }
  try {
    const result = await api.extend(session.id, state.config?.sessionTtlSeconds);
    upsertSession(result.session);
    toast(
      t("session.extended", {
        time: formatClock(result.session.remainingSeconds),
      }),
      { type: "success" },
    );
    renderApp();
  } catch (error) {
    reportError(error);
  }
}

async function captureScreenshot({ fullPage = false } = {}) {
  const session = activeSession();
  if (!session) {
    return;
  }
  const dismiss = toast(t("toast.working"), { duration: 0 });
  try {
    const { blob, fileName } = await api.screenshot(session.id, {
      fullPage,
      format: "png",
    });
    downloadBlob(blob, fileName);
    toast(t("toast.screenshotSaved"), { type: "success" });
  } catch (error) {
    reportError(error);
  } finally {
    dismiss();
  }
}

async function exportPdf() {
  const session = activeSession();
  if (!session) {
    return;
  }
  const dismiss = toast(t("toast.working"), { duration: 0 });
  try {
    const { blob, fileName } = await api.pdf(session.id);
    downloadBlob(blob, fileName);
    toast(t("toast.pdfSaved"), { type: "success" });
  } catch (error) {
    reportError(error);
  } finally {
    dismiss();
  }
}

async function extractText() {
  const session = activeSession();
  if (!session) {
    return;
  }
  const dismiss = toast(t("toast.working"), { duration: 0 });
  try {
    const result = await api.extract(session.id);
    $("#extract-title").textContent = result.title || hostOf(result.url);
    $("#extract-url").textContent = prettyUrl(result.url);
    $("#extract-text").textContent = result.text || t("extract.empty");
    $("#extract-meta").textContent = [
      t("extract.meta", {
        chars: result.text.length,
        links: result.links.length,
      }),
      result.truncated ? t("extract.truncated") : "",
    ]
      .filter(Boolean)
      .join(" · ");
    openOverlay("extract");
  } catch (error) {
    reportError(error);
  } finally {
    dismiss();
  }
}

function reportError(error) {
  const message =
    error instanceof ApiError ? error.localized : t("common.unknownError");
  toast(message, { type: "error", duration: 6000 });
}

/* --------------------------------------------------------------- overlays */

function registerOverlays() {
  registerOverlay("settings", {
    element: $("#settings-drawer"),
    backdrop: $("#drawer-backdrop"),
    onOpen: () => {
      writeSettingsForm();
      if (state.sessions.length > 0) {
        toast(t("drawer.nextSession"), { duration: 2600 });
      }
    },
    onClose: () => {
      savePrefs();
      renderApp();
    },
  });
  registerOverlay("extract", {
    element: $("#extract-modal"),
    backdrop: $("#modal-backdrop"),
  });
  registerOverlay("shortcuts", {
    element: $("#shortcuts-modal"),
    backdrop: $("#modal-backdrop"),
    onOpen: renderShortcuts,
  });
  registerOverlay("palette", {
    element: $("#palette"),
    onOpen: () => {
      const input = $("#palette-input");
      input.value = "";
      renderPalette("");
      input.focus();
    },
  });
}

const SHORTCUTS = [
  { keys: ["⌘", "K"], key: "shortcuts.palette" },
  { keys: ["⌘", "L"], key: "shortcuts.omnibox" },
  { keys: ["⇧", "⌘", "N"], key: "shortcuts.new" },
  { keys: ["⇧", "⌘", "S"], key: "shortcuts.screenshot" },
  { keys: ["⇧", "⌘", "E"], key: "shortcuts.extract" },
  { keys: ["⇧", "⌘", "R"], key: "shortcuts.reload" },
  { keys: ["⇧", "⌘", "X"], key: "shortcuts.stop" },
  { keys: ["⇧", "⌘", "F"], key: "shortcuts.fullscreen" },
  { keys: ["⌘", "1-9"], key: "shortcuts.switch" },
  { keys: ["Esc"], key: "shortcuts.close" },
];

function renderShortcuts() {
  $("#shortcut-list").replaceChildren(
    ...SHORTCUTS.map((shortcut) =>
      el("li", {}, [
        el("span", { textContent: t(shortcut.key) }),
        el(
          "span",
          { class: "keys" },
          shortcut.keys.map((key) => el("kbd", { textContent: key })),
        ),
      ]),
    ),
  );
}

/* ---------------------------------------------------------------- palette */

function paletteCommands() {
  const hasSession = Boolean(activeSession());
  const commands = [
    { id: "new", group: "actions", label: t("palette.newSession"), run: focusLauncher },
    {
      id: "reload",
      group: "actions",
      label: t("palette.reload"),
      enabled: hasSession,
      run: () => navigateSession({ direction: "reload" }),
    },
    {
      id: "screenshot",
      group: "actions",
      label: t("palette.screenshot"),
      enabled: hasSession,
      run: () => captureScreenshot({ fullPage: true }),
    },
    {
      id: "pdf",
      group: "actions",
      label: t("palette.pdf"),
      enabled: hasSession,
      run: exportPdf,
    },
    {
      id: "extract",
      group: "actions",
      label: t("palette.extract"),
      enabled: hasSession,
      run: extractText,
    },
    {
      id: "extend",
      group: "actions",
      label: t("palette.extend"),
      enabled: hasSession,
      run: extendSession,
    },
    {
      id: "copy",
      group: "actions",
      label: t("palette.copyUrl"),
      enabled: hasSession,
      run: async () => {
        if (await copyText(activeSession().targetUrl)) {
          toast(t("common.copied"), { type: "success" });
        }
      },
    },
    {
      id: "stop",
      group: "actions",
      label: t("palette.stopSession"),
      enabled: hasSession,
      run: () => stopSession(),
    },
    {
      id: "stop-all",
      group: "actions",
      label: t("palette.stopAll"),
      enabled: state.sessions.length > 0,
      run: stopAllSessions,
    },
    {
      id: "reconnect",
      group: "actions",
      label: t("palette.reconnect"),
      enabled: hasSession,
      run: async () => {
        const session = activeSession();
        await ensureLive(session.id, { force: true });
        reloadFrame(session.id);
      },
    },
    {
      id: "settings",
      group: "actions",
      label: t("palette.settings"),
      run: () => openOverlay("settings"),
    },
    { id: "theme", group: "actions", label: t("palette.theme"), run: cycleTheme },
    {
      id: "language",
      group: "actions",
      label: t("palette.language"),
      run: switchLanguage,
    },
    {
      id: "shortcuts",
      group: "actions",
      label: t("palette.shortcuts"),
      run: () => openOverlay("shortcuts"),
    },
    { id: "logout", group: "actions", label: t("palette.logout"), run: lockConsole },
  ];

  for (const [index, session] of state.sessions.entries()) {
    commands.push({
      id: `session-${session.id}`,
      group: "sessions",
      label: `${index + 1}. ${session.title || session.hostname}`,
      hint: prettyUrl(session.targetUrl),
      run: () => selectSession(session.id),
    });
  }

  for (const entry of getLocalHistory().slice(0, 8)) {
    commands.push({
      id: `history-${entry.url}`,
      group: "history",
      label: entry.title || hostOf(entry.url),
      hint: prettyUrl(entry.url),
      run: () => openUrl(entry.url),
    });
  }

  return commands.filter((command) => command.enabled !== false);
}

let paletteIndex = 0;
let paletteMatches = [];

function renderPalette(query) {
  const normalized = query.trim().toLowerCase();
  paletteMatches = paletteCommands().filter(
    (command) =>
      !normalized ||
      `${command.label} ${command.hint ?? ""} ${command.id}`
        .toLowerCase()
        .includes(normalized),
  );
  paletteIndex = 0;

  const groups = { actions: t("palette.groupActions"), sessions: t("palette.groupSessions"), history: t("palette.groupHistory") };
  const list = $("#palette-results");
  const nodes = [];
  let lastGroup = "";

  paletteMatches.forEach((command, index) => {
    if (command.group !== lastGroup) {
      lastGroup = command.group;
      nodes.push(
        el("li", { class: "palette-group", textContent: groups[command.group] }),
      );
    }
    nodes.push(
      el(
        "li",
        {
          class: `palette-item${index === 0 ? " selected" : ""}`,
          dataset: { index: String(index) },
          onclick: () => runPaletteCommand(index),
          onmousemove: () => highlightPalette(index),
        },
        [
          el("span", { class: "palette-label", textContent: command.label }),
          command.hint
            ? el("span", { class: "palette-hint", textContent: command.hint })
            : null,
        ],
      ),
    );
  });

  if (paletteMatches.length === 0) {
    nodes.push(el("li", { class: "palette-empty", textContent: t("palette.empty") }));
  }
  list.replaceChildren(...nodes);
}

function highlightPalette(index) {
  paletteIndex = Math.max(0, Math.min(paletteMatches.length - 1, index));
  for (const item of document.querySelectorAll(".palette-item")) {
    item.classList.toggle("selected", Number(item.dataset.index) === paletteIndex);
  }
  document
    .querySelector(`.palette-item[data-index="${paletteIndex}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

function runPaletteCommand(index) {
  const command = paletteMatches[index];
  if (!command) {
    return;
  }
  closeOverlay("palette");
  void command.run();
}

/* ------------------------------------------------------------ preferences */

function cycleTheme() {
  const order = ["system", "light", "dark"];
  prefs.theme = order[(order.indexOf(prefs.theme) + 1) % order.length];
  applyTheme(prefs.theme);
  savePrefs();
}

function switchLanguage() {
  prefs.language = nextLanguage(prefs.language);
  setLanguage(prefs.language);
  savePrefs();
  applyTranslations();
  buildSettingsForm();
  updateAuthLanguageButton();
  renderHistory();
  renderApp();
}

function updateAuthLanguageButton() {
  const label = $("#auth-lang").querySelector("span");
  label.textContent = nextLanguage() === "en" ? "English" : "简体中文";
}

function selectedSessionKind() {
  const checked = document.querySelector(
    'input[name="session-kind"]:checked',
  );
  return checked?.value === "container" ? "container" : "browser-run";
}

function isCompactViewport() {
  return window.matchMedia("(max-width: 900px)").matches;
}

/** Narrow strip on desktop, off-canvas drawer on small screens. */
function toggleRail() {
  if (isCompactViewport()) {
    setRailOpen(!$("#rail").classList.contains("open"));
    return;
  }
  prefs.railCollapsed = !prefs.railCollapsed;
  toggleClass($("#rail"), "collapsed", prefs.railCollapsed);
  savePrefs();
}

function setRailOpen(open) {
  toggleClass($("#rail"), "open", open);
  show($("#rail-scrim"), open);
}

function focusLauncher() {
  if (isCompactViewport()) {
    setRailOpen(false);
  }
  setState({ showLauncher: true });
  renderApp();
  const input = $("#launch-url");
  input.focus();
  input.select();
}

/** Returns to the live view without starting a session. */
function closeLauncher() {
  if (state.sessions.length === 0) {
    return false;
  }
  setState({ showLauncher: false });
  renderApp();
  return true;
}

async function toggleFullscreen() {
  const stage = $("#stage");
  try {
    if (document.fullscreenElement === stage) {
      await document.exitFullscreen();
    } else {
      await stage.requestFullscreen();
    }
  } catch {
    toast(t("common.unknownError"), { type: "error" });
  }
}

/* ------------------------------------------------------------------ wiring */

function wireEvents() {
  $("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#auth-token");
    const error = $("#auth-error");
    show(error, false);

    if (!input.value) {
      error.textContent = t("auth.empty");
      show(error, true);
      return;
    }

    const button = $("#auth-button");
    button.disabled = true;
    button.querySelector("span").textContent = t("auth.verifying");
    setToken(input.value);
    try {
      saveToken(input.value);
      await enterConsole();
      toast(t("auth.welcome"), { type: "success", duration: 2400 });
    } catch (caught) {
      clearToken();
      setToken("");
      error.textContent =
        caught instanceof ApiError ? caught.localized : t("common.unknownError");
      show(error, true);
    } finally {
      button.disabled = false;
      button.querySelector("span").textContent = t("auth.enter");
    }
  });

  $("#auth-lang").addEventListener("click", switchLanguage);
  $("#logout-button").addEventListener("click", lockConsole);
  $("#theme-button").addEventListener("click", cycleTheme);
  $("#lang-button").addEventListener("click", switchLanguage);
  $("#shortcuts-button").addEventListener("click", () => openOverlay("shortcuts"));
  $("#status-palette").addEventListener("click", () => openOverlay("palette"));

  $("#rail-toggle").addEventListener("click", toggleRail);
  $("#rail-open").addEventListener("click", toggleRail);
  $("#rail-scrim").addEventListener("click", () => setRailOpen(false));

  $("#new-session-button").addEventListener("click", focusLauncher);
  $("#launcher-close").addEventListener("click", closeLauncher);
  $("#clear-history-button").addEventListener("click", () => {
    setLocalHistory(clearHistory());
    toast(t("rail.historyCleared"), { duration: 2200 });
  });

  for (const radio of document.querySelectorAll('input[name="session-kind"]')) {
    radio.checked = radio.value === prefs.settings.kind;
    radio.addEventListener("change", () => {
      prefs.settings = { ...prefs.settings, kind: selectedSessionKind() };
      savePrefs();
    });
  }

  $("#launch-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void launchSession($("#launch-url").value);
  });

  $("#omnibox-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = $("#omnibox").value.trim();
    if (value) {
      void navigateSession({ url: value });
    }
  });

  $("#nav-back").addEventListener("click", () => navigateSession({ direction: "back" }));
  $("#nav-forward").addEventListener("click", () =>
    navigateSession({ direction: "forward" }),
  );
  $("#nav-reload").addEventListener("click", () =>
    navigateSession({ direction: "reload" }),
  );
  $("#action-screenshot").addEventListener("click", () =>
    captureScreenshot({ fullPage: false }),
  );
  $("#action-pdf").addEventListener("click", exportPdf);
  $("#action-extract").addEventListener("click", extractText);
  $("#action-extend").addEventListener("click", extendSession);
  $("#action-fullscreen").addEventListener("click", toggleFullscreen);
  $("#action-stop").addEventListener("click", () => stopSession());

  $("#open-settings-button").addEventListener("click", () => openOverlay("settings"));
  $("#rail-settings-button").addEventListener("click", () => openOverlay("settings"));
  $("#drawer-close").addEventListener("click", () => closeOverlay("settings"));
  $("#settings-done").addEventListener("click", () => closeOverlay("settings"));
  $("#drawer-backdrop").addEventListener("click", () => closeOverlay("settings"));
  $("#modal-backdrop").addEventListener("click", () => closeTopOverlay());
  $("#extract-close").addEventListener("click", () => closeOverlay("extract"));
  $("#shortcuts-close").addEventListener("click", () => closeOverlay("shortcuts"));

  $("#extract-copy").addEventListener("click", async () => {
    if (await copyText($("#extract-text").textContent ?? "")) {
      toast(t("common.copied"), { type: "success" });
    }
  });

  $("#settings-form").addEventListener("input", onSettingsInput);
  $("#settings-form").addEventListener("change", onSettingsInput);
  $("#setting-region").addEventListener("change", (event) => {
    onRegionChanged(event.target.value);
    onSettingsInput();
  });
  $("#setting-preset").addEventListener("change", (event) => {
    onDeviceChanged(event.target.value);
    onSettingsInput();
  });
  $("#fingerprint-fix").addEventListener("click", () => {
    alignFingerprint();
    savePrefs();
    $("#settings-summary").textContent = settingsSummary();
    renderApp();
    toast(t("fingerprint.aligned"), { type: "success", duration: 2600 });
  });
  $("#settings-reset").addEventListener("click", () => {
    prefs.settings = { ...DEFAULT_SETTINGS };
    savePrefs();
    writeSettingsForm();
    renderApp();
    toast(t("drawer.reseted"), { duration: 2200 });
  });

  $("#palette-input").addEventListener("input", (event) =>
    renderPalette(event.target.value),
  );
  $("#palette").addEventListener("click", (event) => {
    if (event.target === $("#palette")) {
      closeOverlay("palette");
    }
  });

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("fullscreenchange", () => {
    const fullscreen = document.fullscreenElement === $("#stage");
    toggleClass($("#stage"), "fullscreen", fullscreen);
    $("#action-fullscreen").title = t(
      fullscreen ? "chrome.exitFullscreen" : "chrome.fullscreen",
    );
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.ready) {
      void refreshSessions();
    }
  });
  window.addEventListener("online", () => toast(t("toast.online"), { type: "success" }));
  window.addEventListener("offline", () => toast(t("toast.offline"), { type: "error" }));
  watchSystemTheme(() => {
    if (prefs.theme === "system") {
      applyTheme("system");
    }
  });
}

function onSettingsInput() {
  prefs.settings = readSettingsForm();
  savePrefs();
  $("#settings-summary").textContent = settingsSummary();
  renderApp();
}

function onKeyDown(event) {
  const meta = event.metaKey || event.ctrlKey;

  if (event.key === "Escape") {
    if (isOverlayOpen()) {
      event.preventDefault();
      closeTopOverlay();
    } else if (state.showLauncher && closeLauncher()) {
      event.preventDefault();
    }
    return;
  }

  if (isOverlayOpen("palette")) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlightPalette(paletteIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlightPalette(paletteIndex - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runPaletteCommand(paletteIndex);
    }
    return;
  }

  if (!state.ready) {
    return;
  }

  if (meta && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openOverlay("palette");
    return;
  }

  if (meta && event.key.toLowerCase() === "l") {
    event.preventDefault();
    const omnibox = $("#omnibox");
    if (omnibox.disabled) {
      focusLauncher();
    } else {
      omnibox.focus();
      omnibox.select();
    }
    return;
  }

  if (meta && event.shiftKey) {
    const key = event.key.toLowerCase();
    const actions = {
      n: focusLauncher,
      s: () => captureScreenshot({ fullPage: false }),
      e: extractText,
      r: () => navigateSession({ direction: "reload" }),
      x: () => stopSession(),
      f: toggleFullscreen,
    };
    if (actions[key]) {
      event.preventDefault();
      void actions[key]();
    }
    return;
  }

  if (meta && /^[1-9]$/.test(event.key)) {
    const session = state.sessions[Number(event.key) - 1];
    if (session) {
      event.preventDefault();
      selectSession(session.id);
    }
    return;
  }

  if (event.key === "?" && !isTypingTarget(event.target)) {
    event.preventDefault();
    openOverlay("shortcuts");
  }
}

void boot();
