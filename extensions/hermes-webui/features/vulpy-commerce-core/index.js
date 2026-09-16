/* Vulpy Commerce — core bootstrap.
 *
 * Single registry + runtime config loader + tiny event bus shared by all
 * vulpy-commerce-* features. Loaded FIRST in the vulpy-commerce manifest
 * `scripts` array (deferred scripts execute in order), so every later
 * feature script can rely on `window.VulpyCommerce` existing.
 *
 * Runtime config (iframe targets, ...) is rendered into the overlay at
 * container start by scripts/hermes-fox-entrypoint.sh from
 * VULPY_WEBUI_IFRAMES → /extensions/vulpy-commerce.config.json. A missing
 * or broken config file falls back to safe defaults ({ iframes: [] }).
 *
 * Namespace: everything here is window.VulpyCommerce / vulpy-commerce.* —
 * no globals leak beyond the single registry object.
 */
window.VulpyCommerce = (() => {
  

  // Temporary product gate: keep environment persistence/backend contracts
  // available while removing the complete user-facing env surface.
  const ENVIRONMENT_CONTROLS_VISIBLE = false;
  const features = new Map();
  const config = { iframes: [] };
  const listeners = new Map();
  let configLoaded = false;

  function on(event, fn) {
    if (typeof fn !== "function") { return; }
    if (!listeners.has(event)) { listeners.set(event, []); }
    listeners.get(event).push(fn);
  }

  function emit(event, data) {
    const fns = listeners.get(event);
    if (!fns) { return; }
    for (const fn of fns.slice()) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[vulpy-commerce] listener error for '${event}'`, err);
      }
    }
  }

  // Loaded by core on DOMContentLoaded; other code may call it too — it is
  // idempotent (a failed fetch keeps the safe defaults and still notifies).
  function loadConfig() {
    if (configLoaded) { return Promise.resolve(config); }
    configLoaded = true;
    return fetch("/extensions/vulpy-commerce.config.json", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : {})
      .then((cfg) => {
        Object.assign(config, cfg); // missing config = safe defaults
        return config;
      })
      .catch(() => {
        return config; // missing config = safe defaults
      })
      .then((cfg) => {
        emit("config:loaded", cfg);
        return cfg;
      });
  }

  // ─── Session watcher ──────────────────────────────────────────────────
  // The WebUI swaps S.session in-page on session switch (ui.js sets
  // S.session = r.session and re-renders; no DOM event is fired for it), so
  // extensions need a light poller to notice. Emits "session:loaded" with
  // { session_id, env } whenever the active session id changes — including
  // the first detection — so env-context can show the new-conversation env
  // picker and re-sync the pill/action bar for the new session's env.
  // env is read lazily via VulpyCommerce.getSessionEnv (registered by
  // env-context) so the payload carries the session's current env when
  // available.
  let _lastSessionId = null;

  function _currentSessionId() {
    if (typeof S !== "undefined" && S && S.session && S.session.session_id) {
      return String(S.session.session_id);
    }
    return null;
  }

  function _watchSession() {
    const sid = _currentSessionId();
    if (sid && sid !== _lastSessionId) {
      _lastSessionId = sid;
      const env = typeof VulpyCommerce.getSessionEnv === "function"
        ? VulpyCommerce.getSessionEnv()
        : null;
      emit("session:loaded", { session_id: sid, env });
    }
  }

  setInterval(_watchSession, 500);

  return {
    // feature: { id, name, mount?, pages? }
    register(feature) {
      if (!feature || typeof feature.id !== "string" || !feature.id) { return; }
      features.set(feature.id, feature);
    },
    getFeature(id) {
      return features.get(id);
    },
    getFeatures() {
      return Array.from(features.values());
    },
    getConfig() {
      return config;
    },
    isEnvironmentControlsVisible() {
      return ENVIRONMENT_CONTROLS_VISIBLE;
    },
    loadConfig,
    on,
    emit,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  VulpyCommerce.loadConfig();
});
