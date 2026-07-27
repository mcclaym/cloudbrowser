import {
  $,
  el,
  formatClock,
  formatDuration,
  formatRelative,
  hostOf,
  icon,
  prettyUrl,
  setDisabled,
  show,
  toggleClass,
} from "./dom.js";
import { getLanguage, optionLabel, t } from "./i18n.js";
import { activeSession, liveFor, prefs, state } from "./state.js";
import { selectPreset, settingsSummary } from "./settings.js";

const QUICK_LINKS = [
  { label: "Wikipedia", url: "https://www.wikipedia.org" },
  { label: "Hacker News", url: "https://news.ycombinator.com" },
  { label: "GitHub", url: "https://github.com" },
  { label: "Cloudflare Docs", url: "https://developers.cloudflare.com" },
];

let handlers = {};
let localHistory = [];

export function initRender(nextHandlers) {
  handlers = nextHandlers;
}

export function setLocalHistory(history) {
  localHistory = history;
  renderHistory();
}

export function getLocalHistory() {
  return localHistory;
}

export function renderApp() {
  renderSessionList();
  renderChrome();
  renderStage();
  renderStatus();
  renderLauncher();
  renderCapacity();
}

/* --------------------------------------------------------------- sidebar */

function renderSessionList() {
  const list = $("#session-list");
  const sessions = state.sessions;
  $("#session-count").textContent = String(sessions.length);
  show($("#session-list-empty"), sessions.length === 0);

  list.replaceChildren(
    ...sessions.map((session, index) => {
      const active = session.id === state.activeId;
      const remaining = remainingSeconds(session);
      const ratio = Math.max(0, Math.min(1, remaining / session.ttlSeconds));

      const card = el(
        "li",
        {
          class: `session-card${active ? " active" : ""}${remaining <= 60 ? " urgent" : ""}`,
          dataset: { session: session.id },
        },
        [
          el("button", {
            class: "session-main",
            type: "button",
            title: `${t("session.switch")} · ${session.targetUrl}`,
            onclick: () => handlers.onSelectSession?.(session.id),
          }, [
            el("span", { class: "session-index", textContent: String(index + 1) }),
            el("span", { class: "session-text" }, [
              el("strong", { textContent: session.title || session.hostname }),
              el("small", { textContent: prettyUrl(session.targetUrl) }),
            ]),
          ]),
          el("div", { class: "session-meta" }, [
            el("span", {
              class: "session-timer",
              dataset: { countdown: session.id },
              textContent: formatClock(remaining),
            }),
            session.mock ? el("span", { class: "tag", textContent: t("status.mock") }) : null,
            el(
              "button",
              {
                class: "icon-button tiny danger",
                type: "button",
                title: t("session.close"),
                "aria-label": t("session.close"),
                onclick: (event) => {
                  event.stopPropagation();
                  handlers.onStopSession?.(session.id);
                },
              },
              [icon("i-close")],
            ),
          ]),
          progressBar(ratio, session.id),
        ],
      );
      return card;
    }),
  );
}

function progressBar(ratio, sessionId) {
  const fill = el("div", { class: "meter-fill", dataset: { meter: sessionId } });
  fill.style.setProperty("--ratio", String(ratio));
  return el("div", { class: "meter session-meter" }, [fill]);
}

export function renderHistory() {
  const list = $("#history-list");
  show($("#history-empty"), localHistory.length === 0);
  list.replaceChildren(
    ...localHistory.slice(0, 12).map((entry) =>
      el("li", {}, [
        el(
          "button",
          {
            class: "history-item",
            type: "button",
            title: entry.url,
            onclick: () => handlers.onOpenUrl?.(entry.url),
          },
          [
            el("span", { class: "history-host", textContent: hostOf(entry.url) }),
            el("span", {
              class: "history-time",
              textContent: formatRelative(entry.at, getLanguage()),
            }),
          ],
        ),
      ]),
    ),
  );
}

export function renderCapacity() {
  const capacity = state.capacity;
  const host = $("#capacity");
  if (!capacity) {
    show(host, false);
    return;
  }
  show(host, true);
  const used = Math.max(capacity.activeSessions, state.sessions.length);
  const total = Math.max(1, capacity.maxConcurrentSessions);
  $("#capacity-value").textContent = `${used} / ${total}`;
  $("#capacity-meter").style.setProperty("--ratio", String(Math.min(1, used / total)));
}

/* ---------------------------------------------------------------- chrome */

function renderChrome() {
  const session = activeSession();
  const live = session ? liveFor(session.id) : null;
  const omnibox = $("#omnibox");

  for (const selector of [
    "#nav-back",
    "#nav-forward",
    "#nav-reload",
    "#action-screenshot",
    "#action-pdf",
    "#action-extract",
    "#action-extend",
    "#action-fullscreen",
    "#action-stop",
  ]) {
    setDisabled($(selector), !session);
  }
  setDisabled($("#omnibox-go"), !session);
  omnibox.disabled = !session;

  if (!session) {
    omnibox.value = "";
    show($("#omnibox-badge"), false);
    $("#action-open-tab").removeAttribute("href");
    return;
  }

  if (document.activeElement !== omnibox) {
    omnibox.value = session.targetUrl;
  }

  const badge = $("#omnibox-badge");
  const badgeText = session.mock
    ? t("status.mock")
    : session.region || `${session.device.width}×${session.device.height}`;
  badge.textContent = badgeText;
  show(badge, Boolean(badgeText));

  const tabLink = $("#action-open-tab");
  if (live?.liveUrl) {
    tabLink.href = live.liveUrl;
    tabLink.classList.remove("disabled");
  } else {
    tabLink.removeAttribute("href");
    tabLink.classList.add("disabled");
  }
}

/* ----------------------------------------------------------------- stage */

function renderStage() {
  const host = $("#stage-frames");
  const seen = new Set();

  for (const session of state.sessions) {
    const live = liveFor(session.id);
    if (!live?.liveUrl) {
      continue;
    }
    seen.add(session.id);

    let frame = host.querySelector(`[data-session="${session.id}"]`);
    if (!frame) {
      // Mock sessions have no remote stream, so they render locally instead of
      // being framed — that keeps the strict frame-ancestors policy intact.
      frame = session.mock
        ? mockStage(session)
        : liveFrame(session, live.liveUrl);
      host.append(frame);
    } else if (session.mock) {
      frame.replaceChildren(...mockStage(session).childNodes);
    }
    toggleClass(frame, "active", session.id === state.activeId);
  }

  for (const frame of [...host.children]) {
    if (!seen.has(frame.dataset.session)) {
      frame.remove();
    }
  }

  const hasActiveFrame = Boolean(
    state.activeId && host.querySelector(`[data-session="${state.activeId}"]`),
  );
  const launcherVisible =
    !state.launching && (state.showLauncher || !hasActiveFrame);
  show($("#launcher"), launcherVisible);
  show($("#launcher-close"), launcherVisible && state.sessions.length > 0);
  show($("#stage-loading"), state.launching);
  toggleClass($("#stage"), "has-frame", hasActiveFrame);
}

function liveFrame(session, liveUrl) {
  const frame = el("iframe", {
    class: "stage-frame loading",
    dataset: { session: session.id, src: liveUrl },
    title: `CloudBrowser · ${session.hostname}`,
    referrerpolicy: "no-referrer",
    allowfullscreen: true,
    src: liveUrl,
  });
  frame.addEventListener("load", () => frame.classList.remove("loading"));
  return frame;
}

function mockStage(session) {
  return el(
    "div",
    { class: "stage-frame stage-mock", dataset: { session: session.id } },
    [
      el("div", { class: "stage-mock-card" }, [
        el("span", { class: "mock-chip", textContent: t("status.mock") }),
        el("strong", { textContent: session.title || session.hostname }),
        el("code", { textContent: session.targetUrl }),
        el("p", { textContent: t("stage.mockNote") }),
      ]),
    ],
  );
}

/** Forces the live view iframe of one session to reconnect. */
export function reloadFrame(sessionId) {
  const live = liveFor(sessionId);
  const frame = $(`#stage-frames iframe[data-session="${sessionId}"]`);
  if (frame && live?.liveUrl) {
    frame.classList.add("loading");
    frame.dataset.src = live.liveUrl;
    frame.src = live.liveUrl;
  }
}

export function setLoadingStep(step) {
  for (const item of document.querySelectorAll("#loading-steps li")) {
    const order = ["validate", "launch", "navigate"];
    const index = order.indexOf(item.dataset.step);
    const current = order.indexOf(step);
    item.classList.toggle("done", index < current);
    item.classList.toggle("current", index === current);
  }
}

/* -------------------------------------------------------------- launcher */

function renderLauncher() {
  const config = state.config;
  if (!config) {
    return;
  }

  $("#launch-hint").textContent = t("launcher.hint", {
    duration: formatDuration(config.sessionTtlSeconds, getLanguage()),
    max: config.maxSessions,
  });
  $("#settings-summary").textContent = settingsSummary();

  const presetHost = $("#device-presets");
  presetHost.replaceChildren(
    ...config.devicePresets.slice(0, 5).map((preset) =>
      el("button", {
        class: `preset-chip${prefs.settings.preset === preset.value ? " selected" : ""}`,
        type: "button",
        title: optionLabel(preset),
        textContent: `${preset.width}×${preset.height}`,
        onclick: () => {
          selectPreset(preset.value);
          handlers.onSettingsChanged?.();
        },
      }),
    ),
  );

  $("#quick-links-label").textContent = t("launcher.quickLinks");
  const quickHost = $("#quick-links");
  quickHost.replaceChildren(
    ...QUICK_LINKS.map((link) =>
      el("li", {}, [
        el("button", {
          class: "quick-link",
          type: "button",
          textContent: link.label,
          onclick: () => handlers.onOpenUrl?.(link.url),
        }),
      ]),
    ),
  );
}

/* ------------------------------------------------------------- statusbar */

function renderStatus() {
  const session = activeSession();
  const stateNode = $("#status-state");
  const label = stateNode.querySelector("span:last-child");

  const expiring = session ? remainingSeconds(session) <= 60 : false;
  stateNode.dataset.state = session
    ? session.mock
      ? "mock"
      : expiring
        ? "expiring"
        : "live"
    : "idle";
  label.textContent = session
    ? session.mock
      ? t("status.mock")
      : expiring
        ? t("status.expiring")
        : t("status.live")
    : t("status.idle");

  $("#status-ref").textContent = session ? `#${session.ref}` : "";
  $("#status-device").textContent = session
    ? `${session.device.width}×${session.device.height}${session.device.isMobile ? " · mobile" : ""}`
    : t("status.sessions", { count: state.sessions.length });
  $("#status-region").textContent = session?.region ?? "";
  renderCountdowns();
}

/** Cheap per-second update that avoids re-rendering the whole tree. */
export function renderCountdowns() {
  for (const session of state.sessions) {
    const remaining = remainingSeconds(session);
    const timer = document.querySelector(`[data-countdown="${session.id}"]`);
    if (timer) {
      timer.textContent = formatClock(remaining);
    }
    const meter = document.querySelector(`[data-meter="${session.id}"]`);
    if (meter) {
      meter.style.setProperty(
        "--ratio",
        String(Math.max(0, Math.min(1, remaining / session.ttlSeconds))),
      );
    }
    const card = document.querySelector(`[data-session="${session.id}"]`);
    toggleClass(card, "urgent", remaining <= 60);
  }

  const session = activeSession();
  const countdown = $("#status-countdown");
  if (!session) {
    countdown.textContent = "";
    countdown.dataset.urgent = "false";
    return;
  }
  const remaining = remainingSeconds(session);
  countdown.textContent = t("session.remaining", { time: formatClock(remaining) });
  countdown.dataset.urgent = String(remaining <= 60);
}

export function remainingSeconds(session) {
  return Math.max(0, Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000));
}
