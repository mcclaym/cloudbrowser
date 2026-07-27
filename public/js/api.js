import { t } from "./i18n.js";

export class ApiError extends Error {
  constructor(message, code, status, field) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.field = field;
  }

  /** Localized message, preferring the code so both languages read well. */
  get localized() {
    const translated = t(`error.${this.code}`);
    return translated === `error.${this.code}` ? this.message : translated;
  }
}

let token = "";
let onUnauthorized = () => {};

export function setToken(value) {
  token = value || "";
}

export function hasToken() {
  return Boolean(token);
}

export function onAuthFailure(handler) {
  onUnauthorized = handler;
}

async function request(path, { method = "GET", body, expect = "json" } = {}) {
  const headers = new Headers();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(t("error.network"), "NETWORK", 0);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = payload?.error ?? {};
    if (response.status === 401) {
      onUnauthorized();
    }
    throw new ApiError(
      error.message || t("common.unknownError"),
      error.code || "REQUEST_FAILED",
      response.status,
      error.field,
    );
  }

  if (expect === "blob") {
    return {
      blob: await response.blob(),
      fileName: fileNameFrom(response.headers.get("content-disposition")),
    };
  }
  return response.json();
}

function fileNameFrom(disposition) {
  const match = /filename="([^"]+)"/.exec(disposition ?? "");
  return match ? match[1] : "cloudbrowser";
}

export const api = {
  config: () => request("/api/config"),
  verify: () => request("/api/verify", { method: "POST" }),
  listSessions: (withCapacity = false) =>
    request(`/api/sessions${withCapacity ? "?capacity=1" : ""}`),
  createSession: (url, settings) =>
    request("/api/sessions", { method: "POST", body: { url, settings } }),
  stopSession: (id) => request(`/api/sessions/${id}`, { method: "DELETE" }),
  stopAll: () => request("/api/sessions", { method: "DELETE" }),
  liveUrl: (id) => request(`/api/sessions/${id}/live-url`, { method: "POST" }),
  navigate: (id, payload) =>
    request(`/api/sessions/${id}/navigate`, { method: "POST", body: payload }),
  extend: (id, seconds) =>
    request(`/api/sessions/${id}/extend`, { method: "POST", body: { seconds } }),
  extract: (id) => request(`/api/sessions/${id}/extract`, { method: "POST" }),
  screenshot: (id, options = {}) =>
    request(`/api/sessions/${id}/screenshot`, {
      method: "POST",
      body: options,
      expect: "blob",
    }),
  pdf: (id) =>
    request(`/api/sessions/${id}/pdf`, { method: "POST", expect: "blob" }),
};
