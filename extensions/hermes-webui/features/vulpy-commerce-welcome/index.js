/* Vulpy Commerce — mission welcome surface (inline, renderer-independent).
 *
 * Renderer-INDEPENDENT first-run welcome. Lives in the `vulpy-commerce`
 * extension entry (NOT `message-renderer.js`), so it works identically under
 * both the native message surface and the public message-renderer plugin.
 *
 * Critical design choice: NO popup, NO position:fixed overlay. The welcome is
 * an INLINE customization of the native empty/new-chat surface — the fox
 * avatar is already rendered there by the message renderer, and we:
 *   1. set window.__hermesAuiSuggestionsProvider (the public hook the
 *      renderer reads) so suggestion clicks send our mission text,
 *   2. inject an inline API-key form + welcome copy into the empty state,
 *   3. keep it entirely inside the chat pane (scrolls with the page).
 *
 * Flow (matches the agreed product spec):
 *   fox appears (already in empty state) → text streams in → form fades in
 *   → chatbox (composer) fades in → on submit, conversation launches
 *   immediately (Mission 0).
 *
 * TWO modes, both fully functional:
 *   1. Vulpy Cloud (default): save key on the "vulpy" provider
 *      (`POST /api/providers`), activate a default Vulpy model.
 *   2. Any provider: save an OpenAI-compatible custom provider
 *      (`POST /api/settings/custom-providers/save`), test connectivity,
 *      activate a chosen default model.
 *
 * Both modes: complete onboarding (`POST /api/onboarding/complete`),
 * provision the 9 pinned mission chats, then open Mission 0.
 */
(() => {
  if (!window.VulpyCommerce) { return; }
  const VC = window.VulpyCommerce;

  const $ = (sel, root) => (root || document).querySelector(sel);
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }
  const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const VULPY_DEFAULT_MODEL = "vulpy-default";
  const _TYPING_MS = 26;

  let injected = false;
  let onboardedFlag = false;
  let attempts = 0; // injection retry counter (empty surface may render late)

  // ── Onboarding state (localStorage — survives reload, idempotent) ────
  function setOnboarded() {
    onboardedFlag = true;
    try {
      localStorage.setItem("vulpy.onboarding.done", "1");
      localStorage.setItem("vulpy.missions.provisioned", "1");
    } catch (_e) { /* non-fatal */ }
  }
  function onboarded() {
    if (onboardedFlag) { return true; }
    try {
      return localStorage.getItem("vulpy.onboarding.done") === "1" ||
             localStorage.getItem("vulpy.missions.provisioned") === "1";
    } catch (_e) { return false; }
  }

  // ── Provisioning: handled by the server-side boot/install hook ────────
  // Mission chats are created by `extensions/hermes-webui/scripts/
  // provision-missions.py`, run at Hermes container start (entrypoint item
  // 8a') and at install. Idempotent: existing missions are skipped. The
  // browser does NOT create them (no server endpoint for pinned+titled
  // sessions; `POST /api/session/new` ignores title/pinned and would only
  // create ghost "Untitled" sessions). Onboarding just completes; the
  // missions are already (or will be) provisioned.

  async function finishOnboarding() {
    setOnboarded();
    // Launch conversation immediately (Mission 0). The provisioner pinned the
    // 9 mission chats (Mission 0: Hello … Mission 8); find Mission 0's id and
    // set it as the restored session so the reload lands IN that chat instead
    // of the empty welcome surface.
    try {
      const r = await fetch("/api/sessions?limit=50");
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        const rows = j?.sessions || j?.docs || j || [];
        const m0 = rows.find((s) => {
          const t = String(s?.title || s?.session?.title || "");
          return t.startsWith("Mission 0") || t === "0 · Hello" || /mission-0/i.test(String(s?.id || ""));
        });
        const sid = m0?.id || m0?.session_id || m0?.session?.id || m0?.session?.session_id;
        if (sid) {
          try { localStorage.setItem("hermes-webui-session", String(sid)); } catch (_e) { /* non-fatal */ }
        }
      }
    } catch (_e) { /* non-fatal: fall through to the plain reload */ }
    try { window.location.href = "/"; } catch (_e) { /* non-fatal */ }
  }

  // ── Welcome copy (final) ─────────────────────────────────────────────
  // Message: show the Vulpy Cloud benefits — one key, the right model for
  // each task, predictable pricing — aligned with the /cloud/ page copy.
  // Be clear it works with any provider; core stays open. Calm, reassuring,
  // action verbs.
  const VULPY_SIGNUP_URL = "https://billing.vulpy.io";
  const TITLE = "Hi. I'm Vulpy, aka Fox in the Box. I'll help you build your store.";
  const BODY_LINES = [
    "To get started, I need a model connected. The easiest is Vulpy Cloud: one API key, the right model for each task — writing, coding, vision, reasoning, search — and predictable pricing per million tokens. No guessing which model fits which job. And when the store needs more than one operator, the Multi-Agent Pack adds specialist agents and approval chains.",
    "Bring your own model, too. Any provider works: System → Providers → Add provider (name, base URL, API key, models), then pick your default in Preferences.",
    "Either way it's open source. The whole store builds from prompts, no code.",
  ];
  const FORM_LABEL = "Vulpy Cloud API key (sk-…)";
  const FORM_SUBMIT = "Dive in";
  const SIGNUP_LINK_TEXT = "Need a key? Sign up for Vulpy Cloud";
  const SUGGESTIONS = [
    { text: "Mission 0: Hello — let's get to know each other", icon: "🦊" },
    { text: "Mission 1: Find your voice", icon: "🎙️" },
    { text: "Mission 2: Set the mood", icon: "🎨" },
    { text: "Mission 3: Design the storefront", icon: "🖼️" },
  ];

  // ── Inline API-key form (injected into the empty state) ──────────────
  function buildForm() {
    const wrap = el("div", "vulpy-welcome-form-wrap");

    const form = el("form", "vulpy-welcome-form");
    const label = el("label", "vulpy-welcome-label", FORM_LABEL);
    const input = el("input", "vulpy-welcome-input");
    input.type = "password";
    input.placeholder = "Vulpy Cloud API key (sk-…)";
    input.autocomplete = "off";
    input.spellcheck = false;
    const button = el("button", "vulpy-welcome-submit", FORM_SUBMIT);
    button.type = "submit";
    const error = el("div", "vulpy-welcome-error");
    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(button);
    form.appendChild(error);
    wrap.appendChild(form);

    // ── Mode 1: Vulpy Cloud ────────────────────────────────────────────
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const key = input.value.trim();
      if (!key) { input.focus(); input.setAttribute("aria-invalid", "true"); return; }
      error.textContent = "";
      button.disabled = true;
      button.textContent = "Connecting…";
      try {
        const res = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "vulpy", api_key: key }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          error.textContent = (data?.error) || "Couldn't connect to Vulpy Cloud. Please try again.";
          button.disabled = false;
          button.textContent = "Dive in";
          return;
        }
        try {
          await fetch("/api/model/set", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope: "main", task: "main", provider: "vulpy", model: VULPY_DEFAULT_MODEL }),
          });
        } catch (_e) { /* non-fatal */ }
        try { await fetch("/api/onboarding/complete", { method: "POST" }); } catch (_e) { /* non-fatal */ }
        await finishOnboarding();
      } catch (_e) {
        error.textContent = "Network error. Please try again.";
        button.disabled = false;
        button.textContent = "Dive in";
      }
    });

    return wrap;
  }

  // ── Renderer mount detection ──────────────────────────────────────────
  // The message-renderer extension (island) is DISABLED by default since
  // 2026-08-26 (manifest flag + runtime override). Everything here must work
  // WITHOUT it; where the island IS enabled we keep the legacy paths.
  //
  // Mount evidence = observable side effects of message-renderer.js having
  // actually mounted its pane (NOT window.__HERMES_AUI_* — those are config
  // inputs anyone can set):
  //   - #hermesAssistantUiStyles: <style> the island injects into <head>.
  //   - [data-hermes-assistant-ui-layout]: wrapper div it inserts around the
  //     host transcript.
  //   - window.__hermesAuiPaneOnly === true: pane-only mode flag it sets.
  function rendererMounted() {
    try {
      if (document.getElementById("hermesAssistantUiStyles")) { return true; }
      if (document.querySelector("[data-hermes-assistant-ui-layout]")) { return true; }
      return window.__hermesAuiPaneOnly === true;
    } catch (_e) { return false; }
  }

  // ── Register the suggestions provider (public renderer hook) ────────
  function registerSuggestions() {
    try {
      // The renderer reads globalThis.__hermesAuiSuggestionsProvider on mount.
      // Provide our mission suggestions ONLY when onboarding is not done;
      // otherwise return null so the renderer keeps its defaults.
      globalThis.__hermesAuiSuggestionsProvider = () =>
        onboarded() ? null : SUGGESTIONS;
    } catch (_e) { /* non-fatal */ }
  }

  // ── Mission suggestions for the native empty state ───────────────────
  // Native surface parity: with the renderer off, the empty state shows the
  // host's stock tiles (index.html .suggestion[data-msg]); boot.js wires
  // clicks to `$('msg').value=btn.dataset.msg; send();`. We mirror that
  // wiring ourselves and swap the stock copy for the mission list so the
  // missions stay reachable from the welcome — no renderer hook required.
  function nativeSuggestionButton(item) {
    const btn = el("button", "suggestion");
    btn.type = "button";
    btn.dataset.msg = item.text;
    const icon = el("span", null, item.icon || "");
    icon.setAttribute("aria-hidden", "true");
    const label = el("span", null, item.text);
    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      try {
        const composer = document.getElementById("msg");
        if (composer) { composer.value = item.text; }
        if (typeof globalThis.send === "function") {
          globalThis.send();
        } else if (composer) {
          composer.focus();
        }
      } catch (_e) { /* non-fatal */ }
    });
    return btn;
  }

  function wireNativeSuggestions(empty) {
    const grid = $(".suggestion-grid", empty);
    if (!grid) { return; }
    if (onboarded() && !welcomeForcedByUrl()) { return; }
    grid.textContent = "";
    for (const item of SUGGESTIONS) {
      grid.appendChild(nativeSuggestionButton(item));
    }
  }

  // ── Inject the form + copy into the empty state (native-first) ────────
  function injectIntoEmptyState() {
    // With ?welcome=1 we force the welcome even if onboarding is done.
    if (injected) { return; }
    if (onboarded() && !welcomeForcedByUrl()) { return; }
    // Native-first: when the message-renderer island is NOT mounted, the
    // island markup never appears and injecting must target #emptyState —
    // the old dual-render querySelector also matched stale/leftover island
    // DOM by document order. Only when the island IS mounted do we adopt
    // its `.hermes-empty-state` surface.
    let empty = null;
    let isNative = true;
    if (rendererMounted()) {
      empty = document.querySelector(".hermes-empty-state, #emptyState");
      isNative = !!empty && empty.id === "emptyState";
    } else {
      empty = $("#emptyState");
      isNative = true;
    }
    if (!empty) {
      // The empty surface may render after we start (fresh boot is async).
      // Retry until it appears (up to ~4s), so ?welcome=1 reliably injects.
      attempts += 1;
      if (attempts <= 20) { setTimeout(injectIntoEmptyState, 200); }
      return;
    }

    // (Formatting: the host constrains `.empty-state p` to 320px + muted; the
    // welcome copy is longer, so widen the injected subtitle paragraphs and
    // keep the signup link in the page's text colour (dark). The subtitle
    // element carries vulpy-welcome-subtitle so these scoped overrides win
    // over the host's `.empty-state p` specificity.)
    const welcomeCss = document.createElement("style");
    welcomeCss.textContent =
      ".empty-state .vulpy-welcome-subtitle{max-width:640px;}" +
      ".empty-state .vulpy-welcome-subtitle p{max-width:640px;color:inherit;}" +
      ".empty-state .vulpy-welcome-subtitle a{color:inherit;text-decoration:underline;}";
    (document.head || document.documentElement).appendChild(welcomeCss);

    // Title + subtitle selectors per surface.
    // Native: `h2[data-i18n=empty_title]` / `p[data-i18n=empty_subtitle]`
    // (no class names). Renderer: `.hermes-empty-title` / `.hermes-empty-subtitle`.
    const titleSel = isNative ? "h2[data-i18n=empty_title], .main-view-empty-title" : ".hermes-empty-title";
    const subSel = isNative ? "p[data-i18n=empty_subtitle], .main-view-empty-sub" : ".hermes-empty-subtitle";
    const gridSel = isNative ? ".suggestion-grid" : ".hermes-suggestion-grid";

    const title = $(titleSel, empty);
    if (title) { title.textContent = TITLE; }
    const subtitle = $(subSel, empty);
    if (subtitle) {
      subtitle.classList.add("vulpy-welcome-subtitle");
      subtitle.textContent = "";
      for (let i = 0; i < BODY_LINES.length; i++) {
        const p = document.createElement("p");
        p.className = "vulpy-welcome-body-line";
        p.textContent = BODY_LINES[i];
        subtitle.appendChild(p);

        // Insert the signup link after the first body line (the Cloud pitch).
        if (i === 0) {
          const signup = document.createElement("a");
          signup.className = "vulpy-welcome-signup";
          signup.href = VULPY_SIGNUP_URL;
          signup.target = "_blank";
          signup.rel = "noopener noreferrer";
          signup.textContent = SIGNUP_LINK_TEXT;
          subtitle.appendChild(signup);
        }
      }
    }

    const grid = gridSel ? $(gridSel, empty) : null;
    // Native surface: swap the stock tiles for mission routing (renderer
    // parity — see wireNativeSuggestions comment). Island path keeps the
    // renderer's own grid + provider hook.
    if (isNative) {
      wireNativeSuggestions(empty);
    }
    const wrap = buildForm();
    if (grid?.parentNode) {
      grid.parentNode.insertBefore(wrap, grid);
    } else {
      empty.appendChild(wrap);
    }

    // Fade in: fox already visible → text (covered by title) → form → chatbox.
    requestAnimationFrame(() => {
      wrap.classList.add("vulpy-welcome-visible");
      // Chatbox (composer) is behind the pane — nothing to fade; the form
      // appearing inline with the composer visible satisfies the sequence.
    });

    injected = true;
  }

  // ── Wire ──────────────────────────────────────────────────────────────
  // URL param: ?welcome=1 always shows the welcome surface (instead of the
  // new-chat window / restored session), regardless of onboarding state.
  // Used for demos, setup flows, and revisiting the onboarding.
  //
  // This runs in the workspace-synced overlay/extension layer (durable across
  // image rebuilds) — NOT in baked host boot.js. To win against the host's
  // session restore (boot.js loadSession(savedLocal)), we clear the saved
  // session and dispatch the host's "new chat" action so it boots fresh to
  // the empty state; the renderer + suggestions render the welcome there.
  function welcomeForcedByUrl() {
    try {
      return new URLSearchParams(window.location.search).get("welcome") === "1";
    } catch (_e) { return false; }
  }

  function forceFreshBoot() {
    try {
      // Clear the persisted session so the host won't restore it on reload.
      localStorage.removeItem("hermes-webui-session");
      // If a new-chat dispatcher exists, use it (host-native fresh boot).
      if (typeof globalThis.newSession === "function") {
        globalThis.newSession();
        return;
      }
      // Fallbacks: session list new-chat, or a location hash/param the host
      // honors for a fresh surface.
      if (typeof globalThis.newChat === "function") { globalThis.newChat(); return; }
      // Last resort: hard reload without the saved session.
      window.location.reload();
    } catch (_e) { /* non-fatal */ }
  }

  // Skeleton recovery is fixed at the source in the renderer
  // (message-renderer-island.tsx): failed/hung first fetches now clear the
  // skeleton via a hard deadline, so the empty-state welcome always appears.

  VC.on("config:loaded", () => {
    registerSuggestions();
    if (welcomeForcedByUrl()) {
      // Force the welcome surface on ?welcome=1 even if onboarding is done.
      // Create a fresh empty session (so #emptyState exists) AND inject the
      // welcome copy+form into it. If #emptyState isn't mounted yet, the
      // session:loaded handler retries.
      forceFreshBoot();
      setTimeout(injectIntoEmptyState, 600);
    } else if (!onboarded()) {
      setTimeout(injectIntoEmptyState, 400);
    }
  });
  VC.on("session:loaded", () => {
    if (!onboarded() || welcomeForcedByUrl()) {
      setTimeout(injectIntoEmptyState, 400);
    }
  });

  console.info("[vulpy-commerce] welcome surface (inline) registered");
})();