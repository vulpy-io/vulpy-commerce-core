---
name: hermes-browser-operations
description: Use when Hermes browser tasks are flaky — basic-auth hiccups, session state not persisting across tasks/calls, disposable per-task Chromium losing cookies/logins, or the 120s inactivity cleanup reaping the browser daemon. Covers standing up a durable self-hosted persistent CDP browser (chrome-headless-shell) with a persistent profile, wiring Hermes to it via browser.cdp_url + allow_private_urls, and a self-healing watchdog cron.
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [browser, cdp, persistence, chromium, session, auth, watchdog, reliability]
    category: autonomous-ai-agents
---

# Hermes Browser Operations — Persistent CDP Browser for Reliable Sessions

## When to use
- Browser automation is flaky: basic-auth prompts reappear mid-task, cookies/logins don't survive across agent tasks or tool calls, or a task pauses >2 minutes and the next browser call fails.
- You need a **self-hosted** browser harness (no Browserbase/Browser Use cloud account) with durable session state.

## Root cause of the flakiness
Hermes' default **local browser mode** uses `agent-browser` which launches a **disposable headless Chromium per task** (`--session <name>`):

1. A background cleanup thread reaps sessions inactive > **`browser.inactivity_timeout` (default 120s)** — a task that pauses >2min loses its browser (and any in-page auth).
2. Each task gets a **fresh profile**, so cookies, basic-auth creds, and logged-in state die with the disposable browser.

The fix: run ONE persistent Chromium daemon with a **durable profile on disk**, and point Hermes at it via the CDP override. `agent-browser` then becomes a thin **CDP client** (`--cdp <ws>`), not a per-task launcher. Session state lives in the profile and survives task boundaries, call boundaries, and container restarts.

## The setup (verified working on Vulpy Fox container)

### 1. Know your binaries
- Full `chrome` may fail in containers with a crashpad error (`chrome_crashpad_handler: --database is required` + connection reset). **Use `chrome-headless-shell`** instead — purpose-built, no crashpad, stable daemon.
  - Path: `<playwright_root>/chromium_headless_shell-<ver>/chrome-headless-shell-linux64/chrome-headless-shell`
  - On this install: `/opt/hermes/.playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`
- Find it with: `find /opt/hermes/.playwright -maxdepth 3 -type f -name "chrome-headless-shell"`

### 2. Choose a DURABLE profile location
Only `/data` (and `/app/workspace` in the Fox container) survive container recreate/rebuild.
- `/data/data` is root-owned — NOT writable. Use **`/data/data/hermes/`** (owned by the fox user).
- `mkdir -p /data/data/hermes/browser-profile/Crashpad`

### 3. Launch the persistent browser (daemon)
```bash
/opt/hermes/.playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell \
  --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/data/data/hermes/browser-profile \
  --no-first-run --no-default-browser-check about:blank
```
Run as a **background process** (Hermes `terminal(background=true)`), not foreground `&`.
Verify: `curl -s http://127.0.0.1:9222/json/version` → HTTP 200, `webSocketDebuggerUrl` present.

### 4. Wire Hermes to it (takes effect immediately — read lazily per call)
```bash
hermes config set browser.cdp_url http://127.0.0.1:9222
hermes config set browser.allow_private_urls true
```
- `cdp_url` → `agent-browser` now calls `--cdp <ws>` against the persistent daemon (`_run_browser_command` emits `--cdp` when session has `cdp_url`). No more per-task disposable browser.
- `allow_private_urls: true` is **REQUIRED** — a CDP override makes `_is_local_backend()` return False, so private/loopback/admin/`host.docker.internal` URLs would be **blocked by the SSRF guard** otherwise. Safe here because the CDP browser is genuinely local loopback.
- Verify a nav returns `stealth_features: ["cdp_override"]` — that confirms routing through the persistent browser.

### 5. Prove persistence across tasks
Use CDP to set a cookie on one connection, then read it back on a **fresh** websocket (simulating a new task). Cookie + origin must survive in the shared profile. Re-runnable proof: `scripts/verify-cdp-persistence.py` (opens two connections to the same browser, sets a cookie in A, asserts B reads it back; exit 0 = PASS):

```bash
python3 /data/data/hermes/skills/autonomous-ai-agents/hermes-browser-operations/scripts/verify-cdp-persistence.py
```

Manual equivalent (`websockets` 15.x on system python3, no pip):
```python
# conn A: Network.enable → Network.setCookie → document.cookie shows it
# conn B (new ws): document.cookie still shows it, location.href kept
```
Also confirm the durable state file exists: `/data/data/hermes/browser-profile/Default/Cookies`.

### 6. Self-healing watchdog (survives container rebuilds)
Hermes cron `no_agent` scripts are resolved against **`$HERMES_HOME/scripts/`** (NOT `~/.hermes/scripts/` — the tool validation message is misleading; scheduler uses `HERMES_HOME/scripts/`). Use a **bare filename** in the cron `script` field.

Script `/data/data/hermes/scripts/browser-watchdog.sh` (silent-when-healthy pattern):
```bash
#!/bin/bash
set -u
CDP_URL="http://127.0.0.1:9222/json/version"
PROFILE="/data/data/hermes/browser-profile"
CHROME="/opt/hermes/.playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell"
LOG="/data/logs/browser-watchdog.log"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG"; }
healthy=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$CDP_URL" 2>/dev/null)
[ "$healthy" = "200" ] && exit 0   # quiet when healthy
log "CDP endpoint not healthy (http=$healthy) — (re)starting"
mkdir -p "$PROFILE/Crashpad"
nohup "$CHROME" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
  about:blank >> "$LOG" 2>&1 &
sleep 3
healthy=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$CDP_URL" 2>/dev/null)
[ "$healthy" = "200" ] && echo "browser-watchdog: started persistent CDP browser (http=$healthy)" \
  || echo "browser-watchdog: FAILED to start persistent browser (http=$healthy)"
exit 0
```
Register the cron (no-agent, deliver local, every 2m):
```bash
hermes cron create every 2m --name persistent-browser-watchdog \
  --script browser-watchdog.sh --no-agent
```
(The `cronjob` tool equivalent: `action=create`, `no_agent=true`, `script="browser-watchdog.sh"`, `deliver="local"`, `schedule="every 2m"`.)

## Embedded WebUI panes and authenticated browser verification

### Tailnet MagicDNS unreachable from the container? Use a resolver-override browser

The Hermes browser can't resolve `*.ts.net` from inside the Fox container
(Docker resolver doesn't know MagicDNS; `/etc/hosts` is root-owned with no
sudo). Navigating the raw tailscale IP fails with `ERR_SSL_PROTOCOL_ERROR`
(SNI-based serving). Launch a dedicated `chrome-headless-shell` with
`--host-resolver-rules="MAP <tailnet-name> <tailscale-ip>"` and
`--ignore-certificate-errors`, drive it over raw CDP with Node's built-in
`global.WebSocket` (no `ws` package), and screenshot via
`Page.captureScreenshot`. Full recipe + the password-field poisoning pitfall
(never autofill the first `type=password` input — on a settings page it may
be the Vulpy Cloud API-key field): see `references/raw-cdp-dns-verification.md`.

When validating WebUI workspace panes (Browser, embedded storefront/admins, or a Code
Editor iframe), do not stop at the top-level page snapshot or `/health`:

1. Open the panel and click each target tab with a trusted browser click. Record the
   selected/active state, iframe `src`, computed display/visibility, dimensions, and
   frame tree. A top-level WebUI can be healthy while an embedded target is
   `chrome-error://chromewebdata/`.
2. Inspect the frame tree for failed child frames and use the child frame's `frame_id`
   with CDP `Runtime.evaluate` when needed. Top-level console output often has zero
   errors because iframe navigation/TLS/DNS failures do not bubble to the parent.
3. Correlate the URL with the current access mode. A loopback WebUI should embed
   loopback app URLs; a Tailscale WebUI should embed same-host Tailscale URLs; public
   access should use public sibling hosts. Explicit iframe config can override correct
   derived URL resolution and create an access-mode mismatch.
4. For a dynamically-added Code Editor tab, check both halves: the tab's reachability
   probe and the backend itself. A missing tab usually means the probe failed, not that
   the renderer failed. Probe the configured port directly and distinguish connection
   refusal from an ingress `502`; inspect the service/container listener before changing
   frontend code.
   **Opaque-response trap:** a probe that reads `.status` from a `no-cors` cross-origin
   fetch to a non-CORS server (e.g. code-server) gets an opaque `status: 0` — the request
   succeeds (200 in the Network tab) but JS never sees a 2xx/3xx, so the tab stays hidden.
   Treat any completed no-cors fetch as reachable (resolve = reachable, reject = unreachable);
   never judge availability by status over no-cors. See
   `vulpy-environment-operations/references/side-panel-no-cors-probe-trap.md`.
5. Authentication safety: HTTP Basic/gateway auth is not a DOM password field. Never
   fill `document.querySelector('input[type=password]')` as a login shortcut after an
   auth challenge; that may target a Vulpy Cloud API-key or settings field and submit a
   real credential change. Handle the browser auth challenge explicitly, then identify
   the intended form by label/role and verify no credential-setting request was made.
   If a probe may have submitted the wrong secret, stop, report it plainly, check
   persisted credential stores without printing values, and recommend rotation.
6. Operator/Tailscale URL verification from inside the container: MagicDNS names
   (`vulpy-commerce-private.tail873f17.ts.net`) do NOT resolve inside the Fox container,
   `/etc/hosts` is root-owned (no sudo), and navigating the raw tailscale IP fails with
   `ERR_SSL_PROTOCOL_ERROR` (SNI mismatch). Use `curl --resolve` for CLI probes, or a
   dedicated `chrome-headless-shell` launched with
   `--host-resolver-rules=MAP <tailnet> <tailscale-ip>` + raw CDP for full
   login/click-through. See `references/tailnet-operator-url-from-container.md`.

## Pitfalls
- **The persistent CDP browser has NO auth cookies by default.** On auth-enabled WebUIs (`HERMES_WEBUI_PASSWORD` set), the CDP browser's fresh profile can't load authenticated content: navigating to `/session/<id>` shows the onboarding splash/login instead of the conversation, and media/preview endpoints 302→`/login` (or 401 for `/api/*`). `browser_console` shows zero JS errors — the UI just never loaded the session. Do NOT try to log the browser in by guessing/extracting the operator's password, and do NOT hand-mint a session cookie by editing `.sessions.json` (the server keeps `_sessions` in memory; any concurrent login rewrites the file and prunes your entry). Verify server-side instead (call the allow-list/`get_session` logic directly in Python) and treat the operator's own authenticated browser as the source of truth for live UI. See `vulpy-webui-extension-development/references/webui-cdp-auth-verification.md` for the full write-up.
- **Basic-auth headers alone are not enough for browser smoke tests**: attach a CDP Fetch auth-challenge handler and continue paused requests; see `references/authenticated-smoke-tests.md`.
- **Do not call the UI healthy from `/health` alone**: verify authenticated navigation, session list, composer, a real harmless interaction, browser console, and fresh correlated logs.
- **Onboarding readiness is separate from browser authentication**: a configured provider should be detected through an authenticated `/api/settings` probe; skip only on explicit non-empty model+provider readiness. Failed, non-OK, malformed, or incomplete responses retain manual setup, and the async probe must not block native chat.
- **Always verify writability of the profile dir**: `/data/data` is root-owned; use `/data/data/hermes/`.
- **Use the right binary**: full `chrome` → crashpad `--database is required` death; `chrome-headless-shell` → stable.
- **Do NOT set `browser.cdp_url` without `allow_private_urls: true`** — you'll silently break all private/admin/loopback navs (SSRF guard treats CDP as non-local).
- **cron `script` must be a bare filename** resolved under `$HERMES_HOME/scripts/`; the `cronjob` tool rejects absolute paths.
- **Don't test the watchdog restart by killing the running browser without user consent** — killing processes triggers the destructive-command blocker. Test by stopping it only if the user approves, or trust the armed watchdog.
- The session API/WebUI serves calls lazily; config changes to `cdp_url`/`allow_private_urls` take effect **immediately** because `_get_cdp_override()` calls `read_raw_config()` per call — no gateway restart needed.
- **Disk state and the live WebUI process can disagree after a direct migration.** A source/provisioning fix can be correct, and a sidecar/index can contain the repaired value, while the running server still serves its pre-migration in-memory session object. Always verify both layers: (1) persisted session JSON/index and (2) the authenticated `/api/session` response plus rendered DOM. If only disk is repaired and the API still returns the old message, do not claim the UI is fixed; use the supported server reload/restart path when the operator authorizes it, or document the remaining runtime-cache gap.
- **Do not use source freshness as proof of existing-session repair.** Provisioners that skip by title or ID update new stores only; explicitly test legacy persisted sessions, preserve IDs/history, take a targeted backup, and make the repair idempotent before applying it.
- When reporting a visual fix, lead with the short verdict and the exact remaining action. Do not bury a required restart, cache invalidation, or runtime fixture behind a long verification list.