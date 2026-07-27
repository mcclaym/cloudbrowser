import type { BrowserWorker } from "@cloudflare/puppeteer";

import type { BrowserContainer } from "./browser-container";
import type { BrowserSession } from "./browser-session";

export const APP_VERSION = "1.0.0";

export interface Env {
  ASSETS: Fetcher;
  BROWSER: BrowserWorker;
  BROWSER_SESSIONS: DurableObjectNamespace<BrowserSession>;
  BROWSER_CONTAINERS: DurableObjectNamespace<BrowserContainer>;
  ADMIN_TOKEN?: string;
  BROWSER_SESSION_TTL_SECONDS?: string;
  MAX_CONCURRENT_SESSIONS?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_BROWSER_TOKEN?: string;
  BROWSER_MOCK?: string;
}
