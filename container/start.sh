#!/bin/bash
# Boots a throwaway desktop: Xvfb -> window manager -> VNC -> noVNC -> Chromium.
# Every process is a child of this script, so a failure of any of them takes the
# container down and the Durable Object can notice.
set -euo pipefail

SCREEN_WIDTH="${SCREEN_WIDTH:-1920}"
SCREEN_HEIGHT="${SCREEN_HEIGHT:-1080}"
START_URL="${START_URL:-about:blank}"
BROWSER_LANG="${BROWSER_LANG:-en-US}"
export TZ="${TZ:-UTC}"
export DISPLAY=:1
export LANG="${BROWSER_LANG}.UTF-8"

# Chromium refuses to run as root without --no-sandbox; we run as a normal user
# instead and keep the sandbox on. HOME must be writable for the profile.
export HOME=/home/browser

echo "[start] ${SCREEN_WIDTH}x${SCREEN_HEIGHT} tz=${TZ} lang=${BROWSER_LANG}"

Xvfb "${DISPLAY}" -screen 0 "${SCREEN_WIDTH}x${SCREEN_HEIGHT}x24" -nolisten tcp &
XVFB_PID=$!

# Wait for the X server before anything tries to connect to it.
for _ in $(seq 1 50); do
  if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

fluxbox -log /dev/null &

x11vnc \
  -display "${DISPLAY}" \
  -rfbport 5900 \
  -localhost \
  -forever \
  -shared \
  -nopw \
  -noxdamage \
  -quiet &

# noVNC is the only port exposed to the Durable Object; websockify serves both
# the static client and the WebSocket bridge to x11vnc on the loopback.
websockify --web=/usr/share/novnc 8080 127.0.0.1:5900 &

chromium \
  --user-data-dir="${HOME}/profile" \
  --window-position=0,0 \
  --window-size="${SCREEN_WIDTH},${SCREEN_HEIGHT}" \
  --start-maximized \
  --disable-dev-shm-usage \
  --disable-gpu \
  --no-first-run \
  --no-default-browser-check \
  --disable-features=Translate,MediaRouter \
  --lang="${BROWSER_LANG}" \
  "${START_URL}" &

# Xvfb dying means the desktop is gone; exit so the platform restarts us.
wait -n "${XVFB_PID}"
echo "[start] display exited, shutting down"
exit 1
