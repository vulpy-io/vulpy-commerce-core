/* Vulpy Commerce — agent environment context detection (runtime layer, invisible).
 *
 * The STATIC environment contract is injected by the prompt builder via
 * `.hermes.md` (highest-priority context file — see the
 * environment-context-injection reference). This feature is the RUNTIME
 * DETECTION layer on top of it:
 *
 *   1. `detectAccessMode()` — resolves how the WebUI is being viewed
 *      (embedded iframe / side panel vs top-level window) and whether the
 *      host gateway (`host.docker.internal`) is reachable from inside the
 *      container.
 *   2. `buildEnvContract(detection)` — composes a COMPACT environment
 *      contract (a few lines, not a wall of text) that the agent can read:
 *      host-gateway access, the authoritative context files, and the
 *      read-only `ts.status` bridge command for live Fox-Tailscale state.
 *   3. `getEnvContract()` — returns the last built contract (null until
 *      `detectAccessMode()` has run).
 *
 * INVISIBLE BY DESIGN (operator directive 2026-08-29): this feature renders
 * NO UI. The previous fresh-chat "Agent environment contract" card was
 * removed — nothing is injected into #emptyState, no MutationObserver, no
 * session listeners. The detection API stays for agent-side/console use only.
 *
 * Design constraints:
 *   - The live Fox-Tailscale state is NOT resolvable from inside Hermes (the
 *     tailscaled daemon runs in a sibling container, network_mode
 *     service:hermes). MagicDNS stays STATIC in .hermes.md. Live checks go
 *     through the host bridge: the read-only `ts.status` agent-cmd command.
 *   - This feature is deliberately NOT part of the hidden env chrome (see
 *     tests/env-visibility.test.ts — that gate only covers .vc-env-*). It is
 *     agent-context, not operator env controls.
 *   - Probe failures must never block normal UI. Every network call is
 *     wrapped; a failure resolves to a safe "unreachable" answer.
 */
(() => {
  if (!window.VulpyCommerce) { return; }
  const VC = window.VulpyCommerce;

  const HOST_GATEWAY_URL = "http://host.docker.internal";
  // The two host apps + the Fox UI port the agent uses to reach dev services.
  const HOST_PORTS = "9000 (Medusa) / 3000 (storefront) / 8787 (Fox UI)";
  const CONTEXT_FILES = ".hermes.md (static contract) + .agent/generated-context.md (volatile)";
  const TS_STATUS_HINT = "ts.status (agent-cmd bridge) = live Fox Tailscale state";

  let detection = null; // cached { iframe, hostReachable }
  const contract = null;  // cached built contract

  /* ─── Detection ─────────────────────────────────────────────────────── */

  function detectIframe() {
    try {
      return window.top !== window.self;
    } catch (_e) {
      // Cross-origin iframe: accessing window.top throws — that IS an iframe.
      return true;
    }
  }

  async function probeHostGateway() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const res = await fetch(`${HOST_GATEWAY_URL}:9000/store/regions`, {
          method: "HEAD",
          signal: controller.signal,
          cache: "no-store",
        });
        return res.ok || res.status >= 300 || res.status >= 0; // any HTTP answer = reachable
      } finally {
        clearTimeout(timer);
      }
    } catch (_e) {
      return false;
    }
  }

  async function detectAccessMode() {
    const iframe = detectIframe();
    const hostReachable = await probeHostGateway();
    detection = { iframe, hostReachable };
    return detection;
  }

  /* ─── Contract builder ──────────────────────────────────────────────── */

  function buildEnvContract(d) {
    const mode = d?.iframe ? "side panel (iframe)" : "top-level window";
    const host = d?.hostReachable
      ? `reachable (${HOST_GATEWAY_URL}:${HOST_PORTS})`
      : `NOT reachable (${HOST_GATEWAY_URL} — host apps unavailable from inside)`;
    return [
      "ENVIRONMENT CONTRACT (auto-injected, compact)",
      `• Access mode: ${mode}`,
      `• Host gateway: ${host}`,
      `• Context files: ${CONTEXT_FILES}`,
      `• Live Tailscale: ${TS_STATUS_HINT}`,
      "",
      "Read the static contract in .hermes.md before answering environment",
      "questions; the volatile ports/status live in generated-context.md.",
    ].join("\n");
  }

  function getEnvContract() {
    if (contract) { return contract; }
    return null; // not built yet — detectAccessMode() populates it
  }

  /* ─── Bootstrap (API only — NO UI) ──────────────────────────────────── */

  VC.detectAccessMode = detectAccessMode;
  VC.buildEnvContract = buildEnvContract;
  VC.getEnvContract = getEnvContract;

  console.info("[vulpy-commerce] agent context detection registered (invisible — no UI)");
})();