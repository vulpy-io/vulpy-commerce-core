/* Fox in the Box — model picker filter (#304, v0.7.30).
 *
 * Hide unavailable provider groups, while retaining Ollama, configured providers,
 * and the active provider. This runs after the host has populated #modelSelect.
 */
(() => {
  

  const HINT_PREFIX = "__ollama_hint:";
  const SHOW_ALL_KEY = "fitb-model-picker-show-all";
  const SETTLE_MS = 600;
  const ALWAYS_VISIBLE = new Set(["ollama"]);

  function getConfiguredProviders() {
    const badges = window._configuredModelBadges || {};
    const providers = new Set();
    for (const [, badge] of Object.entries(badges)) {
      const provider = badge?.provider;
      if (provider && typeof provider === "string") { providers.add(provider.toLowerCase()); }
    }
    const active = window._activeProvider;
    if (active && typeof active === "string") { providers.add(active.toLowerCase()); }
    return providers;
  }

  function shouldShowAll() {
    return sessionStorage.getItem(SHOW_ALL_KEY) === "1";
  }

  function applyFilter(select) {
    const configured = getConfiguredProviders();
    if (configured.size === 0 || shouldShowAll()) { return; }

    let hiddenCount = 0;
    for (const group of select.querySelectorAll("optgroup")) {
      const providerId = (group.dataset.provider || group.label || "").toLowerCase();
      const isAlwaysVisible = ALWAYS_VISIBLE.has(providerId);
      const isConfigured = configured.has(providerId);
      // HTMLOptGroupElement has no .options collection. Query descendants so
      // browser-native optgroups and host-created groups behave identically.
      const hasConfiguredModel = Array.from(group.querySelectorAll("option")).some(
        (option) => option.value
          && !option.value.startsWith(HINT_PREFIX)
          && Object.hasOwn(window._configuredModelBadges || {}, option.value),
      );

      if (((isAlwaysVisible || isConfigured ) || hasConfiguredModel)) {
        group.hidden = false;
      } else {
        group.hidden = true;
        hiddenCount++;
      }
    }

    const existing = select.parentElement?.querySelector(".fitb-show-all-models");
    if (hiddenCount > 0 && !existing) {
      const link = document.createElement("div");
      link.className = "fitb-show-all-models";
      link.style.cssText = "font-size:11px;text-align:center;padding:4px;cursor:pointer;opacity:0.6;";
      link.textContent = "Show all models";
      link.title = "Show models for providers you haven't configured yet";
      link.addEventListener("click", () => {
        sessionStorage.setItem(SHOW_ALL_KEY, "1");
        link.remove();
        applyFilter(select);
      });
      select.parentElement?.appendChild(link);
    } else if (hiddenCount === 0) {
      existing?.remove();
    }
  }

  let observer = null;
  function attachObserver(select) {
    observer?.disconnect();
    observer = new MutationObserver(() => applyFilter(select));
    observer.observe(select, { childList: true, subtree: true });
  }

  function init() {
    const select = document.getElementById("modelSelect");
    if (!select) { return; }
    applyFilter(select);
    attachObserver(select);
  }

  function setup() {
    setTimeout(init, SETTLE_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
})();
