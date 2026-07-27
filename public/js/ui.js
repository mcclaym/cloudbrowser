import { $, el, icon } from "./dom.js";

/* ------------------------------------------------------------------ toasts */

const TOAST_ICONS = {
  info: "i-cloud",
  success: "i-check",
  error: "i-alert",
};

export function toast(message, options = {}) {
  const { type = "info", duration = 4200 } = options;
  const host = $("#toasts");
  if (!host) {
    return () => {};
  }

  const node = el("div", { class: `toast toast-${type}`, role: "status" }, [
    icon(TOAST_ICONS[type] ?? TOAST_ICONS.info, "toast-icon"),
    el("span", { class: "toast-text", textContent: message }),
  ]);

  const dismiss = () => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 220);
  };

  node.addEventListener("click", dismiss);
  host.append(node);
  requestAnimationFrame(() => node.classList.add("entering"));

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
  return dismiss;
}

/* ---------------------------------------------------------------- overlays */

const overlays = new Map();
const stack = [];

export function registerOverlay(name, config) {
  overlays.set(name, config);
}

export function isOverlayOpen(name) {
  return name ? stack.includes(name) : stack.length > 0;
}

export function openOverlay(name, payload) {
  const overlay = overlays.get(name);
  if (!overlay || stack.includes(name)) {
    return;
  }

  overlay.lastFocus = document.activeElement;
  overlay.element.hidden = false;
  if (overlay.backdrop) {
    overlay.backdrop.hidden = false;
  }
  requestAnimationFrame(() => overlay.element.classList.add("open"));
  stack.push(name);
  document.body.classList.add("overlay-open");
  overlay.onOpen?.(payload);

  const focusTarget =
    overlay.element.querySelector("[data-autofocus]") ??
    overlay.element.querySelector(
      "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])",
    );
  focusTarget?.focus();
}

export function closeOverlay(name) {
  const overlay = overlays.get(name);
  const index = stack.indexOf(name);
  if (!overlay || index === -1) {
    return;
  }

  stack.splice(index, 1);
  overlay.element.classList.remove("open");
  if (overlay.backdrop && !stack.some((other) => overlays.get(other)?.backdrop === overlay.backdrop)) {
    overlay.backdrop.hidden = true;
  }
  setTimeout(() => {
    if (!stack.includes(name)) {
      overlay.element.hidden = true;
    }
  }, 180);

  if (stack.length === 0) {
    document.body.classList.remove("overlay-open");
  }
  overlay.onClose?.();
  if (overlay.lastFocus instanceof HTMLElement) {
    overlay.lastFocus.focus();
  }
}

export function closeTopOverlay() {
  const name = stack[stack.length - 1];
  if (name) {
    closeOverlay(name);
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------- theme */

export function applyTheme(theme) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "light" ? "#f4f6fb" : "#080b14");
  }
  return resolved;
}

export function watchSystemTheme(onChange) {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  media.addEventListener("change", onChange);
}
