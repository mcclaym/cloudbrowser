# Full desktop browser session for CloudBrowser "container" sessions.
# Xvfb + fluxbox + Chromium, exposed over noVNC on port 8080. Only the Durable
# Object can reach that port; it is never published to the internet directly.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    SCREEN_WIDTH=1920 \
    SCREEN_HEIGHT=1080 \
    START_URL=about:blank \
    BROWSER_LANG=en-US \
    TZ=UTC

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        ca-certificates \
        chromium \
        chromium-common \
        dumb-init \
        fluxbox \
        fonts-dejavu-core \
        fonts-liberation \
        fonts-noto-cjk \
        fonts-noto-color-emoji \
        locales \
        novnc \
        procps \
        tzdata \
        websockify \
        x11-utils \
        x11vnc \
        xvfb \
    && sed -i 's/^# *\(en_US.UTF-8\)/\1/' /etc/locale.gen \
    && locale-gen \
    # Debian ships the client as vnc.html; noVNC's auto-connecting entry point
    # is index.html, so point it at the client with sane defaults.
    && ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash browser

COPY container/start.sh /usr/local/bin/start-browser
RUN chmod +x /usr/local/bin/start-browser

USER browser
WORKDIR /home/browser

EXPOSE 8080

# dumb-init reaps the desktop's orphaned children when the session ends.
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/usr/local/bin/start-browser"]
