import {
  HEARTBEAT_INTERVAL_MS,
  MAX_EXTENSIONS_PER_SESSION,
  MAX_SESSION_HISTORY_ENTRIES,
  needsHeartbeat,
} from "./session-config";
import type { HistoryEntry, PublicSession, SessionRecord } from "./types";

export const SESSION_KEY_PREFIX = "session:";
/** Storage key used by the single-session version of CloudBrowser. */
export const LEGACY_SESSION_KEY = "browser-session";

export function sessionKey(id: string): string {
  return `${SESSION_KEY_PREFIX}${id}`;
}

export function createSessionId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function isExpired(record: SessionRecord, now: number): boolean {
  return record.expiresAt <= now;
}

export function remainingSeconds(record: SessionRecord, now: number): number {
  return Math.max(0, Math.ceil((record.expiresAt - now) / 1000));
}

export function toPublicSession(
  record: SessionRecord,
  now: number,
): PublicSession {
  return {
    id: record.id,
    ref: record.browserSessionId.slice(0, 8),
    targetUrl: record.targetUrl,
    hostname: hostnameOf(record.targetUrl),
    title: record.title,
    createdAt: new Date(record.createdAt).toISOString(),
    expiresAt: new Date(record.expiresAt).toISOString(),
    ttlSeconds: record.ttlSeconds,
    remainingSeconds: remainingSeconds(record, now),
    extensions: record.extensions,
    extensionsRemaining: Math.max(
      0,
      MAX_EXTENSIONS_PER_SESSION - record.extensions,
    ),
    navigations: record.navigations,
    mock: record.mock,
    region: record.settings.region,
    device: {
      width: record.settings.viewport.width,
      height: record.settings.viewport.height,
      isMobile: record.settings.viewport.isMobile,
      deviceScaleFactor: record.settings.viewport.deviceScaleFactor,
    },
    locale: record.settings.locale,
    timezone: record.settings.timezone,
    colorScheme: record.settings.colorScheme,
    blockedResources: [...record.settings.blockedResources],
    history: record.history,
  };
}

export function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return rawUrl.slice(0, 64);
  }
}

/** Appends a visited page, collapsing repeats and trimming to the cap. */
export function pushHistory(
  history: HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] {
  const last = history[history.length - 1];
  if (last && last.url === entry.url) {
    const merged = [...history];
    merged[merged.length - 1] = { ...last, ...entry };
    return merged;
  }
  return [...history, entry].slice(-MAX_SESSION_HISTORY_ENTRIES);
}

/**
 * Next alarm time for a set of sessions: the earliest expiry, or the next
 * heartbeat when some session outlives a single `keep_alive` window.
 */
export function nextAlarmAt(
  records: SessionRecord[],
  now: number,
  heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
): number | null {
  if (records.length === 0) {
    return null;
  }

  let earliest = Number.POSITIVE_INFINITY;
  for (const record of records) {
    earliest = Math.min(earliest, record.expiresAt);
    if (!record.mock && needsHeartbeat(record.ttlSeconds)) {
      earliest = Math.min(earliest, now + heartbeatIntervalMs);
    }
  }

  return Number.isFinite(earliest) ? Math.max(earliest, now + 1000) : null;
}

export function sortSessions(records: SessionRecord[]): SessionRecord[] {
  return [...records].sort((left, right) => left.createdAt - right.createdAt);
}
