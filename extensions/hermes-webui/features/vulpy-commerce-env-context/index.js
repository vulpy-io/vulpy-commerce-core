/* Vulpy Commerce — env context feature.
 *
 * Environment awareness for the WebUI: each conversation is bound to an
 * environment (dev/staging/live). The env chrome lives INSIDE the WebUI's
 * native titlebar (header.app-titlebar) — pill + env switcher popover +
 * action group slot — so overlap with the titlebar's own controls is
 * impossible by construction (operator direction 2026-08-18, factory/180).
 *
 * New conversations are auto-assigned the previously active session's env
 * (dev when none) instead of showing a picker prompt. The session list gets
 * a small env tag per thread (DEV/STAGING/LIVE), mirroring the project dot.
 *
 * Namespace: vc-env-* ids/classes, data-vc-env attributes. No globals leak
 * beyond the VulpyCommerce extensions on the shared registry object.
 */
(() => {

  if (!window.VulpyCommerce) {
    console.error("[vulpy-commerce] core bootstrap missing — env-context disabled");
    return;
  }

  VulpyCommerce.register({
    id: "env-context",
    name: "Environment Context",
  });

  // ─── Constants ────────────────────────────────────────────────────────
  const ENV_COLORS = { dev: "#19381F", staging: "#AB3C00", live: "#760521" };
  const ENV_LABELS = { dev: "DEV", staging: "STAGING", live: "LIVE" };
  const VALID_ENVS = ["dev", "staging", "live"];

  // ─── Public API ───────────────────────────────────────────────────────
  VulpyCommerce.ENV_COLORS = ENV_COLORS;
  VulpyCommerce.ENV_LABELS = ENV_LABELS;

  // Track the last env value so we can skip redundant marker writes
  const _lastWrittenEnv = null;

  function writeEnvMarker(env) {
    if (VALID_ENVS.indexOf(env) === -1) { return; }
    const sid = getSessionId();
    if (!sid) { return; }
    // Write .env-current marker for the agent context script
    if (typeof api === "function") {
      api("/api/file/create", {
        method: "POST",
        body: JSON.stringify({
          session_id: sid,
          path: ".env-current",
          content: env,                    // plain string, not JSON-wrapped
        }),
      }).catch(() => {}); // fire-and-forget — marker is best-effort
    }
  }

  function getSessionId() {
    if (typeof S !== "undefined" && S && S.session && S.session.session_id) {
      return String(S.session.session_id);
    }
    return null;
  }

  function storageKey(sid) {
    return `vulpy_env_${sid || "default"}`;
  }

  function getSessionEnv() {
    const sid = getSessionId();
    const stored = localStorage.getItem(storageKey(sid));
    if (stored && VALID_ENVS.indexOf(stored) !== -1) { return stored; }
    return "dev";
  }

  function setSessionEnv(env) {
    if (VALID_ENVS.indexOf(env) === -1) { return; }
    const sid = getSessionId();
    const prev = getSessionEnv();
    localStorage.setItem(storageKey(sid), env);
    lastActiveEnv = env;
    window.dispatchEvent(new CustomEvent("vulpy-env-changed", {
      detail: { env, sessionId: sid },
    }));
    updateUI(env);
    if (env !== prev) {
      VulpyCommerce.writeEnvMarker(env);
    }
  }

  // ─── Last-active env memory ───────────────────────────────────────────
  // The env of the most recently observed session. New chats inherit it, so
  // switching from a staging thread → new chat assigns staging (no picker).
  let lastActiveEnv = null;

  function rememberEnv(env) {
    if (VALID_ENVS.indexOf(env) !== -1) { lastActiveEnv = env; }
  }

  // ─── Pre-existing thread backfill ─────────────────────────────────────
  // Threads created before the env feature have no stored env. Default them
  // to dev (explicitly persisted) so loading an old session never triggers
  // the picker and the session list can tag them.
  function backfillLegacyThreadsToDev() {
    const seen = new Set();
    const currentSid = getSessionId();
    for (const row of document.querySelectorAll("[data-sid]")) {
      const sid = String(row.dataset.sid || "").trim();
      if (!sid || seen.has(sid)) { continue; }
      seen.add(sid);
      // The ACTIVE session is handled by autoAssignEnvForNewThread (new
      // chats inherit the previous env; legacy threads fall back to dev).
      // Backfilling it here first would stomp the inheritance with dev.
      if (sid === currentSid) { continue; }
      if (VALID_ENVS.indexOf(localStorage.getItem(storageKey(sid))) === -1) {
        localStorage.setItem(storageKey(sid), "dev");
      }
    }
  }

  // ─── Session-list env tags ────────────────────────────────────────────
  // Each .session-item[data-sid] row gets a small env tag (DEV/STAGING/LIVE)
  // in its title row, next to the project dot, colored with the env palette.
  // Idempotent per row; legacy threads render too once backfilled to dev.
  function renderEnvTags() {
    if (!VulpyCommerce.isEnvironmentControlsVisible()) { return; }
    for (const row of document.querySelectorAll(".session-item[data-sid]")) {
      const sid = String(row.dataset.sid || "").trim();
      if (!sid) { continue; }
      const titleRow = row.querySelector(".session-title-row");
      if (!titleRow || titleRow.querySelector(".vc-env-tag")) { continue; }
      const stored = localStorage.getItem(storageKey(sid));
      const env = VALID_ENVS.indexOf(stored) === -1 ? "dev" : stored;
      const tag = el("span", {
        class: `vc-env-tag vc-env-tag--${env}`,
        text: ENV_LABELS[env],
        "data-vc-env-tag": env,
      });
      tag.title = `Environment: ${env}`;
      // Insert after the title/project dot, before the timestamp (which is
      // margin-left:auto pushed to the row's right edge).
      const time = titleRow.querySelector(".session-time");
      if (time) { titleRow.insertBefore(tag, time); }
      else { titleRow.appendChild(tag); }
    }
  }

  VulpyCommerce.getSessionEnv = getSessionEnv;
  VulpyCommerce.setSessionEnv = setSessionEnv;
  VulpyCommerce.writeEnvMarker = writeEnvMarker;

  // ─── UI State ─────────────────────────────────────────────────────────
  let bar = null;          // 6px top color strip
  let container = null;    // .vc-env-titlebar (inside header.app-titlebar)
  let pill = null;
  let popover = null;
  let built = false;

  // ─── Helpers ──────────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const val = attrs[key];
        if (key === "class") { node.className = val; }
        else if (key === "text") { node.textContent = val; }
        else if (key === "html") { node.innerHTML = val; }
        else { node.setAttribute(key, val); }
      }
    }
    for (const child of children || []) {
      if (child) { node.appendChild(child); }
    }
    return node;
  }

  function updateUI(env) {
    if (!built) { return; }
    if (bar) {
      bar.style.backgroundColor = ENV_COLORS[env] || ENV_COLORS.dev;
    }
    if (pill) {
      pill.textContent = ENV_LABELS[env] || ENV_LABELS.dev;
      for (const e of VALID_ENVS) {
        pill.classList.toggle(`vc-env-pill--${e}`, e === env);
      }
    }
  }

  // ─── Titlebar embedding ───────────────────────────────────────────────
  // The env chrome lives inside header.app-titlebar as a .vc-env-titlebar
  // chip (styled like the host's .app-titlebar-profile). Inserted after the
  // title group, before .app-titlebar-new-chat; margin-left:auto right-aligns
  // it on desktop where new-chat is hidden.
  function insertIntoTitlebar(node) {
    const host = document.querySelector(".app-titlebar");
    if (!host) { document.body.appendChild(node); return; }
    const anchor = host.querySelector(".app-titlebar-new-chat")
      || host.querySelector(".app-titlebar-spacer");
    if (anchor) { host.insertBefore(node, anchor); }
    else { host.appendChild(node); }
  }

  function createContainer() {
    let node = document.querySelector(".vc-env-titlebar");
    if (!node) {
      node = el("div", { id: "vc-env-titlebar", class: "vc-env-titlebar", "data-vc-env-bar": "" });
      insertIntoTitlebar(node);
    }
    return node;
  }

  function buildUI() {
    if (!VulpyCommerce.isEnvironmentControlsVisible()) { return; }
    if (built) { return; }
    built = true;

    const currentEnv = getSessionEnv();
    rememberEnv(currentEnv);

    // Top bar — 6px colored strip at the very top (env color coding).
    bar = el("div", { id: "vc-env-bar", class: "vc-env-bar" });
    bar.style.position = "fixed";
    bar.style.top = "0";
    bar.style.left = "0";
    bar.style.right = "0";
    bar.style.height = "6px";
    bar.style.zIndex = "2147483001";
    bar.style.backgroundColor = ENV_COLORS[currentEnv] || ENV_COLORS.dev;
    bar.style.pointerEvents = "none";
    document.body.appendChild(bar);

    // Titlebar chip — pill + action group in ONE flex row inside the native
    // titlebar. env-context owns the chip; env-actions appends its buttons
    // to the .vc-env-actions group afterwards (contract §2.1 / §5.4).
    container = createContainer();

    // Pill badge — env identity (left accent + label color).
    pill = el("button", {
      class: `vc-env-pill vc-env-pill--${currentEnv}`,
      text: ENV_LABELS[currentEnv] || ENV_LABELS.dev,
    });
    pill.setAttribute("type", "button");
    pill.setAttribute("aria-label", `Environment: ${currentEnv}`);
    pill.setAttribute("data-vc-env-pill", "");
    pill.addEventListener("click", togglePopover);
    container.insertBefore(pill, container.firstChild);

    // Action group — filled by env-actions. Keeps the test-finder attribute.
    let actionsGroup = container.querySelector(".vc-env-actions");
    if (!actionsGroup) {
      actionsGroup = el("div", { class: "vc-env-actions", "data-vc-env-actions-bar": "" });
      container.appendChild(actionsGroup);
    }

    // Expose the container so env-actions can consume it at build time.
    VulpyCommerce.envBar = container;
    VulpyCommerce.emit("env-bar:ready", container);

    // Popover (hidden by default) — anchored under the titlebar.
    popover = el("div", { class: "vc-env-popover" });
    popover.hidden = true;
    for (const env of VALID_ENVS) {
      const opt = el("button", {
        class: "vc-env-popover-option",
        "data-vc-env": env,
        text: ENV_LABELS[env],
      });
      opt.setAttribute("type", "button");
      opt.addEventListener("click", () => {
        onPopoverSelect(env);
      });
      popover.appendChild(opt);
    }
    document.body.appendChild(popover);

    // Global keyboard handler — ESC closes the popover.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && popover && !popover.hidden) {
        popover.hidden = true;
      }
    });

    // Click outside popover closes it.
    document.addEventListener("click", (e) => {
      if (popover && !popover.hidden && !popover.contains(e.target) && e.target !== pill) {
        popover.hidden = true;
      }
    });
  }

  // ─── Popover (pill click → env switcher) ─────────────────────────────
  function togglePopover() {
    if (!popover) { return; }
    popover.hidden = !popover.hidden;
  }

  function onPopoverSelect(env) {
    popover.hidden = true;
    const currentEnv = getSessionEnv();
    if (env === currentEnv) { return; }

    // Different env selected — create new session
    if (typeof api === "function") {
      api("/api/session/new", { method: "POST", body: JSON.stringify({}) })
        .then((r) => {
          if (r?.session?.session_id) {
            const newSid = r.session.session_id;
            localStorage.setItem(storageKey(newSid), env);
            rememberEnv(env);
            VulpyCommerce.writeEnvMarker(env);
            // Let the WebUI handle the session switch
            if (typeof S !== "undefined" && S) {
              S._pendingSessionToolsets = null; // parity with ui.js new-session flow
              S.session = r.session;
              S.messages = [];
            }
            if (typeof syncTopbar === "function") { syncTopbar(); }
            if (typeof renderMessages === "function") { renderMessages(); }
            if (typeof renderSessionList === "function") { renderSessionList(); }
            updateUI(env);
            window.dispatchEvent(new CustomEvent("vulpy-env-changed", {
              detail: { env, sessionId: newSid },
            }));
          }
        })
        .catch((err) => {
          console.error("[vulpy-commerce] env switch failed:", err);
        });
    }
  }

  // ─── New-chat auto-assign ─────────────────────────────────────────────
  // When the session watcher sees a session id with NO persisted env and NO
  // messages yet (a brand-new thread), assign the previously active env
  // (dev if none) immediately — no picker prompt. Existing threads with no
  // stored env are already backfilled to dev by backfillLegacyThreadsToDev;
  // this is the safety net for the window before the rows render.
  function hasVisibleMessages(sessionData) {
    const candidates = [];
    if (sessionData && Array.isArray(sessionData.messages)) { candidates.push(...sessionData.messages); }
    if (typeof S !== "undefined" && S && Array.isArray(S.messages)) { candidates.push(...S.messages); }
    if (candidates.some((m) => m?.role !== "tool")) { return true; }
    if (typeof S !== "undefined" && S && S.session && typeof S.session.message_count === "number") {
      return S.session.message_count > 0;
    }
    return false;
  }

  function autoAssignEnvForNewThread(sessionData) {
    const sid = sessionData?.session_id || getSessionId();
    if (!sid) { return; }
    const stored = localStorage.getItem(storageKey(sid));
    if (VALID_ENVS.indexOf(stored) !== -1) {
      // Already tagged — just remember it for the next new chat.
      rememberEnv(stored);
      return;
    }
    const isNewThread = !hasVisibleMessages(sessionData);
    const env = isNewThread ? (lastActiveEnv || "dev") : "dev";
    localStorage.setItem(storageKey(sid), env);
    rememberEnv(env);
    VulpyCommerce.writeEnvMarker(env);
    updateUI(env);
    window.dispatchEvent(new CustomEvent("vulpy-env-changed", {
      detail: { env, sessionId: sid },
    }));
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────
  VulpyCommerce.on("session:loaded", (data) => {
    if (!VulpyCommerce.isEnvironmentControlsVisible()) { return; }
    // Auto-assign FIRST: a brand-new thread must inherit the previous env
    // before any legacy backfill can persist dev for its row.
    autoAssignEnvForNewThread(data);
    // Backfill legacy threads whenever a session loads (the list is usually
    // rendered by now; if not, the render hook below catches it).
    backfillLegacyThreadsToDev();
    renderEnvTags();
    // Update UI when session switches
    updateUI(getSessionEnv());
  });

  // The session list re-renders asynchronously after switching/new chat;
  // backfill + tag again once the rows exist so newly listed legacy threads
  // are tagged without requiring a session switch.
  const _backfillTimer = window.setInterval(() => {
    backfillLegacyThreadsToDev();
    renderEnvTags();
  }, 2000);

  document.addEventListener("DOMContentLoaded", () => {
    buildUI();
    backfillLegacyThreadsToDev();
    renderEnvTags();
  });

  // If DOM is already loaded (script deferred after DOMContentLoaded)
  if (document.readyState !== "loading") {
    buildUI();
    backfillLegacyThreadsToDev();
    renderEnvTags();
  }

})();
