#!/bin/bash
# Persistent CDP browser watchdog — keep the durable headless Chromium up.
#
# Place in $HERMES_HOME/scripts/ (e.g. /data/data/hermes/scripts/) and register
# as a no_agent cron job with script=<bare filename> (relative-name resolution).
# Add with: cronjob action=create name=persistent-browser-watchdog
#           schedule="every 2m" script=browser-watchdog.sh no_agent=true
#           deliver=local prompt="Keep the persistent CDP browser up"
#
# Silent no_agent cron pattern: print NOTHING when healthy; print a one-line
# action summary only when an action was taken.
set -u

CDP_URL="http://127.0.0.1:9222/json/version"
PROFILE="/data/data/hermes/browser-profile"   # durable across container rebuilds
CHROME="/opt/hermes/.playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell"
LOG="/data/logs/browser-watchdog.log"

# Find the actual headless_shell if the baked revision number changed
if [ ! -x "$CHROME" ]; then
  CHROME=$(find /opt/hermes/.playwright -maxdepth 3 -type f -name "headless_shell" 2>/dev/null | head -1)
fi

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG"; }

# Healthy? (silent when up)
healthy=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$CDP_URL" 2>/dev/null)
if [ "$healthy" = "200" ]; then
  exit 0
fi

log "CDP endpoint not healthy (http=$healthy) — (re)starting persistent browser"
mkdir -p "$PROFILE/Crashpad"

nohup "$CHROME" \
  --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
  about:blank >> "$LOG" 2>&1 &

sleep 3
healthy=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$CDP_URL" 2>/dev/null)
if [ "$healthy" = "200" ]; then
  pid=$(pgrep -f "remote-debugging-port=9222" | head -1)
  echo "browser-watchdog: started persistent CDP browser (pid $pid, http=$healthy)"
else
  echo "browser-watchdog: FAILED to start persistent browser (http=$healthy)"
fi
exit 0