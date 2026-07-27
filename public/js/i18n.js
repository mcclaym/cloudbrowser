export const LANGUAGES = ["zh-CN", "en"];
export const DEFAULT_LANGUAGE = "zh-CN";

export const dictionaries = {
  "zh-CN": {
    "common.close": "关闭",
    "common.copy": "复制",
    "common.copied": "已复制到剪贴板",
    "common.done": "完成",
    "common.unknownError": "出现未知错误。",

    "brand.tagline": "边缘临时浏览器",

    "auth.title": "CloudBrowser 控制台",
    "auth.subtitle":
      "输入访问口令进入。口令只保存在当前标签页，不会写入网址或长期存储。",
    "auth.token": "访问口令",
    "auth.enter": "进入控制台",
    "auth.verifying": "正在验证…",
    "auth.empty": "请输入访问口令。",
    "auth.welcome": "已进入控制台。",

    "rail.toggle": "折叠 / 展开侧栏",
    "rail.newSession": "新建会话",
    "rail.sessions": "运行中的会话",
    "rail.noSessions": "还没有会话，先启动一个。",
    "rail.recent": "最近访问",
    "rail.clear": "清除",
    "rail.noRecent": "这里会保存本机最近打开过的网址。",
    "rail.capacity": "Browser Run 配额",
    "rail.historyCleared": "本机历史已清除。",

    "tools.theme": "切换明暗主题",
    "tools.language": "切换语言",
    "tools.shortcuts": "键盘快捷键",
    "tools.logout": "退出控制台",

    "chrome.back": "后退",
    "chrome.forward": "前进",
    "chrome.reload": "刷新",
    "chrome.placeholder": "输入网址后回车，在当前会话中打开",
    "chrome.screenshot": "截图（⇧⌘S）",
    "chrome.pdf": "导出 PDF",
    "chrome.extract": "提取正文（⇧⌘E）",
    "chrome.extend": "延长会话",
    "chrome.openTab": "在新标签页打开实时画面",
    "chrome.fullscreen": "全屏显示",
    "chrome.exitFullscreen": "退出全屏",
    "chrome.stop": "结束并销毁会话",

    "launcher.pill": "Cloudflare Browser Run",
    "launcher.title": "在云端打开网页，用完即走",
    "launcher.subtitle":
      "远程 Chrome 运行在 Cloudflare 全球网络，页面内容不经过本机，到期自动销毁。",
    "launcher.placeholder": "https://example.com",
    "launcher.launch": "启动浏览器",
    "launcher.launching": "正在启动…",
    "launcher.settings": "浏览器设置",
    "launcher.assurance1": "私网与危险端口已拦截",
    "launcher.assurance2": "到期自动销毁",
    "launcher.assurance3": "可选出口区域与设备模拟",
    "launcher.hint": "每个会话最长 {duration}，同时最多 {max} 个。",
    "launcher.quickLinks": "快速打开",

    "stage.loadingTitle": "正在启动云端浏览器…",
    "stage.step1": "校验目标网址",
    "stage.step2": "分配远程 Chrome",
    "stage.step3": "导航并建立实时画面",
    "stage.mockNote":
      "本地 Mock 模式不会创建真实的 Browser Run 实例，这里只显示会话状态。",

    "status.idle": "空闲",
    "status.live": "会话运行中",
    "status.expiring": "即将到期",
    "status.mock": "本地 Mock",
    "status.palette": "命令面板",
    "status.sessions": "{count} 个会话",

    "session.remaining": "剩余 {time}",
    "session.extended": "会话已延长到 {time}。",
    "session.created": "云端浏览器已就绪。",
    "session.stopped": "会话已关闭并销毁。",
    "session.stoppedAll": "已关闭 {count} 个会话。",
    "session.navigated": "已打开 {host}。",
    "session.switch": "切换到会话",
    "session.close": "关闭会话",
    "session.limit": "已达到同时运行上限。",
    "session.none": "当前没有活动会话。",

    "drawer.eyebrow": "启动前生效",
    "drawer.title": "浏览器设置",
    "drawer.device": "设备与视口",
    "drawer.preset": "预设",
    "drawer.custom": "自定义尺寸",
    "drawer.width": "宽度",
    "drawer.height": "高度",
    "drawer.scale": "像素比",
    "drawer.mobile": "移动设备与触摸模式",
    "drawer.identity": "身份与区域",
    "drawer.region": "出口区域",
    "drawer.regionAuto": "自动（就近）",
    "drawer.locale": "语言",
    "drawer.localeDefault": "Browser Run 默认",
    "drawer.timezone": "时区",
    "drawer.timezoneDefault": "Browser Run 默认",
    "drawer.colorScheme": "网页配色",
    "drawer.colorSystem": "跟随系统",
    "drawer.colorLight": "浅色",
    "drawer.colorDark": "深色",
    "drawer.userAgent": "自定义 User-Agent",
    "drawer.userAgentHint": "留空则使用 Browser Run 默认 UA",
    "drawer.performance": "性能与隐私",
    "drawer.blockLabel": "拦截资源",
    "drawer.reducedMotion": "请求网页减弱动画",
    "drawer.geolocation": "覆盖网页定位",
    "drawer.latitude": "纬度",
    "drawer.longitude": "经度",
    "drawer.accuracy": "精度（米）",
    "drawer.note":
      "设置只保存在本机，会在远程 Chrome 首次导航前应用。修改后对已运行的会话无效，只影响新建的会话。",
    "drawer.reset": "恢复默认",
    "drawer.reseted": "设置已恢复默认。",
    "drawer.nextSession": "这些设置会用于下一个新建的会话。",

    "resource.image": "图片",
    "resource.media": "音视频",
    "resource.font": "字体",
    "resource.stylesheet": "样式表",

    "extract.eyebrow": "页面正文",
    "extract.empty": "这个页面没有可提取的文本。",
    "extract.meta": "{chars} 个字符 · {links} 个链接",
    "extract.truncated": "内容过长，已截断。",

    "shortcuts.title": "键盘快捷键",
    "shortcuts.palette": "打开命令面板",
    "shortcuts.omnibox": "聚焦地址栏",
    "shortcuts.new": "新建会话",
    "shortcuts.screenshot": "截图当前页面",
    "shortcuts.extract": "提取页面正文",
    "shortcuts.reload": "刷新页面",
    "shortcuts.stop": "结束当前会话",
    "shortcuts.fullscreen": "全屏 / 退出全屏",
    "shortcuts.switch": "切换到第 N 个会话",
    "shortcuts.close": "关闭弹层",

    "palette.placeholder": "搜索命令、会话或最近网址…",
    "palette.empty": "没有匹配的命令。",
    "palette.groupActions": "操作",
    "palette.groupSessions": "会话",
    "palette.groupHistory": "最近访问",
    "palette.newSession": "新建会话",
    "palette.stopSession": "结束当前会话",
    "palette.stopAll": "结束全部会话",
    "palette.screenshot": "截图当前页面",
    "palette.pdf": "导出当前页面 PDF",
    "palette.extract": "提取页面正文",
    "palette.extend": "延长当前会话",
    "palette.reload": "刷新当前页面",
    "palette.copyUrl": "复制当前网址",
    "palette.reconnect": "重新连接实时画面",
    "palette.settings": "打开浏览器设置",
    "palette.theme": "切换明暗主题",
    "palette.language": "切换界面语言",
    "palette.shortcuts": "查看键盘快捷键",
    "palette.logout": "退出控制台",

    "toast.screenshotSaved": "截图已下载。",
    "toast.pdfSaved": "PDF 已下载。",
    "toast.working": "正在处理…",
    "toast.offline": "网络连接已断开。",
    "toast.online": "网络已恢复。",

    "error.network": "无法连接服务端，请检查网络。",
    "error.UNAUTHORIZED": "访问口令不正确。",
    "error.TOO_MANY_ATTEMPTS": "尝试次数过多，请稍后再试。",
    "error.AUTH_NOT_CONFIGURED": "服务端尚未设置 ADMIN_TOKEN。",
    "error.BROWSER_API_NOT_CONFIGURED":
      "服务端尚未配置 Cloudflare Account ID 或 Browser Run Token。",
    "error.SESSION_LIMIT_REACHED": "同时运行的云端浏览器已达上限。",
    "error.SESSION_NOT_FOUND": "找不到这个会话。",
    "error.SESSION_EXPIRED": "会话已到期并被销毁。",
    "error.BROWSER_SESSION_GONE": "远程浏览器已被回收，请重新启动会话。",
    "error.EXTENSION_LIMIT_REACHED": "会话已达到最长运行时间。",
    "error.NO_HISTORY_ENTRY": "没有可以跳转的历史页面。",
    "error.INVALID_TARGET_URL": "网址无效或不被允许。",
    "error.MOCK_UNSUPPORTED": "本地 Mock 模式不支持这个操作。",
    "error.CAPACITY_UNAVAILABLE": "暂时无法读取 Browser Run 配额。",
  },

  en: {
    "common.close": "Close",
    "common.copy": "Copy",
    "common.copied": "Copied to clipboard",
    "common.done": "Done",
    "common.unknownError": "Something went wrong.",

    "brand.tagline": "Ephemeral edge browser",

    "auth.title": "CloudBrowser console",
    "auth.subtitle":
      "Enter the access token to continue. It stays in this tab only — never in the URL or long-term storage.",
    "auth.token": "Access token",
    "auth.enter": "Enter console",
    "auth.verifying": "Verifying…",
    "auth.empty": "Enter the access token.",
    "auth.welcome": "Console unlocked.",

    "rail.toggle": "Collapse / expand sidebar",
    "rail.newSession": "New session",
    "rail.sessions": "Active sessions",
    "rail.noSessions": "No sessions yet — launch one.",
    "rail.recent": "Recent",
    "rail.clear": "Clear",
    "rail.noRecent": "Recently opened URLs are kept on this device.",
    "rail.capacity": "Browser Run quota",
    "rail.historyCleared": "Local history cleared.",

    "tools.theme": "Toggle theme",
    "tools.language": "Switch language",
    "tools.shortcuts": "Keyboard shortcuts",
    "tools.logout": "Sign out",

    "chrome.back": "Back",
    "chrome.forward": "Forward",
    "chrome.reload": "Reload",
    "chrome.placeholder": "Type a URL and press Enter to open it in this session",
    "chrome.screenshot": "Screenshot (⇧⌘S)",
    "chrome.pdf": "Export PDF",
    "chrome.extract": "Extract text (⇧⌘E)",
    "chrome.extend": "Extend session",
    "chrome.openTab": "Open live view in a new tab",
    "chrome.fullscreen": "Fullscreen",
    "chrome.exitFullscreen": "Exit fullscreen",
    "chrome.stop": "Stop and destroy session",

    "launcher.pill": "Cloudflare Browser Run",
    "launcher.title": "Open the web in the cloud, then throw it away",
    "launcher.subtitle":
      "Remote Chrome runs on Cloudflare's network. Page content never touches this device and the session self-destructs.",
    "launcher.placeholder": "https://example.com",
    "launcher.launch": "Launch browser",
    "launcher.launching": "Launching…",
    "launcher.settings": "Browser settings",
    "launcher.assurance1": "Private ranges and odd ports blocked",
    "launcher.assurance2": "Destroyed on expiry",
    "launcher.assurance3": "Pick an exit region and device",
    "launcher.hint": "Each session runs up to {duration}, {max} at a time.",
    "launcher.quickLinks": "Quick open",

    "stage.loadingTitle": "Starting the cloud browser…",
    "stage.step1": "Validating the URL",
    "stage.step2": "Allocating remote Chrome",
    "stage.step3": "Navigating and attaching live view",
    "stage.mockNote":
      "Local mock mode never allocates a real Browser Run instance — this panel just reflects session state.",

    "status.idle": "Idle",
    "status.live": "Session live",
    "status.expiring": "Expiring soon",
    "status.mock": "Local mock",
    "status.palette": "Command palette",
    "status.sessions": "{count} sessions",

    "session.remaining": "{time} left",
    "session.extended": "Session extended to {time}.",
    "session.created": "Cloud browser is ready.",
    "session.stopped": "Session stopped and destroyed.",
    "session.stoppedAll": "Stopped {count} sessions.",
    "session.navigated": "Opened {host}.",
    "session.switch": "Switch to session",
    "session.close": "Close session",
    "session.limit": "Concurrent session limit reached.",
    "session.none": "No active session.",

    "drawer.eyebrow": "Applied before launch",
    "drawer.title": "Browser settings",
    "drawer.device": "Device and viewport",
    "drawer.preset": "Preset",
    "drawer.custom": "Custom size",
    "drawer.width": "Width",
    "drawer.height": "Height",
    "drawer.scale": "Pixel ratio",
    "drawer.mobile": "Mobile and touch emulation",
    "drawer.identity": "Identity and region",
    "drawer.region": "Exit region",
    "drawer.regionAuto": "Automatic (nearest)",
    "drawer.locale": "Language",
    "drawer.localeDefault": "Browser Run default",
    "drawer.timezone": "Time zone",
    "drawer.timezoneDefault": "Browser Run default",
    "drawer.colorScheme": "Page color scheme",
    "drawer.colorSystem": "Follow system",
    "drawer.colorLight": "Light",
    "drawer.colorDark": "Dark",
    "drawer.userAgent": "Custom User-Agent",
    "drawer.userAgentHint": "Leave empty for the Browser Run default",
    "drawer.performance": "Performance and privacy",
    "drawer.blockLabel": "Block resources",
    "drawer.reducedMotion": "Ask pages for reduced motion",
    "drawer.geolocation": "Override page geolocation",
    "drawer.latitude": "Latitude",
    "drawer.longitude": "Longitude",
    "drawer.accuracy": "Accuracy (m)",
    "drawer.note":
      "Settings stay on this device and are applied before the first navigation. Changes affect new sessions only, never running ones.",
    "drawer.reset": "Reset to defaults",
    "drawer.reseted": "Settings restored to defaults.",
    "drawer.nextSession": "These settings apply to the next session you launch.",

    "resource.image": "Images",
    "resource.media": "Media",
    "resource.font": "Fonts",
    "resource.stylesheet": "Stylesheets",

    "extract.eyebrow": "Page text",
    "extract.empty": "This page has no extractable text.",
    "extract.meta": "{chars} characters · {links} links",
    "extract.truncated": "Content was truncated.",

    "shortcuts.title": "Keyboard shortcuts",
    "shortcuts.palette": "Open command palette",
    "shortcuts.omnibox": "Focus the address bar",
    "shortcuts.new": "New session",
    "shortcuts.screenshot": "Screenshot the page",
    "shortcuts.extract": "Extract page text",
    "shortcuts.reload": "Reload the page",
    "shortcuts.stop": "Stop the active session",
    "shortcuts.fullscreen": "Toggle fullscreen",
    "shortcuts.switch": "Switch to session N",
    "shortcuts.close": "Dismiss overlays",

    "palette.placeholder": "Search commands, sessions or recent URLs…",
    "palette.empty": "No matching command.",
    "palette.groupActions": "Actions",
    "palette.groupSessions": "Sessions",
    "palette.groupHistory": "Recent",
    "palette.newSession": "New session",
    "palette.stopSession": "Stop active session",
    "palette.stopAll": "Stop all sessions",
    "palette.screenshot": "Screenshot the page",
    "palette.pdf": "Export page as PDF",
    "palette.extract": "Extract page text",
    "palette.extend": "Extend active session",
    "palette.reload": "Reload the page",
    "palette.copyUrl": "Copy current URL",
    "palette.reconnect": "Reconnect live view",
    "palette.settings": "Open browser settings",
    "palette.theme": "Toggle theme",
    "palette.language": "Switch language",
    "palette.shortcuts": "Show keyboard shortcuts",
    "palette.logout": "Sign out",

    "toast.screenshotSaved": "Screenshot downloaded.",
    "toast.pdfSaved": "PDF downloaded.",
    "toast.working": "Working…",
    "toast.offline": "You are offline.",
    "toast.online": "Back online.",

    "error.network": "Cannot reach the server — check your connection.",
    "error.UNAUTHORIZED": "That access token is not correct.",
    "error.TOO_MANY_ATTEMPTS": "Too many attempts. Try again later.",
    "error.AUTH_NOT_CONFIGURED": "ADMIN_TOKEN is not configured on the server.",
    "error.BROWSER_API_NOT_CONFIGURED":
      "Cloudflare account ID or Browser Run token is missing on the server.",
    "error.SESSION_LIMIT_REACHED": "Concurrent browser limit reached.",
    "error.SESSION_NOT_FOUND": "That session no longer exists.",
    "error.SESSION_EXPIRED": "The session expired and was destroyed.",
    "error.BROWSER_SESSION_GONE":
      "The remote browser was reclaimed — start a new session.",
    "error.EXTENSION_LIMIT_REACHED": "The session reached its maximum lifetime.",
    "error.NO_HISTORY_ENTRY": "No history entry in that direction.",
    "error.INVALID_TARGET_URL": "That URL is invalid or not allowed.",
    "error.MOCK_UNSUPPORTED": "Local mock mode does not support this action.",
    "error.CAPACITY_UNAVAILABLE": "Browser Run quota is unavailable right now.",
  },
};

let currentLanguage = DEFAULT_LANGUAGE;

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(language) {
  currentLanguage = dictionaries[language] ? language : DEFAULT_LANGUAGE;
  return currentLanguage;
}

export function nextLanguage(language = currentLanguage) {
  const index = LANGUAGES.indexOf(language);
  return LANGUAGES[(index + 1) % LANGUAGES.length];
}

/** Translates `key`, replacing `{name}` placeholders with `vars`. */
export function t(key, vars) {
  const table = dictionaries[currentLanguage] ?? dictionaries[DEFAULT_LANGUAGE];
  const fallback = dictionaries[DEFAULT_LANGUAGE][key];
  const template = table[key] ?? fallback ?? key;
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/** Picks the localized label of an option returned by `/api/config`. */
export function optionLabel(option) {
  if (!option) {
    return "";
  }
  return currentLanguage === "zh-CN" ? option.labelZh || option.label : option.label;
}

/** Applies `data-i18n` and `data-i18n-attr` bindings inside `root`. */
export function applyTranslations(root = document) {
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of element.dataset.i18nAttr.split(",")) {
      const [attribute, key] = pair.split(":");
      if (attribute && key) {
        element.setAttribute(attribute.trim(), t(key.trim()));
      }
    }
  }
  if (root === document) {
    document.documentElement.lang = currentLanguage;
  }
}
