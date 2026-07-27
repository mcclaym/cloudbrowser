import { Container } from "@cloudflare/containers";

import type { Env } from "./env";
import { ApiError } from "./http";

/** Port noVNC listens on inside the image. */
export const SCREEN_PORT = 8080;
/** How long the desktop may idle with no proxied request before it sleeps. */
export const CONTAINER_SLEEP_AFTER = "10m";
const START_TIMEOUT_MS = 90_000;

export interface ContainerBootOptions {
  targetUrl: string;
  width: number;
  height: number;
  locale?: string;
  timezone?: string;
}

/**
 * One full desktop browser per session: Xvfb, a window manager, Chromium and
 * noVNC. Unlike a Browser Run session this is an ordinary Chromium with no CDP
 * automation attached, driven only by the person watching the screen.
 *
 * Every request reaches the container through {@link fetch} on this object, so
 * the exposed port never has to be routable from the internet.
 */
export class BrowserContainer extends Container<Env> {
  defaultPort = SCREEN_PORT;
  sleepAfter = CONTAINER_SLEEP_AFTER;

  /** Boots the desktop and waits until noVNC answers. */
  async boot(options: ContainerBootOptions): Promise<void> {
    const envVars: Record<string, string> = {
      START_URL: options.targetUrl,
      SCREEN_WIDTH: String(options.width),
      SCREEN_HEIGHT: String(options.height),
    };
    if (options.locale) {
      envVars.BROWSER_LANG = options.locale;
    }
    if (options.timezone) {
      envVars.TZ = options.timezone;
    }

    try {
      await this.startAndWaitForPorts({
        ports: SCREEN_PORT,
        startOptions: { envVars },
        cancellationOptions: { portReadyTimeoutMS: START_TIMEOUT_MS },
      });
    } catch (error) {
      throw new ApiError(
        502,
        "CONTAINER_START_FAILED",
        `完整浏览器环境启动失败。${
          error instanceof Error ? `（${error.message.slice(0, 160)}）` : ""
        }`,
      );
    }
  }

  /** Proxies console traffic (including the noVNC WebSocket) to the desktop. */
  async fetch(request: Request): Promise<Response> {
    try {
      return await this.containerFetch(request, SCREEN_PORT);
    } catch (error) {
      console.error("Screen proxy failed", error);
      return new Response("screen unavailable", {
        status: 502,
        headers: { "cache-control": "no-store" },
      });
    }
  }

  /** Tears the desktop down for good; the session record is gone by then. */
  async shutdown(): Promise<void> {
    try {
      await this.destroy();
    } catch (error) {
      console.error("Container destroy failed", error);
    }
  }
}
