/* Vulpy Commerce — side panel feature.
 *
 * Floating rail toggle + right-hand drawer with lazy tabbed iframes.
 * - Tabs come from VulpyCommerce.getConfig().iframes (rendered at container
 *   start from VULPY_WEBUI_IFRAMES).
 * - Iframes are created on first activation and kept alive on tab switches.
 * - Empty config → canonical app tabs resolved from the session's active
 *   environment (VulpyCommerce.getSessionEnv()); explicit VULPY_WEBUI_IFRAMES
 *   entries always win over the derived defaults.
 * - Env-aware URL resolution: when the rendered config carries an `envs` map
 *   ({dev|staging|live: {shop, api}}), those URLs are used verbatim; otherwise
 *   (backward compat during rollout) URLs are derived from the page origin +
 *   the config's shopPort/apiPort for dev, or the canonical per-env ports for
 *   staging/live (3100/9100, 3200/9200).
 * - Each tab carries a colored env dot matching the session env color
 *   (VulpyCommerce.ENV_COLORS).
 * - Before an iframe is shown, the target is probed (HEAD, no-cors). On
 *   failure an offline placeholder with the start command + a Re-check button
 *   is shown; Re-check re-probes and loads the iframe on success.
 * - Live admins (Medusa + Payload) are never iframed: they render a
 *   confirmation gate that opens the admin in a new tab (changes affect
 *   production data). The live storefront iframe loads normally (read-only
 *   customer view).
 * - On `vulpy-env-changed` (dispatched by vulpy-commerce-env-context) all tab
 *   URLs are re-resolved for the new env, dots are re-colored, and the active
 *   tab is re-probed.
 * - CSP hint: external iframe targets must be allowed by
 *   HERMES_WEBUI_CSP_FRAME_EXTRA or the frame stays blank.
 *
 * Namespace: vc-panel-* ids/classes, data-vc-* attributes, registry id
 * "side-panel". No globals leak.
 */
(() => {

  if (!window.VulpyCommerce) {
    console.error("[vulpy-commerce] core bootstrap missing — side panel disabled");
    return;
  }

  const NS = "vc-panel";

  VulpyCommerce.register({
    id: "side-panel",
    name: "Side Panel",
  });

  let root = null;      // #vc-panel-root
  let drawer = null;    // .vc-panel-drawer
  let frameWrap = null; // .vc-panel-frame-wrap
  let loadingBar = null; // .vc-panel-loading (progress bar)
  let frameStatus = null; // .vc-panel-frame-status
  let hint = null;      // .vc-panel-hint
  let toggle = null;
  let offline = null;   // .vc-panel-env-offline (placeholder)
  let offlineTitle = null;
  let offlineCode = null;
  let gate = null;      // .vc-panel-live-admin-gate
  let gateLink = null;
  const frames = new Map();       // tabId -> iframe element (lazy, kept alive)
  const tabButtons = new Map();   // tabId -> tab button
  let _activeTabId = null;
  let open = false;
  let built = false;
  let nativePanel = false;
  let nativeTab = null;
  let nativeSelect = null;
  let nativeBrowser = null;
  let codeEditorTab = null;
  let codeEditorFrameWrap = null;
  let codeEditorActive = false;
  let codeEditorRetryTimer = null;
  let codeEditorRetryGeneration = 0;
  let nativePanelObserver = null; // watches the host .rightpanel for active-tab changes
  let nativePanelSyncBusy = false; // re-entrancy guard for the observer + setNativeTabActive

  /* Per-env canonical ports — used only when the rendered config has no
   * `envs` map (backward compat during rollout). `dev` prefers the config's
   * own shopPort/apiPort; staging/live use their canonical ports. */
  const PORT_MAP = {
    dev: { shop: 3000, api: 9000 },
    staging: { shop: 3100, api: 9100 },
    live: { shop: 3200, api: 9200 },
  };

  const VALID_ENVS = ["dev", "staging", "live"];

  /* Namespaced persistence key for the selected Browser target. The value is
   * "env|sessionId|tabId" so a choice never leaks across environments or
   * sessions (sessionId is empty when no session is known). */
  const BROWSER_TARGET_KEY = "vc:side-panel:browser:target";

  /* Native host tab buttons, keyed by the host's active-tab state names. */
  const NATIVE_TAB_IDS = {
    files: "workspaceFilesTab",
    artifacts: "workspaceArtifactsTab",
    todos: "workspaceTodosTab",
  };

  const SVG_TAGS = new Set(["svg", "path", "rect", "circle", "line", "polyline", "polygon", "g", "defs"]);

  function el(tag, attrs, children) {
    // SVG child tags must live in the SVG namespace or browsers silently drop
    // them inside an <svg> (icons render as empty boxes / invisible).
    const node = SVG_TAGS.has(tag)
      ? document.createElementNS("http://www.w3.org/2000/svg", tag)
      : document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (key === "class") { node.setAttribute("class", value); }
        else if (key === "text") { node.textContent = value; }
        else if (key === "html") { node.innerHTML = value; }
        else if (key === "style" && typeof value === "object") {
          for (const [prop, val] of Object.entries(value)) { node.style[prop] = val; }
        }
        else { node.setAttribute(key, value); }
      }
    }
    for (const child of children || []) {
      if (child) { node.appendChild(child); }
    }
    return node;
  }

  function getEnv() {
    if (VulpyCommerce.getSessionEnv) {
      const env = VulpyCommerce.getSessionEnv();
      if (VALID_ENVS.indexOf(env) !== -1) { return env; }
    }
    return "dev";
  }

  function envColor() {
    const env = getEnv();
    return (VulpyCommerce.ENV_COLORS?.[env]) || "#3b82f6";
  }

  /* Resolve shop/api URLs for the session env.
   * Returns { env, shop, api, shopPort, apiPort } — when `shop` is a string
   * the URLs come from the config `envs` map verbatim; otherwise ports are
   * returned and the caller derives host URLs from the page origin. */
  function resolveEnvUrls() {
    const env = getEnv();
    const cfg = VulpyCommerce.getConfig() || {};
    const envs = cfg.envs && typeof cfg.envs === "object" ? cfg.envs : null;
    const envEntry = envs?.[env] ? envs[env] : null;
    if (envEntry && typeof envEntry.shop === "string" && envEntry.shop.trim()) {
      return {
        env,
        shop: envEntry.shop.trim(),
        api:
          typeof envEntry.api === "string" && envEntry.api.trim()
            ? envEntry.api.trim()
            : envEntry.shop.trim(),
        shopPort: null,
        apiPort: null,
      };
    }
    const ports = PORT_MAP[env] || PORT_MAP.dev;
    const shopPort = env === "dev" ? (cfg.shopPort || ports.shop) : ports.shop;
    const apiPort = env === "dev" ? (cfg.apiPort || ports.api) : ports.api;
    return { env, shop: null, api: null, shopPort, apiPort };
  }

  /*
   * Derived app tabs — zero .env config, env-aware.
   *
   * When VULPY_WEBUI_IFRAMES is empty (or unset) the three canonical app
   * links are derived from the session env + the page's own URL so the panel
   * works in every access mode without hand-configuring environments/hermes/.env:
   * - Tailscale:   WebUI and apps share the *.ts.net hostname, apps on
   *                different ports (shop, api).
   * - Public edge: WebUI on admin.<domain>, apps on sibling hostnames
   *                (<domain> for the shop, api.<domain> for Medusa).
   * - Loopback:    dev WebUI + dev apps on the same host — apps on
   *                127.0.0.1 (plain http), reachable from the operator's
   *                own browser (host.docker.internal does NOT resolve from a
   *                host-side browser on Linux Docker).
   * When the config carries an `envs` map, those URLs are used verbatim
   * (they already point at the right host/port for the env).
   * Unknown hostnames get no defaults (the empty-state hint shows).
   * Mixed-content rule: iframe URLs mirror the page's own protocol — an
   * HTTPS page gets HTTPS frames, an HTTP page gets HTTP frames.
   * Explicit non-empty `iframes` config always wins over these defaults.
   */
  function deriveEnvTabs() {
    const { shop, api, shopPort, apiPort } = resolveEnvUrls();
    const { protocol, hostname } = window.location;

    let shopUrl;
    let apiUrl;
    if (shop) {
      // Config envs map — strip a trailing slash so `${url}/app` doesn't
      // produce a double slash (e.g. "https://myshop.com//admin").
      shopUrl = shop.replace(/\/+$/, "");
      apiUrl = api.replace(/\/+$/, "");
    } else if (
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "[::1]"
    ) {
      // Loopback: dev WebUI + dev apps on the same host, plain http.
      // host.docker.internal does NOT resolve from a host-side browser on
      // Linux Docker, so use host-local URLs the operator's browser can reach.
      shopUrl = `http://127.0.0.1:${shopPort}`;
      apiUrl = `http://127.0.0.1:${apiPort}`;
    } else if (hostname.endsWith(".ts.net")) {
      // Tailscale: same hostname as the WebUI, apps on their own ports.
      shopUrl = `${protocol}//${hostname}:${shopPort}`;
      apiUrl = `${protocol}//${hostname}:${apiPort}`;
    } else if (hostname.startsWith("admin.")) {
      // Public edge: WebUI on admin.<domain>, apps on <domain> / api.<domain>.
      const shopHost = hostname.slice("admin.".length);
      shopUrl = `${protocol}//${shopHost}`;
      apiUrl = `${protocol}//api.${shopHost}`;
    } else if (hostname.includes(".sslip.io")) {
      // Public edge on an IP-based hostname: [admin-|api-|dev-]<rand>.<ip>.sslip.io.
      // Fox/WebUI on admin-dev-…, shop on dev-…, Medusa on api-dev-… — all
      // sharing the same <rand>.<ip> core hostname. Strip leading prefixes,
      // keep the rest (dev-jliecn.35-175-224-200.sslip.io), and re-apply the
      // per-app label so every frame resolves on the same IP.
      const coreHost = hostname.replace(/^(admin-|api-|dev-)+/, "");
      shopUrl = `${protocol}//dev-${coreHost}`.replace(/\/+$/, "");
      apiUrl = `${protocol}//api-dev-${coreHost}`.replace(/\/+$/, "");
      // A bare sslip host (no label) treats itself as both shop and api origin.
      if (hostname === coreHost) {
        shopUrl = `${protocol}//${hostname}`;
        apiUrl = `${protocol}//${hostname}`;
      }
    } else {
      return [];
    }

    return [
      { id: "storefront", label: "Storefront", url: shopUrl, kind: "iframe" },
      { id: "medusa-admin", label: "Medusa Admin", url: `${apiUrl}/app`, kind: "iframe" },
      { id: "payload-admin", label: "Payload Admin", url: `${shopUrl}/admin`, kind: "iframe" },
    ];
  }

  function collectTabs() {
    const cfg = VulpyCommerce.getConfig() || {};
    const iframes = Array.isArray(cfg.iframes) ? cfg.iframes : [];
    const iframeTabs = [];
    for (const t of iframes) {
      if (!t || t.id === "editor" || typeof t.url !== "string" || !t.url.trim()) { continue; }
      iframeTabs.push({
        id: `frame-${t.id || t.url}`,
        label: t.label || t.id || t.url,
        url: resolveConfiguredUrl(t.url),
        kind: "iframe",
      });
    }
    if (iframeTabs.length === 0) { iframeTabs.push(...deriveEnvTabs()); }
    return { iframeTabs };
  }

  function getCodeEditorTab() {
    const cfg = VulpyCommerce.getConfig() || {};
    const target = Array.isArray(cfg.iframes)
      ? cfg.iframes.find((item) => item && item.id === "editor" && typeof item.url === "string" && item.url.trim())
      : null;
    return target ? { id: "frame-editor", label: target.label || "Code Editor", url: resolveConfiguredUrl(target.url), kind: "iframe" } : null;
  }

  function resolveConfiguredUrl(rawUrl) {
    try {
      const target = new URL(rawUrl, window.location.href);
      const pageHost = window.location.hostname;
      const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"];
      const pageIsLoopback = loopback.includes(pageHost);
      const pageIsTailscale = pageHost.endsWith(".ts.net");
      const targetIsLoopback = loopback.includes(target.hostname);
      const targetIsTailscale = target.hostname.endsWith(".ts.net");
      if (pageIsLoopback && targetIsTailscale) {
        target.protocol = window.location.protocol;
        target.hostname = "127.0.0.1";
      } else if (pageIsTailscale && targetIsLoopback) {
        target.protocol = window.location.protocol;
        target.hostname = pageHost;
      }
      return target.href;
    } catch {
      return rawUrl;
    }
  }

  function syncCodeEditorVisibility() {
    if (codeEditorTab) {
      codeEditorTab.classList.toggle("active", codeEditorActive);
      codeEditorTab.setAttribute("aria-selected", codeEditorActive ? "true" : "false");
    }
    if (codeEditorFrameWrap) { codeEditorFrameWrap.hidden = !codeEditorActive; }
    if (nativeBrowser && codeEditorActive) { nativeBrowser.hidden = true; }
  }

  function activateCodeEditor() {
    const tab = getCodeEditorTab();
    if (!((tab && codeEditorTab) && codeEditorFrameWrap)) { return; }
    codeEditorActive = true;
    // The editor is an extension-owned view. The host's switchWorkspacePanelTab
    // only knows files/artifacts/todos/browser — calling it with anything
    // coerces to "files" and RENDERS the Files view (the regression the
    // operator hit: editor click opened Files). So do NOT ask the host to
    // switch. Instead hide every host view directly and mark a sentinel
    // data-active-tab that no host tab matches, so all four host tabs
    // deactivate (syncNativeTabButtons) and only the editor tab is active.
    const files = document.querySelector("#fileTree");
    const artifacts = document.querySelector("#workspaceArtifacts");
    const breadcrumb = document.querySelector("#breadcrumbBar");
    const preview = document.querySelector("#previewArea");
    if (files) { files.hidden = true; }
    if (artifacts) { artifacts.hidden = true; }
    if (breadcrumb) { breadcrumb.hidden = true; }
    if (preview) { preview.hidden = true; }
    const panel = document.querySelector(".rightpanel");
    if (panel) { panel.dataset.activeTab = "editor"; }
    syncNativeTabButtons("editor");
    for (const frame of frames.values()) { frame.hidden = true; }
    if (nativeBrowser) { nativeBrowser.hidden = true; }
    ensureFrame(tab).hidden = false;
    _activeTabId = tab.id;
    syncCodeEditorVisibility();
  }

  function scheduleCodeEditorProbe(attempt = 0, generation = codeEditorRetryGeneration) {
    const tab = getCodeEditorTab();
    if (!tab || codeEditorTab || generation !== codeEditorRetryGeneration) { return; }
    const delays = [0, 1000, 2000, 4000, 8000, 15_000, 30_000];
    if (attempt >= delays.length) { return; }
    const run = () => {
      if (generation !== codeEditorRetryGeneration || codeEditorTab) { return; }
      probeUrl(tab.url, true).then((ok) => {
        if (generation !== codeEditorRetryGeneration || codeEditorTab) { return; }
        if (!ok) { scheduleCodeEditorProbe(attempt + 1, generation); return; }
        const tabs = document.querySelector(".rightpanel .workspace-panel-tabs");
        if (!tabs) { return; }
        codeEditorTab = el("button", {
          class: "workspace-panel-tab", type: "button", role: "tab",
          "aria-selected": "false", "aria-label": "Code Editor",
          "data-vc-native-code-editor-tab": "", text: tab.label,
        });
        codeEditorTab.addEventListener("click", activateCodeEditor);
        tabs.appendChild(codeEditorTab);
        codeEditorFrameWrap = el("div", { class: `${NS}-frame-wrap ${NS}-native-frame-wrap`, "data-vc-code-editor": "", hidden: "" });
        const browser = document.querySelector("[data-vc-browser]");
        if (browser) { browser.parentNode.insertBefore(codeEditorFrameWrap, browser.nextSibling); }
        syncCodeEditorVisibility();
      });
    };
    if (delays[attempt] === 0) { run(); } else { codeEditorRetryTimer = setTimeout(run, delays[attempt]); }
  }

  function startCodeEditorProbe() {
    codeEditorRetryGeneration += 1;
    if (codeEditorRetryTimer) { clearTimeout(codeEditorRetryTimer); codeEditorRetryTimer = null; }
    scheduleCodeEditorProbe(0, codeEditorRetryGeneration);
  }

  function makeTabButton(tab) {
    const btn = el("button", {
      class: `${NS}-tab`, type: "button", role: "tab", "data-vc-tab": tab.id,
      "aria-selected": "false", text: tab.label,
    });
    const dot = el("span", { class: `${NS}-tab-env-dot` });
    dot.style.backgroundColor = envColor();
    btn.appendChild(dot);
    btn.addEventListener("click", () => activateTab(tab.id));
    tabButtons.set(tab.id, btn);
    return btn;
  }

  /* ---- Browser target persistence (namespaced, per env+session) ---- */

  function currentSessionId() {
    // S is the host global state (best-effort); empty string when absent so a
    // fresh install without a session still gets a stable, scoped key.
    return (typeof S !== "undefined" && S?.session?.session_id) || "";
  }

  function persistBrowserTarget(tabId) {
    try {
      localStorage.setItem(
        BROWSER_TARGET_KEY,
        [getEnv(), currentSessionId(), tabId].join("|"),
      );
    } catch {
      // localStorage unavailable (private mode / storage blocked) — the
      // selection simply won't survive a reload; keep going.
    }
  }

  function readPersistedBrowserTarget() {
    try {
      const raw = localStorage.getItem(BROWSER_TARGET_KEY);
      if (!raw) { return null; }
      const [env, sessionId, tabId] = raw.split("|");
      if (env !== getEnv()) { return null; } // never leak across environments
      if (sessionId && sessionId !== currentSessionId()) { return null; } // nor across sessions
      return tabId || null;
    } catch {
      return null;
    }
  }

  /* ---- host workspace active-tab state ----
   * The patched host owns data-active-tab on .rightpanel; the runtime-injected
   * Browser tab does not participate in the host's switcher, so we mirror that
   * state onto the tab buttons (including marking the canonical Files tab
   * active + aria-selected when the panel opens). */

  function getHostActiveTabName() {
    const panel = document.querySelector(".rightpanel");
    return panel?.getAttribute("data-active-tab") || null;
  }

  function syncNativeTabButtons(activeTabName) {
    for (const [name, id] of Object.entries(NATIVE_TAB_IDS)) {
      const tab = document.getElementById(id);
      if (!tab) { continue; }
      const active = name === activeTabName;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    }
    // The injected Browser tab mirrors the host's own 'browser' state.
    if (nativeTab) {
      const active = activeTabName === "browser";
      nativeTab.classList.toggle("active", active);
      nativeTab.setAttribute("aria-selected", active ? "true" : "false");
    }
  }

  /* The host owns the active-tab state (data-active-tab on .rightpanel). Watch
   * it so the Files/Artifacts/Todos/Browser buttons stay in sync even when the
   * panel is opened via the workspace toggle (no tab click). Scoped to the
   * .rightpanel element (and attribute changes) — not an unbounded body
   * observer. */
  function watchNativePanelActiveTab(panel) {
    if (nativePanelObserver || typeof MutationObserver === "undefined") { return; }
    nativePanelObserver = new MutationObserver(() => {
      if (nativePanelSyncBusy) { return; }
      const activeTabName = getHostActiveTabName();
      syncNativeTabButtons(activeTabName);
      // Leaving Browser hides every iframe; leaving Files also hides the host
      // file preview so it cannot remain rendered underneath Artifacts, Todos,
      // Browser, or the dedicated Code Editor tab. The "editor" sentinel is
      // extension-owned — the editor frame visibility is managed by
      // activateCodeEditor/syncCodeEditorVisibility, so the observer must NOT
      // hide it (that would blank the editor right after activation).
      if (activeTabName !== "browser" && activeTabName !== "editor") {
        for (const frame of frames.values()) { if (frame) { frame.hidden = true; } }
      }
      const preview = document.querySelector("#previewArea");
      if (preview) { preview.hidden = activeTabName !== "files" && activeTabName !== "editor"; }
      // The dedicated Code Editor view is extension-owned: it sets the host
      // to a sentinel tab ("editor") on activation, so a non-browser host tab
      // does NOT mean the editor is leaving. Only clear the editor state
      // when the host is genuinely switching back to a host-owned view via
      // user action — the Browser/Files/Artifacts/Todos switch calls reset
      // it through the host's own data-active-tab change. The sentinel is
      // never produced by the host, so it cannot fight a real switch.
      if (activeTabName !== "browser" && activeTabName !== "editor" && !codeEditorFrameWrap?.hidden) {
        codeEditorActive = false;
      }
      syncCodeEditorVisibility();
    });
    nativePanelObserver.observe(panel, {
      attributes: true,
      attributeFilter: ["data-active-tab"],
      childList: true,
      subtree: true,
    });
  }

  function updateEnvDots() {
    const color = envColor();
    const dots = document.querySelectorAll(`.${NS}-tab-env-dot`);
    for (const dot of dots) {
      dot.style.backgroundColor = color;
    }
  }

  /* Quick reachability probe — HEAD via no-cors so cross-origin targets
   * don't need CORS headers; opaque responses still resolve, so this answers
   * "is something listening?" rather than "did it return 200?". The strict
   * variant (code-editor tab) intentionally uses no-cors too: password-gated
   * targets (code-server → 302 /login) never send Access-Control-Allow-Origin,
   * so a CORS-mode HEAD would fail for a service that is actually healthy.
   * 2xx and 3xx both count as reachable — 3xx is how auth-gated apps answer.
   */
  function probeUrl(url, strict = false) {
    try {
      return fetch(url, {
        method: "HEAD",
        mode: "no-cors",
        signal: AbortSignal.timeout(3000),
      }).then(() => true, () => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  function attachFrameLoad(frame) {
    frame.addEventListener("load", () => {
      frame.classList.add(`${NS}-frame-loaded`);
      if (_activeTabId === frame.getAttribute("data-vc-tab-frame")) { updateFrameStatus("ready", "Ready"); }
      refreshFrameLoading();
    }, { once: true });
    frame.addEventListener("error", () => {
      frame.classList.add(`${NS}-frame-error`);
      if (_activeTabId === frame.getAttribute("data-vc-tab-frame")) {
        updateFrameStatus("error", "This target could not load. Check the URL, service, and WebUI frame policy.");
      }
      refreshFrameLoading();
    }, { once: true });
  }

  function ensureFrame(tab) {
    let frame = frames.get(tab.id);
    if (!frame) {
      frame = el("iframe", {
        class: `${NS}-frame`,
        "data-vc-tab-frame": tab.id,
        title: tab.label,
        src: tab.url,
        loading: "lazy",
        // Delegate browser features to the embedded app (Payload/Medusa
        // admins use copy buttons; without this the permissions policy
        // blocks navigator.clipboard.writeText in the frame). Chrome 136+
        // requires an explicit allowlist; use `*` because the frame's final
        // document origin can differ from `src` after redirects (e.g.
        // Payload /admin → login), which breaks the bare-feature ('src')
        // shorthand. See crbug.com/414348233.
        allow: "clipboard-read *; clipboard-write *",
      });
      frames.set(tab.id, frame);
      const targetWrap = tab.id === "frame-editor" && codeEditorFrameWrap ? codeEditorFrameWrap : frameWrap;
      targetWrap.appendChild(frame);
      attachFrameLoad(frame);
      showFrameLoading();
      // Fallback: a blocked/errored frame may never fire `load`; stop
      // the bar after a generous max so it cannot spin forever.
      setTimeout(() => {
        if (!frame.classList.contains(`${NS}-frame-loaded`)) {
          frame.classList.add(`${NS}-frame-loaded`);
          refreshFrameLoading();
        }
      }, 60_000);
    } else if (frame.getAttribute("src") !== tab.url) {
      // Env changed (or config re-resolved): point the kept-alive frame at
      // the new URL and reset its loading state.
      frame.src = tab.url;
      frame.classList.remove(`${NS}-frame-loaded`);
      attachFrameLoad(frame);
      showFrameLoading();
    }
    return frame;
  }

  function _showOffline() {
    if (!offline) { return; }
    const env = getEnv();
    const label = env.charAt(0).toUpperCase() + env.slice(1);
    offlineTitle.textContent = `${label} is not running`;
    offlineCode.textContent = `pnpm vulpy env up ${env}`;
    offline.hidden = false;
  }

  function hideOffline() {
    if (offline) { offline.hidden = true; }
  }

  function showGate(adminUrl) {
    if (!gate) { return; }
    gateLink.setAttribute("href", adminUrl);
    gate.hidden = false;
  }

  function hideGate() {
    if (gate) { gate.hidden = true; }
  }

  /* Probe the tab's target, then show either the iframe (reachable) or the
   * offline placeholder (unreachable). Stale probes (env changed / tab
   * switched while in flight) are ignored.
   *
   * Note: no-cors fetch can be blocked by CSP connect-src even though the
   * iframe itself loads fine (frame-src is a separate directive). Instead of
   * treating a blocked probe as "offline", always show the frame — it will
   * either load (firing attachFrameLoad + hiding the progress bar) or not
   * (the 60s fallback hides the bar anyway). The offline placeholder is still
   * reachable via Re-check for genuine network errors. */
  function probeAndLoad(tab) {
    probeUrl(tab.url).then((ok) => {
      if (_activeTabId !== tab.id) { return; }
      const frame = frames.get(tab.id);
      hideOffline();
      if (frame) {
        // Only reveal the frame if the Browser view is the active panel view.
        // When Files/Artifacts/Todos own the panel we keep frames hidden so
        // they never leak across tabs.
        const nativeBrowserVisible = !(nativeBrowser?.hidden);
        if (nativeBrowserVisible) { frame.hidden = false; }
      }
    });
  }

  function onRetryProbe() {
    const { iframeTabs } = collectTabs();
    const tab = iframeTabs.find((t) => t.id === _activeTabId);
    if (tab?.kind !== "iframe") { return; }
    ensureFrame(tab);
    probeAndLoad(tab);
  }

  function activateTab(tabId, userInitiated) {
    const { iframeTabs } = collectTabs();
    const allTabs = iframeTabs;
    const tab = allTabs.find((t) => t.id === tabId);
    if (!tab) { return; }
    _activeTabId = tabId;

    for (const [id, btn] of tabButtons) {
      btn.setAttribute("aria-selected", id === tabId ? "true" : "false");
      btn.classList.toggle(`${NS}-tab-active`, id === tabId);
    }

    // Hide every existing frame; the active one becomes visible after its
    // reachability probe succeeds (or the gate/placeholder takes over).
    for (const frame of frames.values()) { frame.hidden = true; }
    hideOffline();
    hideGate();

    if (userInitiated) { persistBrowserTarget(tabId); }

    const env = getEnv();
    // Live admin is never iframed: both Medusa admin (production commerce
    // data) and Payload admin (production editorial content) render a
    // confirmation gate that opens an external tab instead.
    const isLiveAdmin = env === "live" && (tab.id === "medusa-admin" || tab.id === "payload-admin");

    if (isLiveAdmin) {
      // Live admin (Medusa/Payload): gate it behind a confirmation that
      // opens an external tab — never an inline iframe.
      showGate(tab.url);
      if (hint) { hint.hidden = true; }
      if (userInitiated) {
        VulpyCommerce.emit("panel:tab", { id: tab.id, kind: tab.kind, url: tab.url });
      }
      return;
    }

    if (tab.kind === "iframe") {
      ensureFrame(tab);
      probeAndLoad(tab);
    }

    // Blank-frame hint only makes sense for external iframe targets.
    if (hint) { hint.hidden = tab.kind !== "iframe"; }

    if (userInitiated) {
      VulpyCommerce.emit("panel:tab", { id: tab.id, kind: tab.kind, url: tab.url });
    }
  }

  function showFrameLoading() {
    if (loadingBar) { loadingBar.hidden = false; }
    updateFrameStatus("loading", "Loading");
  }

  function updateFrameStatus(state, message) {
    if (!frameStatus) { return; }
    frameStatus.dataset.state = state;
    frameStatus.textContent = message;
  }

  function refreshFrameLoading() {
    // Bar stays visible while ANY frame is still loading (load event not
    // fired yet); hidden once every created frame has finished.
    if (!loadingBar) { return; }
    let anyLoading = false;
    for (const frame of frames.values()) {
      if (!frame.classList.contains(`${NS}-frame-loaded`)) { anyLoading = true; break; }
    }
    loadingBar.hidden = !anyLoading;
  }

  function buildEnvPanels() {
    // Offline placeholder — shown when the active env is unreachable.
    offline = el("div", { class: `${NS}-env-offline`, hidden: "" });
    offline.appendChild(el("div", { class: `${NS}-env-offline-icon`, text: "\u26A1" }));
    offlineTitle = el("h3", { class: `${NS}-env-offline-title` });
    offline.appendChild(offlineTitle);
    offline.appendChild(el("p", { class: `${NS}-env-offline-text`, text: "Start it with:" }));
    offlineCode = el("code", { class: `${NS}-env-offline-code` });
    const initialEnv = getEnv();
    offlineTitle.textContent = `${initialEnv.charAt(0).toUpperCase() + initialEnv.slice(1)} is not running`;
    offlineCode.textContent = `pnpm vulpy env up ${initialEnv}`;
    offline.appendChild(offlineCode);
    const retry = el("button", {
      class: `${NS}-env-offline-retry`,
      type: "button",
      text: "Re-check",
    });
    retry.addEventListener("click", onRetryProbe);
    offline.appendChild(retry);
    frameWrap.appendChild(offline);

    // Live admin gate — live Medusa/Payload admin is never iframed.
    gate = el("div", { class: `${NS}-live-admin-gate`, hidden: "" });
    gate.appendChild(el("div", { class: `${NS}-live-admin-icon`, text: "\u26A0\uFE0F" }));
    gate.appendChild(el("h3", { class: `${NS}-live-admin-title`, text: "Live Admin" }));
    gate.appendChild(el("p", {
      class: `${NS}-live-admin-text`,
      text: "Opening the live admin in a new tab. Changes here affect production data.",
    }));
    gateLink = el("a", {
      class: `${NS}-live-admin-link`,
      href: "#",
      target: "_blank",
      rel: "noopener",
      text: "Open Live Admin \u2192",
    });
    gate.appendChild(gateLink);
    frameWrap.appendChild(gate);
  }

  function buildFloatingPanel() {
    const { iframeTabs } = collectTabs();
    const allTabs = iframeTabs;

    root = el("div", { id: `${NS}-root`, "data-vc": "", "data-vc-panel": "" });

    drawer = el("aside", {
      class: `${NS}-drawer`,
      role: "complementary",
      "aria-label": "Vulpy Commerce panel",
      "aria-hidden": "true",
    });

    const title = el("span", { class: `${NS}-title`, text: "Vulpy Commerce" });
    const closeBtn = el("button", {
      class: `${NS}-close`,
      type: "button",
      "data-vc-panel-close": "",
      "aria-label": "Close panel",
      text: "\u00d7",
    });
    closeBtn.addEventListener("click", closePanel);
    const header = el("header", { class: `${NS}-header` }, [title, closeBtn]);

    const nav = el("nav", {
      class: `${NS}-tabs`,
      role: "tablist",
      "aria-label": "Vulpy Commerce panel tabs",
    });
    nav.appendChild(el("div", { class: `${NS}-group-label`, text: "Links" }));
    if (iframeTabs.length > 0) {
      for (const t of iframeTabs) { nav.appendChild(makeTabButton(t)); }
    } else {
      nav.appendChild(
        el("div", {
          class: `${NS}-empty`,
          html: "No app links available. Set <code>VULPY_WEBUI_IFRAMES</code> in <code>environments/hermes/.env</code> to add links.",
        })
      );
    }

    const body = el("div", { class: `${NS}-body` });
    frameWrap = el("div", { class: `${NS}-frame-wrap` });
    loadingBar = el("div", { class: `${NS}-loading`, role: "progressbar", "aria-label": "Loading" });
    loadingBar.hidden = true;
    frameWrap.appendChild(loadingBar);
    frameStatus = el("div", { class: `${NS}-frame-status`, "data-vc-frame-status": "", role: "status", "aria-live": "polite" });
    frameWrap.appendChild(frameStatus);
    buildEnvPanels();
    body.appendChild(frameWrap);
    hint = el("div", {
      class: `${NS}-hint`,
      html: "Blank frame? Add the target origin to <code>HERMES_WEBUI_CSP_FRAME_EXTRA</code> in <code>environments/hermes/.env</code>.",
    });
    hint.hidden = true;
    body.appendChild(hint);

    drawer.appendChild(header);
    drawer.appendChild(nav);
    drawer.appendChild(body);
    root.appendChild(drawer);

    toggle = el("button", {
      id: `${NS}-toggle`,
      class: `${NS}-toggle`,
      type: "button",
      "data-vc-panel-toggle": "",
      "aria-label": "Toggle Vulpy Commerce panel",
      "aria-expanded": "false",
      "aria-controls": `${NS}-root`,
      title: "Vulpy Commerce panel",
    });
    toggle.appendChild(el("span", { class: `${NS}-toggle-badge`, text: "V" }));
    toggle.addEventListener("click", togglePanel);
    root.appendChild(toggle);

    document.body.appendChild(root);

    if (allTabs.length > 0) { activateTab(allTabs[0].id, false); }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closePanel(); }
    });
  }

  /* Recognizable sidebar/panel glyph: a wide content pane + a narrow vertical
   * rail on the RIGHT — the mirror of the host's left-rail sidebar icon so the
   * composer workspace button reads as "right-hand panel". Minimum 18x18
   * rendered size even if the host markup says 14, so it is plainly visible.
   * Marker class lets the re-apply observer (and tests) tell our icon from a
   * host-rendered stock glyph. */
  function makeSidebarIconSvg() {
    return el("svg", {
      class: `${NS}-sidebar-icon`,
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      style: { display: "block" },
    }, [
      el("rect", { x: "3", y: "3", width: "10", height: "18", rx: "1" }),
      el("rect", { x: "15", y: "3", width: "6", height: "18", rx: "1" }),
    ]);
  }

  let composerIconObserver = null;

  function applyComposerWorkspaceIcons() {
    for (const icon of document.querySelectorAll(".composer-workspace-icon")) {
      if (icon.querySelector(`.${NS}-sidebar-icon`)) { continue; }
      // Preserve the host button's aria/title semantics — we only swap the
      // inner glyph, never the button or its labels.
      icon.replaceChildren(makeSidebarIconSvg());
    }
  }

  /* The host owns the composer and can re-render the workspace control at any
   * time (new session, stream turn, layout change), which resets the icon to
   * the stock glyph. Watch the narrow composer root (the workspace group that
   * owns the toggle) rather than the whole document, so any re-inserted icon
   * is re-styled without a body-wide observer. Replacing children triggers
   * another childList record, but applyComposerWorkspaceIcons is a no-op once
   * our marker is present, so this cannot loop. */
  function watchComposerWorkspaceIcons() {
    if (composerIconObserver || typeof MutationObserver === "undefined") { return; }
    const composerRoot =
      document.querySelector("#composerWorkspaceGroup") ||
      document.querySelector(".composer-workspace-group");
    if (!composerRoot) {
      // Fall back to the closest stable ancestor so a re-inserted icon is
      // still caught even if the host renames the group id/class.
      composerIconObserver = new MutationObserver(() => applyComposerWorkspaceIcons());
      composerIconObserver.observe(document.body, { childList: true, subtree: true });
      return;
    }
    composerIconObserver = new MutationObserver(() => applyComposerWorkspaceIcons());
    composerIconObserver.observe(composerRoot, { childList: true, subtree: true });
  }

  function replaceComposerWorkspaceIcon() {
    applyComposerWorkspaceIcons();
    watchComposerWorkspaceIcons();
  }

  /* Mark the active panel view. `active` toggles the Browser wrapper + host
   * views; the tab buttons are re-derived from the host's data-active-tab
   * state (files/artifacts/todos/browser) so the canonical Files tab is
   * correctly highlighted when the panel opens. Never unhides every frame
   * here — the single active frame restore happens in activateTab on re-entry.
   * Wrapped in the sync busy-guard so the host-state observer doesn't fight
   * this (and vice versa). */
  function setNativeTabActive(active) {
    if (!nativePanel) { return; }
    nativePanelSyncBusy = true;
    try {
      const activeTabName = active ? "browser" : getHostActiveTabName() || "files";
      syncNativeTabButtons(activeTabName);
      const files = document.querySelector("#fileTree");
      const artifacts = document.querySelector("#workspaceArtifacts");
      const breadcrumb = document.querySelector("#breadcrumbBar");
      const preview = document.querySelector("#previewArea");
      if (files) { files.hidden = active; }
      if (artifacts) { artifacts.hidden = active; }
      if (breadcrumb) { breadcrumb.hidden = active; }
      if (preview) { preview.hidden = active || activeTabName !== "files"; }
      frameWrap.hidden = !active;
      if (nativeBrowser) { nativeBrowser.hidden = !active; }
      // Hide every iframe while the panel is not showing the Browser view so
      // frames never leak into the Files/Artifacts/Todos panels (or other
      // sessions) as leftover floating content. When entering the Browser
      // view, frames are NOT all re-shown here — activateTab reveals only the
      // active one.
      if (!active) {
        for (const frame of frames.values()) {
          if (frame) { frame.hidden = true; }
        }
      }
    } finally {
      nativePanelSyncBusy = false;
    }
  }

  function refreshNativeFrame() {
    const frame = frames.get(_activeTabId);
    if (!frame) { return; }
    frame.setAttribute("src", frame.getAttribute("src") || "");
    frame.classList.remove(`${NS}-frame-loaded`);
    attachFrameLoad(frame);
    showFrameLoading();
  }

  function buildNativePanel() {
    const panel = document.querySelector(".rightpanel");
    const tabs = panel?.querySelector(".workspace-panel-tabs");
    if (!(panel && tabs) || document.querySelector("[data-vc-native-browser-tab]")) { return; }
    nativePanel = true;
    nativeTab = el("button", { class: "workspace-panel-tab", type: "button", role: "tab", "aria-selected": "false", "aria-label": "Browser", "data-vc-native-browser-tab": "", text: "Browser" });
    nativeTab.addEventListener("click", () => {
      // Leaving the dedicated Code Editor view: reset its state so the
      // Browser view owns the panel again. Without this the editor frame
      // stays visible on top and the host's data-active-tab ("browser")
      // makes this click a no-op — the exact stuck-state this fixes.
      if (codeEditorActive) {
        codeEditorActive = false;
        if (codeEditorFrameWrap) { codeEditorFrameWrap.hidden = true; }
        if (nativeBrowser) { nativeBrowser.hidden = false; }
        if (codeEditorTab) {
          codeEditorTab.classList.remove("active");
          codeEditorTab.setAttribute("aria-selected", "false");
        }
      }
      if (typeof window.switchWorkspacePanelTab === "function") {
        window.switchWorkspacePanelTab("browser");
      }
      setNativeTabActive(true);
      const { iframeTabs } = collectTabs();
      // Re-enter the Browser view with the last selected target (persisted),
      // falling back to the first tab when nothing valid is stored. The probe
      // may have already resolved while the wrapper was hidden — force the
      // active frame visible now that the Browser view owns the panel. Only
      // this one frame is re-shown; every other frame stays hidden.
      const persisted = readPersistedBrowserTarget();
      const target =
        iframeTabs.find((t) => t.id === persisted) || iframeTabs[0];
      if (target) {
        nativeSelect.value = target.id;
        activateTab(target.id, true);
        setNativeTabActive(true);
      }
    });
    tabs.appendChild(nativeTab);
    for (const id of ["workspaceFilesTab", "workspaceArtifactsTab", "workspaceTodosTab"]) {
      document.getElementById(id)?.addEventListener("click", () => {
        setNativeTabActive(false);
        if (typeof window.switchWorkspacePanelTab === "function") {
          window.switchWorkspacePanelTab(id === "workspaceFilesTab" ? "files" : id === "workspaceArtifactsTab" ? "artifacts" : "todos");
        }
      });
    }

    const browser = el("div", { class: `${NS}-native-browser`, "data-vc-browser": "" });
    nativeBrowser = browser;
    const controls = el("div", { class: `${NS}-native-browser-controls`, "data-vc-browser-controls": "" });
    // Compact select wrapper: the bare native <select> is replaced by a
    // styled control with an explicit inline SVG chevron pinned to the right
    // (pointer-events:none so clicks land on the select). No text address bar.
    const selectWrap = el("div", { class: `${NS}-native-browser-select-wrap`, "data-vc-browser-select-wrap": "" });
    nativeSelect = el("select", { class: `${NS}-native-browser-select`, "data-vc-browser-select": "", "aria-label": "Browser target" });
    const iframeTabs = collectTabs().iframeTabs;
    for (const tab of iframeTabs) { nativeSelect.appendChild(el("option", { value: tab.id, text: tab.label })); }
    // Restore a persisted selection if it still exists; otherwise default to
    // the first (Storefront) target.
    const persisted = readPersistedBrowserTarget();
    nativeSelect.value = iframeTabs.find((t) => t.id === persisted) ? persisted : (iframeTabs[0]?.id || "");
    nativeSelect.addEventListener("change", () => activateTab(nativeSelect.value, true));
    selectWrap.appendChild(nativeSelect);
    selectWrap.appendChild(el("svg", {
      class: `${NS}-native-browser-select-chevron`,
      "data-vc-browser-select-chevron": "",
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      style: { display: "block", pointerEvents: "none" },
    }, [
      el("path", { d: "m6 9 6 6 6-6" }),
    ]));
    const refresh = el("button", { class: `${NS}-native-browser-refresh`, type: "button", "data-vc-browser-refresh": "", "aria-label": "Refresh selected browser target", title: "Refresh selected browser target" });
    refresh.appendChild(el("svg", {
      class: `${NS}-native-browser-refresh-icon`,
      "data-vc-browser-refresh-icon": "",
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      style: { display: "block" },
    }, [
      el("path", { d: "M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" }),
    ]));
    refresh.addEventListener("click", refreshNativeFrame);
    controls.append(selectWrap, refresh);
    browser.appendChild(controls);
    frameWrap = el("div", { class: `${NS}-frame-wrap ${NS}-native-frame-wrap` });
    loadingBar = el("div", { class: `${NS}-loading`, role: "progressbar", "aria-label": "Loading" });
    loadingBar.hidden = true;
    frameWrap.appendChild(loadingBar);
    frameStatus = el("div", { class: `${NS}-frame-status`, "data-vc-frame-status": "", role: "status", "aria-live": "polite" });
    frameWrap.appendChild(frameStatus);
    // No Browser preview caption bar — the previous bottom caption overlapped
    // the iframe and is deliberately removed entirely (DOM + CSS).
    buildEnvPanels();
    browser.appendChild(frameWrap);
    // Insert right after the tab strip so the native panel orders it as the
    // fourth view (Files/Artifacts/Todos/Browser) instead of trailing the
    // file preview area, and CSS data-active-tab rules keep it in the flow.
    const breadcrumb = panel.querySelector(".breadcrumb-bar");
    if (breadcrumb) {
      panel.insertBefore(browser, breadcrumb);
    } else {
      panel.appendChild(browser);
    }
    const first = iframeTabs[0];
    if (first) { activateTab(first.id, false); }
    setNativeTabActive(false);
    // Host owns data-active-tab (files/artifacts/todos/browser) — keep the
    // injected tab buttons in sync, including when the panel is opened via the
    // workspace toggle (no tab click), so Files is active + aria-selected=true
    // by default.
    watchNativePanelActiveTab(panel);
    startCodeEditorProbe();
  }

  function setOpen(next) {
    open = next;
    root.setAttribute("data-vc-panel-open", next ? "true" : "false");
    drawer.setAttribute("aria-hidden", next ? "false" : "true");
    toggle.setAttribute("aria-expanded", next ? "true" : "false");
    VulpyCommerce.emit(`panel:${next ? "open" : "close"}`, {});
  }

  function togglePanel() {
    setOpen(!open);
  }

  function closePanel() {
    if (open) { setOpen(false); }
  }

  /* Env switch (dispatched by vulpy-commerce-env-context): re-color the tab
   * dots, re-resolve every frame URL for the new env, then re-probe and
   * re-render the active tab. */
  function handleEnvChanged() {
    if (!built) { return; }
    updateEnvDots();

    const { iframeTabs } = collectTabs();
    for (const tab of iframeTabs) {
      const frame = frames.get(tab.id);
      if (frame && frame.getAttribute("src") !== tab.url) {
        frame.src = tab.url;
        frame.classList.remove(`${NS}-frame-loaded`);
        attachFrameLoad(frame);
      }
    }

    if (_activeTabId) { activateTab(_activeTabId, false); }
  }

  // Build exactly once, no matter which path resolves first: the core
  // `config:loaded` event or our own idempotent loadConfig() call.
  function ensureBuilt() {
    if (built) { return; }
    built = true;
    replaceComposerWorkspaceIcon();
    if (document.querySelector(".rightpanel .workspace-panel-tabs")) {
      buildNativePanel();
    } else {
      buildFloatingPanel();
    }
  }

  VulpyCommerce.on("config:loaded", ensureBuilt);
  document.addEventListener("DOMContentLoaded", () => {
    // RACE FIX: core's DOMContentLoaded handler starts the config fetch and
    // sets configLoaded=true BEFORE this handler runs (core script loads
    // first). Calling loadConfig() here then short-circuits with the
    // STILL-EMPTY config object (Promise.resolve(config) resolves on the
    // microtask queue, ahead of the network response) → ensureBuilt builds
    // the derived fallback tabs and the later config:loaded emit is a no-op
    // (built=true) — so explicit VULPY_WEBUI_IFRAMES entries (e.g. the
    // Editor tab) never appear in the dropdown. Only build directly when the
    // config is already populated; otherwise the config:loaded emit (which
    // fires after the fetch resolves) is the single build trigger.
    VulpyCommerce.loadConfig().then((cfg) => {
      if (cfg && Array.isArray(cfg.iframes) && cfg.iframes.length) {
        ensureBuilt();
      }
    });
  });
  // env-context dispatches this on window (see setSessionEnv), so listen on
  // window — document listeners do not receive window-targeted events.
  window.addEventListener("vulpy-env-changed", handleEnvChanged);
})();
