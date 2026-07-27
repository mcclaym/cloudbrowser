export function $(selector, root = document) {
  return root.querySelector(selector);
}

/** Small element factory: `el("button", { className: "x" }, ["label"])`. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else if (key === "class") {
      node.className = value;
    } else if (key in node) {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

/** `<svg><use href="#id"/></svg>` built without innerHTML. */
export function icon(id, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  if (className) {
    svg.setAttribute("class", className);
  }
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}

export function show(node, visible = true) {
  if (node) {
    node.hidden = !visible;
  }
}

export function toggleClass(node, className, on) {
  if (node) {
    node.classList.toggle(className, Boolean(on));
  }
}

export function setDisabled(node, disabled) {
  if (node) {
    node.disabled = Boolean(disabled);
    node.setAttribute("aria-disabled", String(Boolean(disabled)));
  }
}

/** mm:ss for short sessions, h:mm:ss once it passes an hour. */
export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${pad(minutes)}:${pad(rest)}`;
}

export function formatDuration(totalSeconds, language) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  const zh = language === "zh-CN";
  if (hours > 0) {
    return minutes > 0
      ? zh
        ? `${hours} 小时 ${minutes} 分钟`
        : `${hours}h ${minutes}m`
      : zh
        ? `${hours} 小时`
        : `${hours}h`;
  }
  return zh ? `${Math.max(1, minutes)} 分钟` : `${Math.max(1, minutes)}m`;
}

export function formatRelative(timestamp, language) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  const zh = language === "zh-CN";
  if (seconds < 60) {
    return zh ? "刚刚" : "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return zh ? `${minutes} 分钟前` : `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return zh ? `${hours} 小时前` : `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return zh ? `${days} 天前` : `${days}d ago`;
}

export function hostOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}

export function prettyUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const path = `${url.pathname}${url.search}`.replace(/\/$/, "");
    return `${url.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return rawUrl;
  }
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = el("a", { href: url, download: fileName });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}
