import type { BrowserSettings } from "./browser-settings";

export interface HistoryEntry {
  url: string;
  title?: string;
  at: number;
}

/** Everything the Durable Object stores about one remote browser. */
export interface SessionRecord {
  id: string;
  browserSessionId: string;
  targetUrl: string;
  title?: string;
  createdAt: number;
  expiresAt: number;
  ttlSeconds: number;
  extensions: number;
  navigations: number;
  lastActivityAt: number;
  settings: BrowserSettings;
  mock: boolean;
  history: HistoryEntry[];
}

/** Session shape returned to the console — never contains the CDP session id. */
export interface PublicSession {
  id: string;
  ref: string;
  targetUrl: string;
  hostname: string;
  title?: string;
  createdAt: string;
  expiresAt: string;
  ttlSeconds: number;
  remainingSeconds: number;
  extensions: number;
  extensionsRemaining: number;
  navigations: number;
  mock: boolean;
  region?: string;
  device: {
    width: number;
    height: number;
    isMobile: boolean;
    deviceScaleFactor: number;
  };
  locale?: string;
  timezone?: string;
  colorScheme: string;
  blockedResources: string[];
  history: HistoryEntry[];
}

export interface LiveViewUrls {
  liveUrl: string;
  inspectorUrl: string;
}

export interface CapacityInfo {
  activeSessions: number;
  maxConcurrentSessions: number;
  allowedBrowserAcquisitions: number;
  secondsUntilNextAcquisition: number;
  mock: boolean;
}

export interface SessionStats {
  totalLaunched: number;
  totalExpired: number;
  totalStopped: number;
  totalNavigations: number;
}

export interface SessionListResponse {
  sessions: PublicSession[];
  maxSessions: number;
  sessionTtlSeconds: number;
  stats: SessionStats;
  capacity?: CapacityInfo;
}

export interface PageSnapshot {
  url: string;
  title: string;
}
