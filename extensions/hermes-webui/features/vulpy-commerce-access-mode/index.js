/* Vulpy Commerce — per-session WebUI access-mode propagation (runtime layer, invisible).
 *
 * The operator reaches the WebUI over one of three access paths — Tailscale
 * (private *.ts.net), the public edge (admin.<domain> or any other public
 * host), or local loopback (localhost / 127.0.0.1 / ::1 / [::1]). The agent's
 * link-reply policy previously GUESSED (generate-agent-context.sh globally
 * preferred Tailscale whenever the sidecar is up — f9dd6975), which is wrong
 * when the operator actually views the WebUI over the public edge or
 * localhost.
 *
 * This feature is the CLIENT layer of the per-session fix:
 *
 *   1. On every session load (`session:loaded`, the core watcher fires this
 *      when the active session id changes — including the first detection)
 *      and on every send (`hermes:message-sent` from the event-bus patch),
 *      read the REAL page origin via `window.location.hostname`.
 *   2. Classify it EXACTLY: `*.ts.net` → tailscale; `admin.*` or any other
 *      non-loopback public host → public; `localhost` / `127.0.0.1` / `::1` /
 *      `[::1]` → local.
 *   3. POST ONLY the normalized `{session_id, mode, origin}` to the
 *      same-origin WebUI endpoint `/api/access-mode` (no paths, no HTML, no
 *      free text). The server persists the latest per session so the agent
 *      prompt for each run is told the operator's actual access mode.
 *
 * INVISIBLE BY DESIGN (operator directive 2026-08-29): this feature renders
 * NO UI and injects NO DOM. It only enriches agent run context.
 *
 * Design constraints:
 *   - Only the normalized mode + origin leave the browser; the server
 *     validates both strictly and rejects paths/HTML/traversal.
 *   - Dedup: one POST per (session, mode, origin) — repeated send events for
 *     the same session+origin do not spam the endpoint.
 *   - The whole pipeline is best-effort: a failed POST is silently ignored
 *     (the agent then falls back to "no session mode known → offer all
 *     labels without guessing").
 *
 * Namespace: window.VulpyCommerce (detectAccessModeHost / reportAccessMode).
 * No globals leak beyond the shared registry object.
 */
(() => {
  if (!window.VulpyCommerce) {
    console.error("[vulpy-commerce] core bootstrap missing — access-mode disabled");
    return;
  }
  const VC = window.VulpyCommerce;

  const ENDPOINT = "/api/access-mode";
  const MODE_TAILSCALE = "tailscale";
  const MODE_PUBLIC = "public";
  const MODE_LOCAL = "local";
  const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

  // (session_id|mode|origin) → true, so the same session never re-posts the
  // same classification (send events fire often; the server only needs the
  // latest, and only once per change).
  const reported = new Set();

  function currentSessionId() {
    if (typeof S !== "undefined" && S && S.session && S.session.session_id) {
      return String(S.session.session_id);
    }
    return null;
  }

  function detectAccessModeHost(hostname) {
    const host = String(hostname || "").trim().toLowerCase();
    if (!host) { return null; }
    if (host.endsWith(".ts.net")) { return MODE_TAILSCALE; }
    if (LOOPBACK.has(host)) { return MODE_LOCAL; }
    // Anything else that is not loopback is the public edge (admin.<domain>
    // is the canonical WebUI host, but any non-loopback public host counts).
    return MODE_PUBLIC;
  }

  function reportAccessMode(sidOverride) {
    const sid = sidOverride || currentSessionId();
    if (!sid) { return; }
    const hostname = (typeof window !== "undefined" && window.location)
      ? window.location.hostname
      : "";
    const mode = detectAccessModeHost(hostname);
    if (!mode) { return; }

    const key = `${sid}|${mode}|${hostname}`;
    if (reported.has(key)) { return; }
    reported.add(key);

    const payload = JSON.stringify({
      session_id: sid,
      mode,
      origin: hostname,
    });

    // Same-origin WebUI api() helper; fire-and-forget (best-effort).
    if (typeof api === "function") {
      try {
        api(ENDPOINT, { method: "POST", body: payload }).catch(() => {});
      } catch (_e) {
        /* non-fatal */
      }
    }
  }

  // Public API — console/tests only (INVISIBLE).
  VC.detectAccessModeHost = detectAccessModeHost;
  VC.reportAccessMode = reportAccessMode;

  // Report on every session load (core emits session:loaded when the active
  // session id changes, including first detection). The payload carries the
  // session id explicitly; fall back to S.
  VC.on("session:loaded", (data) => {
    reportAccessMode(data?.session_id ? String(data.session_id) : null);
  });

  // Report on every send too — a session's access path cannot change mid-run,
  // but the session_id can (a brand-new chat created from the composer), and
  // the dedup set makes re-reports a no-op for the same session+origin.
  try {
    window.addEventListener("hermes:message-sent", (evt) => {
      const sid = evt?.detail?.sessionId
        ? String(evt.detail.sessionId)
        : null;
      reportAccessMode(sid);
    });
  } catch (_e) {
    /* non-fatal */
  }

  // Also report once on boot (covers the case where the core watcher's first
  // tick races the active session being set).
  reportAccessMode();
})();
