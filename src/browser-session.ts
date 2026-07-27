import { DurableObject } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer";

import {
  applyBrowserSettings,
  BrowserSettingsError,
  normalizeBrowserSettings,
  type BrowserSettings,
} from "./browser-settings";
import { closeBrowserSession, getLiveViewUrls } from "./cloudflare-api";
import type { Env } from "./env";
import { ApiError, binaryResponse, json } from "./http";
import {
  extract,
  heartbeat,
  installRequestGuard,
  moveInHistory,
  navigate,
  renderPdf,
  screenshot,
  snapshot,
  withSessionPage,
  type HistoryDirection,
} from "./page-actions";
import { normalizeTargetUrl } from "./security";
import {
  browserKeepAliveMilliseconds,
  configuredMaxSessions,
  configuredSessionTtlSeconds,
  extendedExpiry,
  MAX_EXTENSIONS_PER_SESSION,
  needsHeartbeat,
} from "./session-config";
import {
  createSessionId,
  hostnameOf,
  isExpired,
  LEGACY_SESSION_KEY,
  nextAlarmAt,
  pushHistory,
  sessionKey,
  SESSION_KEY_PREFIX,
  sortSessions,
  toPublicSession,
} from "./session-store";
import type {
  CapacityInfo,
  LiveViewUrls,
  PublicSession,
  SessionListResponse,
  SessionRecord,
  SessionStats,
} from "./types";

const STATS_KEY = "stats";
const CAPACITY_CACHE_MS = 30_000;

const EMPTY_STATS: SessionStats = {
  totalLaunched: 0,
  totalExpired: 0,
  totalStopped: 0,
  totalNavigations: 0,
};

interface SessionEnvelope {
  session: PublicSession;
}

/**
 * Owns every remote browser for one console user. All sessions live in a single
 * Durable Object so limits, the expiry alarm and the keep-alive heartbeat stay
 * consistent without cross-object coordination.
 */
export class BrowserSession extends DurableObject<Env> {
  private capacityCache: { at: number; value: CapacityInfo } | null = null;
  private legacyChecked = false;

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.route(request);
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const records = await this.loadAll();

    for (const record of records) {
      if (isExpired(record, now)) {
        await this.destroy(record, "expired");
      }
    }

    const alive = (await this.loadAll()).filter(
      (record) => !record.mock && needsHeartbeat(record.ttlSeconds),
    );
    for (const record of alive) {
      await this.touch(record);
    }

    await this.scheduleAlarm();
  }

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (segments[0] !== "sessions") {
      throw ApiError.notFound("没有这个会话操作。");
    }

    const method = request.method;
    const id = segments[1];
    const action = segments[2];

    if (!id) {
      if (method === "GET") {
        return json(
          await this.list(url.searchParams.get("capacity") === "1"),
        );
      }
      if (method === "POST") {
        return json(await this.create(await body(request)), 201);
      }
      if (method === "DELETE") {
        return json(await this.stopAll());
      }
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支持这个请求方法。");
    }

    if (!action) {
      if (method === "GET") {
        return json({ session: await this.describe(id) } satisfies SessionEnvelope);
      }
      if (method === "DELETE") {
        return json(await this.stop(id));
      }
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支持这个请求方法。");
    }

    if (method !== "POST") {
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支持这个请求方法。");
    }

    switch (action) {
      case "live-url":
        return json(await this.liveUrl(id));
      case "navigate":
        return json(await this.navigateSession(id, await body(request)));
      case "extend":
        return json(await this.extend(id, await body(request)));
      case "extract":
        return json(await this.extractSession(id));
      case "screenshot":
        return this.screenshotSession(id, await body(request));
      case "pdf":
        return this.pdfSession(id);
      default:
        throw ApiError.notFound("没有这个会话操作。");
    }
  }

  private async list(includeCapacity: boolean): Promise<SessionListResponse> {
    const now = Date.now();
    const records = await this.loadAll({ pruneExpired: true });
    const response: SessionListResponse = {
      sessions: sortSessions(records).map((record) =>
        toPublicSession(record, now),
      ),
      maxSessions: configuredMaxSessions(this.env.MAX_CONCURRENT_SESSIONS),
      sessionTtlSeconds: configuredSessionTtlSeconds(
        this.env.BROWSER_SESSION_TTL_SECONDS,
      ),
      stats: await this.stats(),
    };

    if (includeCapacity) {
      response.capacity = await this.capacity();
    }
    return response;
  }

  private async create(
    payload: Record<string, unknown>,
  ): Promise<SessionEnvelope & LiveViewUrls> {
    const targetUrl = normalizeTargetUrl(payload.url);
    const settings = normalizeBrowserSettings(payload.settings);

    const existing = await this.loadAll({ pruneExpired: true });
    const maxSessions = configuredMaxSessions(this.env.MAX_CONCURRENT_SESSIONS);
    if (existing.length >= maxSessions) {
      throw new ApiError(
        409,
        "SESSION_LIMIT_REACHED",
        `同时最多运行 ${maxSessions} 个云端浏览器，请先结束一个。`,
      );
    }

    const now = Date.now();
    const ttlSeconds = configuredSessionTtlSeconds(
      this.env.BROWSER_SESSION_TTL_SECONDS,
    );
    const base: Omit<SessionRecord, "browserSessionId" | "mock"> = {
      id: createSessionId(),
      targetUrl,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      ttlSeconds,
      extensions: 0,
      navigations: 1,
      lastActivityAt: now,
      settings,
      history: [{ url: targetUrl, at: now }],
    };

    if (this.isMock()) {
      const record: SessionRecord = {
        ...base,
        browserSessionId: `mock${createSessionId()}`,
        mock: true,
        title: hostnameOf(targetUrl),
      };
      await this.persist(record);
      await this.bumpStats({ totalLaunched: 1 });
      return {
        session: toPublicSession(record, now),
        ...mockLiveViewUrls(targetUrl),
      };
    }

    this.assertBrowserApiConfigured();

    const browser = await puppeteer.launch(this.env.BROWSER, {
      keep_alive: browserKeepAliveMilliseconds(ttlSeconds),
      recording: false,
      ...(settings.region ? { location: settings.region as never } : {}),
    });

    try {
      const pages = await browser.pages();
      const page = pages[0] ?? (await browser.newPage());

      await applyBrowserSettings(page, settings, targetUrl);
      await installRequestGuard(page, settings);
      const visited = await navigate(page, targetUrl);
      const finalUrl = normalizeTargetUrl(visited.url);
      const browserSessionId = browser.sessionId();

      const record: SessionRecord = {
        ...base,
        browserSessionId,
        mock: false,
        targetUrl: finalUrl,
        title: visited.title || hostnameOf(finalUrl),
        history: [{ url: finalUrl, title: visited.title, at: now }],
      };

      const liveView = await getLiveViewUrls(
        this.env.CLOUDFLARE_ACCOUNT_ID!,
        this.env.CLOUDFLARE_BROWSER_TOKEN!,
        browserSessionId,
        finalUrl,
      );

      browser.disconnect();
      await this.persist(record);
      await this.bumpStats({ totalLaunched: 1 });
      this.capacityCache = null;

      return { session: toPublicSession(record, Date.now()), ...liveView };
    } catch (error) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Unable to close failed browser session", closeError);
      }
      throw error;
    }
  }

  private async describe(id: string): Promise<PublicSession> {
    const record = await this.requireSession(id);
    return toPublicSession(record, Date.now());
  }

  private async liveUrl(id: string): Promise<SessionEnvelope & LiveViewUrls> {
    const record = await this.requireSession(id);
    if (record.mock) {
      return {
        session: toPublicSession(record, Date.now()),
        ...mockLiveViewUrls(record.targetUrl),
      };
    }

    this.assertBrowserApiConfigured();
    const liveView = await getLiveViewUrls(
      this.env.CLOUDFLARE_ACCOUNT_ID!,
      this.env.CLOUDFLARE_BROWSER_TOKEN!,
      record.browserSessionId,
      record.targetUrl,
    );
    return { session: toPublicSession(record, Date.now()), ...liveView };
  }

  private async navigateSession(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<SessionEnvelope> {
    const record = await this.requireSession(id);
    const direction = readDirection(payload.direction);

    if (record.mock) {
      const targetUrl = direction
        ? record.targetUrl
        : normalizeTargetUrl(payload.url);
      return { session: await this.commitNavigation(record, targetUrl, hostnameOf(targetUrl)) };
    }

    const visited = await withSessionPage(
      this.env.BROWSER,
      record.browserSessionId,
      async (page) => {
        await installRequestGuard(page, record.settings);
        return direction
          ? moveInHistory(page, direction)
          : navigate(page, asString(payload.url, "url"));
      },
    );

    const finalUrl = normalizeTargetUrl(visited.url);
    return {
      session: await this.commitNavigation(record, finalUrl, visited.title),
    };
  }

  private async commitNavigation(
    record: SessionRecord,
    targetUrl: string,
    title?: string,
  ): Promise<PublicSession> {
    const now = Date.now();
    const updated: SessionRecord = {
      ...record,
      targetUrl,
      title: title || hostnameOf(targetUrl),
      navigations: record.navigations + 1,
      lastActivityAt: now,
      history: pushHistory(record.history, { url: targetUrl, title, at: now }),
    };
    await this.ctx.storage.put(sessionKey(updated.id), updated);
    await this.bumpStats({ totalNavigations: 1 });
    return toPublicSession(updated, now);
  }

  private async extend(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<SessionEnvelope> {
    const record = await this.requireSession(id);
    if (record.extensions >= MAX_EXTENSIONS_PER_SESSION) {
      throw new ApiError(
        409,
        "EXTENSION_LIMIT_REACHED",
        "这个会话已经延长到上限。",
      );
    }

    const now = Date.now();
    const requestedSeconds =
      typeof payload.seconds === "number" && Number.isFinite(payload.seconds)
        ? payload.seconds
        : record.ttlSeconds;
    const expiresAt = extendedExpiry({
      now,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      requestedSeconds,
    });

    if (expiresAt <= record.expiresAt) {
      throw new ApiError(
        409,
        "EXTENSION_LIMIT_REACHED",
        "会话已经达到最长运行时间。",
      );
    }

    const updated: SessionRecord = {
      ...record,
      expiresAt,
      extensions: record.extensions + 1,
      lastActivityAt: now,
      ttlSeconds: Math.max(
        record.ttlSeconds,
        Math.ceil((expiresAt - record.createdAt) / 1000),
      ),
    };
    await this.persist(updated);
    return { session: toPublicSession(updated, now) };
  }

  private async extractSession(id: string): Promise<Record<string, unknown>> {
    const record = await this.requireSession(id);
    if (record.mock) {
      return {
        url: record.targetUrl,
        title: record.title ?? hostnameOf(record.targetUrl),
        text: "本地 Mock 模式不会真正抓取网页内容。",
        links: [],
        truncated: false,
      };
    }

    const result = await withSessionPage(
      this.env.BROWSER,
      record.browserSessionId,
      (page) => extract(page),
    );
    await this.markActivity(record, result.title);
    return { ...result };
  }

  private async screenshotSession(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<Response> {
    const record = await this.requireSession(id);
    this.assertLiveSession(record, "截图");

    const format = payload.format === "jpeg" ? "jpeg" : "png";
    const bytes = await withSessionPage(
      this.env.BROWSER,
      record.browserSessionId,
      (page) =>
        screenshot(page, { fullPage: payload.fullPage === true, format }),
    );
    await this.markActivity(record);

    return binaryResponse(
      bytes,
      format === "jpeg" ? "image/jpeg" : "image/png",
      `${hostnameOf(record.targetUrl)}-${record.id}.${format === "jpeg" ? "jpg" : "png"}`,
    );
  }

  private async pdfSession(id: string): Promise<Response> {
    const record = await this.requireSession(id);
    this.assertLiveSession(record, "导出 PDF");

    const bytes = await withSessionPage(
      this.env.BROWSER,
      record.browserSessionId,
      (page) => renderPdf(page),
    );
    await this.markActivity(record);

    return binaryResponse(
      bytes,
      "application/pdf",
      `${hostnameOf(record.targetUrl)}-${record.id}.pdf`,
    );
  }

  private async stop(id: string): Promise<{ stopped: string[] }> {
    const record = await this.ctx.storage.get<SessionRecord>(sessionKey(id));
    if (!record) {
      throw new ApiError(404, "SESSION_NOT_FOUND", "找不到这个会话。");
    }
    await this.destroy(record, "stopped");
    await this.scheduleAlarm();
    return { stopped: [id] };
  }

  private async stopAll(): Promise<{ stopped: string[] }> {
    const records = await this.loadAll();
    for (const record of records) {
      await this.destroy(record, "stopped");
    }
    await this.scheduleAlarm();
    return { stopped: records.map((record) => record.id) };
  }

  private async requireSession(id: string): Promise<SessionRecord> {
    const record = await this.ctx.storage.get<SessionRecord>(sessionKey(id));
    if (!record) {
      throw new ApiError(404, "SESSION_NOT_FOUND", "找不到这个会话。");
    }
    if (isExpired(record, Date.now())) {
      await this.destroy(record, "expired");
      await this.scheduleAlarm();
      throw new ApiError(410, "SESSION_EXPIRED", "这个会话已经到期并被销毁。");
    }
    return record;
  }

  private assertLiveSession(record: SessionRecord, action: string): void {
    if (record.mock) {
      throw new ApiError(
        501,
        "MOCK_UNSUPPORTED",
        `本地 Mock 模式不支持${action}。`,
      );
    }
  }

  private async markActivity(
    record: SessionRecord,
    title?: string,
  ): Promise<void> {
    const updated: SessionRecord = {
      ...record,
      lastActivityAt: Date.now(),
      title: title || record.title,
    };
    await this.ctx.storage.put(sessionKey(record.id), updated);
  }

  private async touch(record: SessionRecord): Promise<void> {
    try {
      const visited = await heartbeat(this.env.BROWSER, record.browserSessionId);
      await this.ctx.storage.put(sessionKey(record.id), {
        ...record,
        targetUrl: safeUrl(visited.url, record.targetUrl),
        title: visited.title || record.title,
        lastActivityAt: Date.now(),
      } satisfies SessionRecord);
    } catch (error) {
      console.error("Heartbeat failed, dropping session", record.id, error);
      await this.destroy(record, "expired");
    }
  }

  private async destroy(
    record: SessionRecord,
    reason: "expired" | "stopped",
  ): Promise<void> {
    try {
      if (
        !record.mock &&
        this.env.CLOUDFLARE_ACCOUNT_ID &&
        this.env.CLOUDFLARE_BROWSER_TOKEN
      ) {
        await closeBrowserSession(
          this.env.CLOUDFLARE_ACCOUNT_ID,
          this.env.CLOUDFLARE_BROWSER_TOKEN,
          record.browserSessionId,
        );
      }
    } catch (error) {
      console.error("Unable to close browser session", record.id, error);
    } finally {
      await this.ctx.storage.delete(sessionKey(record.id));
      await this.bumpStats(
        reason === "expired" ? { totalExpired: 1 } : { totalStopped: 1 },
      );
      this.capacityCache = null;
    }
  }

  private async loadAll(
    options: { pruneExpired?: boolean } = {},
  ): Promise<SessionRecord[]> {
    await this.migrateLegacyRecord();
    const entries = await this.ctx.storage.list<SessionRecord>({
      prefix: SESSION_KEY_PREFIX,
    });
    const records = [...entries.values()];

    if (!options.pruneExpired) {
      return records;
    }

    const now = Date.now();
    const alive: SessionRecord[] = [];
    for (const record of records) {
      if (isExpired(record, now)) {
        await this.destroy(record, "expired");
      } else {
        alive.push(record);
      }
    }
    if (alive.length !== records.length) {
      await this.scheduleAlarm();
    }
    return alive;
  }

  /** Converts a record written by the single-session version of CloudBrowser. */
  private async migrateLegacyRecord(): Promise<void> {
    if (this.legacyChecked) {
      return;
    }
    this.legacyChecked = true;

    const legacy = await this.ctx.storage.get<Record<string, unknown>>(
      LEGACY_SESSION_KEY,
    );
    if (!legacy) {
      return;
    }
    await this.ctx.storage.delete(LEGACY_SESSION_KEY);

    const browserSessionId = String(legacy.sessionId ?? "");
    const targetUrl = String(legacy.targetUrl ?? "");
    const createdAt = Date.parse(String(legacy.createdAt ?? ""));
    const expiresAt = Date.parse(String(legacy.expiresAt ?? ""));
    if (!browserSessionId || !targetUrl || !Number.isFinite(expiresAt)) {
      return;
    }

    const record: SessionRecord = {
      id: createSessionId(),
      browserSessionId,
      targetUrl,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      expiresAt,
      ttlSeconds: configuredSessionTtlSeconds(
        this.env.BROWSER_SESSION_TTL_SECONDS,
      ),
      extensions: 0,
      navigations: 1,
      lastActivityAt: Date.now(),
      settings: normalizeBrowserSettings(undefined),
      mock: legacy.mock === true,
      history: [{ url: targetUrl, at: Date.now() }],
    };
    await this.ctx.storage.put(sessionKey(record.id), record);
  }

  private async persist(record: SessionRecord): Promise<void> {
    await this.ctx.storage.put(sessionKey(record.id), record);
    await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    const entries = await this.ctx.storage.list<SessionRecord>({
      prefix: SESSION_KEY_PREFIX,
    });
    const alarmAt = nextAlarmAt([...entries.values()], Date.now());
    if (alarmAt === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(alarmAt);
  }

  private async stats(): Promise<SessionStats> {
    const stored = await this.ctx.storage.get<SessionStats>(STATS_KEY);
    return { ...EMPTY_STATS, ...stored };
  }

  private async bumpStats(delta: Partial<SessionStats>): Promise<void> {
    const current = await this.stats();
    await this.ctx.storage.put(STATS_KEY, {
      totalLaunched: current.totalLaunched + (delta.totalLaunched ?? 0),
      totalExpired: current.totalExpired + (delta.totalExpired ?? 0),
      totalStopped: current.totalStopped + (delta.totalStopped ?? 0),
      totalNavigations: current.totalNavigations + (delta.totalNavigations ?? 0),
    } satisfies SessionStats);
  }

  private async capacity(): Promise<CapacityInfo> {
    if (this.isMock()) {
      const records = await this.loadAll();
      return {
        activeSessions: records.length,
        maxConcurrentSessions: configuredMaxSessions(
          this.env.MAX_CONCURRENT_SESSIONS,
        ),
        allowedBrowserAcquisitions: 1,
        secondsUntilNextAcquisition: 0,
        mock: true,
      };
    }

    const now = Date.now();
    if (this.capacityCache && now - this.capacityCache.at < CAPACITY_CACHE_MS) {
      return this.capacityCache.value;
    }

    try {
      const limits = await puppeteer.limits(this.env.BROWSER);
      const value: CapacityInfo = {
        activeSessions: limits.activeSessions?.length ?? 0,
        maxConcurrentSessions: limits.maxConcurrentSessions,
        allowedBrowserAcquisitions: limits.allowedBrowserAcquisitions,
        secondsUntilNextAcquisition:
          limits.timeUntilNextAllowedBrowserAcquisition ?? 0,
        mock: false,
      };
      this.capacityCache = { at: now, value };
      return value;
    } catch (error) {
      console.error("Unable to read Browser Run limits", error);
      throw new ApiError(
        502,
        "CAPACITY_UNAVAILABLE",
        "暂时无法读取 Browser Run 配额。",
      );
    }
  }

  private isMock(): boolean {
    return this.env.BROWSER_MOCK === "true";
  }

  private assertBrowserApiConfigured(): void {
    if (!this.env.CLOUDFLARE_ACCOUNT_ID || !this.env.CLOUDFLARE_BROWSER_TOKEN) {
      throw new ApiError(
        503,
        "BROWSER_API_NOT_CONFIGURED",
        "尚未配置 CLOUDFLARE_ACCOUNT_ID 或 CLOUDFLARE_BROWSER_TOKEN。",
      );
    }
  }
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw ApiError.badRequest("INVALID_JSON", "请求内容不是有效的 JSON 对象。");
  }
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw ApiError.badRequest("MISSING_FIELD", "请输入有效的网址。", field);
  }
  return value;
}

function readDirection(value: unknown): HistoryDirection | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (value === "back" || value === "forward" || value === "reload") {
    return value;
  }
  throw ApiError.badRequest(
    "INVALID_DIRECTION",
    "导航方向只能是 back、forward 或 reload。",
    "direction",
  );
}

function safeUrl(candidate: string, fallback: string): string {
  try {
    return normalizeTargetUrl(candidate);
  } catch {
    return fallback;
  }
}

function mockLiveViewUrls(targetUrl: string): LiveViewUrls {
  const live = `/mock-live.html?url=${encodeURIComponent(targetUrl)}`;
  return { liveUrl: live, inspectorUrl: `${live}&mode=devtools` };
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.field ? { field: error.field } : {}),
        },
      },
      error.status,
    );
  }

  if (error instanceof BrowserSettingsError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.field ? { field: error.field } : {}),
        },
      },
      400,
    );
  }

  if (error instanceof Error && error.name === "TargetUrlError") {
    return json(
      { error: { code: "INVALID_TARGET_URL", message: error.message } },
      400,
    );
  }

  console.error("Browser session error", error);
  return json(
    {
      error: {
        code: "BROWSER_SESSION_ERROR",
        message:
          error instanceof Error ? error.message : "云端浏览器暂时不可用。",
      },
    },
    502,
  );
}
