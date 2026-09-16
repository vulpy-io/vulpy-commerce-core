// @vitest-environment jsdom
/**
 * Tests for env-aware iframes in vulpy-commerce-side-panel.
 *
 * Coverage:
 *   - URL resolution from session env (getSessionEnv)
 *   - Fallback to port derivation when config.envs is missing
 *   - Full env URLs when config.envs is present
 *   - Env dot on each tab
 *   - Offline placeholder when env is unreachable
 *   - Retry button re-probes and loads iframe on success
 *   - Live admin gate (external link, not iframe)
 *   - Tab URL update on vulpy-env-changed event
 *   - Backward compatibility with old config (no envs field)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION_PATH = join(
  import.meta.dirname,
  "..",
  "features",
  "vulpy-commerce-side-panel",
  "index.js",
);

const CSS_PATH = join(
  import.meta.dirname,
  "..",
  "features",
  "vulpy-commerce-side-panel",
  "index.css",
);

function loadExtension() {
  const code = readFileSync(EXTENSION_PATH, "utf-8");
  new Function(code)();
}

describe("side-panel env-aware iframes", () => {
  let mockEmit: ReturnType<typeof vi.fn>;
  let mockOn: ReturnType<typeof vi.fn>;
  let eventHandlers: Map<string, Array<(...args: unknown[]) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    eventHandlers = new Map();

    mockEmit = vi.fn();
    mockOn = vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) { eventHandlers.set(event, []); }
      eventHandlers.get(event)!.push(fn);
    });

    // Stub VulpyCommerce core
    (globalThis as Record<string, unknown>).VulpyCommerce = {
      register: vi.fn(),
      on: mockOn,
      emit: mockEmit,
      getConfig: () => ({ shopPort: 3000, apiPort: 9000 }),
      loadConfig: () => Promise.resolve({ shopPort: 3000, apiPort: 9000 }),
      getSessionEnv: () => "dev",
      setSessionEnv: vi.fn(),
      ENV_COLORS: { dev: "#3b82f6", staging: "#f59e0b", live: "#ef4444" },
      ENV_LABELS: { dev: "DEV", staging: "STAGING", live: "LIVE" },
    };

    // Stub S (WebUI global state)
    (globalThis as Record<string, unknown>).S = {
      session: { session_id: "test-session-123" },
    };

    // Stub fetch for offline probes — default: all reachable
    fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    // Stub timers deterministically so the editor availability retry loop
    // (probe → backoff → re-probe) advances instead of waiting on wall time.
    vi.useFakeTimers();

    // Set location to loopback for predictable URL derivation
    Object.defineProperty(window, "location", {
      value: { protocol: "http:", hostname: "127.0.0.1", host: "127.0.0.1:8787" },
      writable: true,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.useRealTimers();
    (globalThis as Record<string, unknown>).VulpyCommerce = undefined;
    (globalThis as Record<string, unknown>).S = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function triggerConfigLoaded() {
    const handlers = eventHandlers.get("config:loaded");
    if (handlers) {
      for (const h of handlers) { h({}); }
    }
  }

  function buildPanel() {
    loadExtension();
    triggerConfigLoaded();
  }

  function buildNativeWorkspacePanel() {
    document.body.innerHTML = `
      <main class="layout">
        <div class="composer-workspace-group" id="composerWorkspaceGroup">
          <button class="composer-workspace-files-btn" id="btnWorkspacePanelToggle" title="Show workspace panel" aria-label="Toggle workspace files panel">
            <span class="composer-workspace-icon"><svg><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
          </button>
        </div>
      </main>
      <aside class="rightpanel" data-active-tab="files">
        <div class="workspace-panel-tabs" role="tablist">
          <button class="workspace-panel-tab" id="workspaceFilesTab" role="tab">Files</button>
          <button class="workspace-panel-tab" id="workspaceArtifactsTab" role="tab">Artifacts</button>
          <button class="workspace-panel-tab" id="workspaceTodosTab" role="tab">Todos</button>
        </div>
        <div class="file-tree" id="fileTree"></div>
        <div class="workspace-artifacts" id="workspaceArtifacts"></div>
        <div class="workspace-todos" id="workspaceTodos"></div>
      </aside>`;

    // Mimic the patched host switcher: it owns data-active-tab + native view
    // visibility, but — like the live regression — it does NOT mark the tab
    // buttons active when the panel opens via the workspace toggle. The
    // extension's host-state sync is what marks the buttons.
    (window as any).switchWorkspacePanelTab = (tab: string) => {
      (window as any)._workspacePanelActiveTab = tab;
      const panel = document.querySelector(".rightpanel");
      panel?.setAttribute("data-active-tab", tab);
      const views: Record<string, string> = {
        files: "fileTree",
        artifacts: "workspaceArtifacts",
        todos: "workspaceTodos",
      };
      for (const [name, id] of Object.entries(views)) {
        const view = document.getElementById(id);
        if (view) { (view as HTMLElement).hidden = tab !== name; }
      }
    };
    buildPanel();
  }

  describe("native workspace panel integration", () => {
    it("keeps Files as the only selected native tab while Browser and editor are available", async () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getConfig = () => ({
        iframes: [{ id: "editor", label: "Code Editor", url: "http://127.0.0.1:8080" }],
      });
      buildNativeWorkspacePanel();

      await vi.waitFor(() => {
        expect(document.querySelector("[data-vc-native-code-editor-tab]")).not.toBeNull();
      });
      const selected = document.querySelectorAll('[aria-selected="true"]');
      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe("workspaceFilesTab");
      expect(document.querySelector("[data-vc-native-browser-tab]")?.classList.contains("active")).toBe(false);
      expect(document.querySelector("[data-vc-native-code-editor-tab]")?.classList.contains("active")).toBe(false);
    });

    it("does not show an editor tab while the probe fails the network request, and shows it once reachable", async () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getConfig = () => ({
        iframes: [{ id: "editor", label: "Code Editor", url: "http://127.0.0.1:8080" }],
      });
      // no-cors HEAD to a non-CORS endpoint returns an opaque response whose
      // status is masked to 0 — the probe cannot (and must not) judge health
      // from status. Only a rejected/errored request counts as unreachable.
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      buildNativeWorkspacePanel();

      // Probe failing at the network level: the tab must stay hidden (retry loop), not appear disabled.
      await vi.waitFor(() => {
        expect(document.querySelector("[data-vc-native-code-editor-tab]")).toBeNull();
      });

      // Probe reachable now: the tab appears (and is not disabled).
      fetchMock.mockResolvedValue(new Response("", { status: 200 }));
      // Advance the retry loop's backoff so the next probe actually fires.
      await vi.advanceTimersByTimeAsync(100);
      await vi.waitFor(() => {
        const editor = document.querySelector("[data-vc-native-code-editor-tab]") as HTMLButtonElement;
        expect(editor).not.toBeNull();
        expect(editor.disabled).toBe(false);
        expect(editor.getAttribute("aria-label")).toBe("Code Editor");
        expect(editor.textContent).toContain("Code Editor");
      });
    });

    it("shows the editor tab when the endpoint answers with a redirect (auth-gated code-server)", async () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getConfig = () => ({
        iframes: [{ id: "editor", label: "Code Editor", url: "http://127.0.0.1:8080" }],
      });
      // Real code-server behind a password gate answers 302 → /login with no
      // CORS headers. The strict probe must still treat it as reachable.
      fetchMock.mockResolvedValue(new Response("", { status: 302, headers: { Location: "/login" } }));
      buildNativeWorkspacePanel();

      await vi.waitFor(() => {
        const editor = document.querySelector("[data-vc-native-code-editor-tab]") as HTMLButtonElement;
        expect(editor).not.toBeNull();
        expect(editor.disabled).toBe(false);
      });
    });

    it("keeps Code Editor and Browser mutually exclusive (no stuck double-active, Browser clickable)", async () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getConfig = () => ({
        iframes: [{ id: "editor", label: "Code Editor", url: "http://127.0.0.1:8080" }],
      });
      fetchMock.mockResolvedValue(new Response("", { status: 200 }));
      buildNativeWorkspacePanel();

      // Editor probe resolves → tab appears.
      await vi.waitFor(() => {
        const editor = document.querySelector("[data-vc-native-code-editor-tab]") as HTMLButtonElement;
        expect(editor).not.toBeNull();
      });

      const editor = document.querySelector("[data-vc-native-code-editor-tab]") as HTMLButtonElement;
      const browser = document.querySelector("[data-vc-native-browser-tab]") as HTMLButtonElement;

      // 1) Activate Code Editor: only the editor may be active, and the Files
      //    view must NOT be rendered (the earlier regression opened Files).
      editor.click();
      expect(editor.classList.contains("active")).toBe(true);
      expect(browser.classList.contains("active")).toBe(false);
      expect(editor.getAttribute("aria-selected")).toBe("true");
      expect(browser.getAttribute("aria-selected")).toBe("false");
      expect(document.querySelector(".rightpanel")?.getAttribute("data-active-tab")).toBe("editor");
      expect((document.getElementById("fileTree") as HTMLElement).hidden).toBe(true);
      // The editor frame must be VISIBLE (not re-hidden by the host-state
      // observer after activation) and sized — the empty-tab regression.
      const editorFrame = document.querySelector('[data-vc-code-editor] iframe') as HTMLIFrameElement;
      expect(editorFrame).not.toBeNull();
      expect(editorFrame.hidden).toBe(false);
      expect((document.querySelector("[data-vc-code-editor]") as HTMLElement).hidden).toBe(false);

      // 2) Activate Browser: must work immediately (no stuck state), and only
      //    the browser may be active afterwards.
      browser.click();
      expect(browser.classList.contains("active")).toBe(true);
      expect(editor.classList.contains("active")).toBe(false);
      expect(browser.getAttribute("aria-selected")).toBe("true");
      expect(editor.getAttribute("aria-selected")).toBe("false");

      // 3) Round-trip back to the editor — still mutually exclusive.
      editor.click();
      expect(editor.classList.contains("active")).toBe(true);
      expect(browser.classList.contains("active")).toBe(false);
    });

    it("reports iframe loading, ready, and navigation error states", async () => {
      buildNativeWorkspacePanel();
      const browserTab = document.querySelector("[data-vc-native-browser-tab]") as HTMLButtonElement;
      browserTab.click();
      const frame = document.querySelector('[data-vc-tab-frame="storefront"]') as HTMLIFrameElement;
      const status = document.querySelector("[data-vc-frame-status]") as HTMLElement;
      expect(status.dataset.state).toBe("loading");

      frame.dispatchEvent(new Event("load"));
      expect(status.dataset.state).toBe("ready");
      expect(status.textContent).toContain("Ready");

      frame.dispatchEvent(new Event("error"));
      expect(status.dataset.state).toBe("error");
      expect(status.textContent).toContain("could not load");
    });
    it("adds an accessible Browser tab without replacing native tabs", () => {
      buildNativeWorkspacePanel();
      expect(document.querySelector("#workspaceFilesTab")).not.toBeNull();
      expect(document.querySelector("#workspaceArtifactsTab")).not.toBeNull();
      const browserTab = document.querySelector("[data-vc-native-browser-tab]") as HTMLButtonElement;
      expect(browserTab).not.toBeNull();
      expect(browserTab.getAttribute("role")).toBe("tab");
      expect(browserTab.getAttribute("aria-label")).toBe("Browser");
      expect(document.querySelector("[data-vc-panel=\"\"]")).toBeNull();
    });

    it("switches targets from the compact select and keeps the selected frame lazy", async () => {
      buildNativeWorkspacePanel();
      const tab = document.querySelector("[data-vc-native-browser-tab]") as HTMLButtonElement;
      tab.click();
      const select = document.querySelector("[data-vc-browser-select]") as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.querySelectorAll("option").length).toBeGreaterThanOrEqual(3);
      expect(document.querySelectorAll("[data-vc-tab-frame]").length).toBe(1);
      select.value = "medusa-admin";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.waitFor(() => {
        expect(document.querySelector('[data-vc-tab-frame="medusa-admin"]')).not.toBeNull();
      });
    });

    it("wraps the select in a compact control with a visible inline chevron", () => {
      buildNativeWorkspacePanel();
      const tab = document.querySelector("[data-vc-native-browser-tab]") as HTMLButtonElement;
      tab.click();
      const wrap = document.querySelector("[data-vc-browser-select-wrap]") as HTMLElement;
      expect(wrap).not.toBeNull();
      const select = wrap.querySelector("select[data-vc-browser-select]") as HTMLSelectElement;
      expect(select).not.toBeNull();
      // No raw text address bar anywhere in the Browser controls.
      const controls = document.querySelector("[data-vc-browser-controls]") as HTMLElement;
      expect(controls.querySelector("input")).toBeNull();
      // Inline chevron SVG pinned to the right of the select, non-interactive.
      const chevron = wrap.querySelector("svg[data-vc-browser-select-chevron]") as SVGElement;
      expect(chevron).not.toBeNull();
      expect(chevron.getAttribute("aria-hidden")).toBe("true");
      // pointer-events none (inline + CSS) so clicks pass through to the select.
      expect(chevron.style.pointerEvents).toBe("none");
      // The chevron is a block-level, explicitly sized inline SVG (visible).
      expect(chevron.style.display).toBe("block");
      expect(Number(chevron.getAttribute("width"))).toBeGreaterThanOrEqual(14);
      expect(Number(chevron.getAttribute("height"))).toBeGreaterThanOrEqual(14);
      expect(chevron.querySelector("path")).not.toBeNull();
    });

    it("refreshes the selected target, exposes accessible labels, and renders a visible inline rotate SVG", () => {
      buildNativeWorkspacePanel();
      const tab = document.querySelector("[data-vc-native-browser-tab]") as HTMLButtonElement;
      tab.click();
      const frame = document.querySelector('[data-vc-tab-frame="storefront"]') as HTMLIFrameElement;
      const initialSrc = frame.src;
      const refresh = document.querySelector("[data-vc-browser-refresh]") as HTMLButtonElement;
      expect(refresh.getAttribute("aria-label")).toContain("Refresh");
      const refreshSvg = refresh.querySelector("svg[data-vc-browser-refresh-icon]") as SVGElement;
      expect(refreshSvg).not.toBeNull();
      // Rotate-cw path is present and the SVG is block-displayed (visible).
      const path = refreshSvg.querySelector("path");
      expect(path?.getAttribute("d")).toContain("M20 11");
      expect(refreshSvg.style.display || window.getComputedStyle(refreshSvg).display).toBe("block");
      expect(Number(refreshSvg.getAttribute("width"))).toBeGreaterThanOrEqual(16);
      expect(Number(refreshSvg.getAttribute("height"))).toBeGreaterThanOrEqual(16);
      expect(refreshSvg.getAttribute("aria-hidden")).toBe("true");
      refresh.click();
      expect(frame.src).toBe(initialSrc);
      triggerConfigLoaded();
      expect(document.querySelectorAll("[data-vc-native-browser-tab]")).toHaveLength(1);
      expect(document.querySelectorAll("[data-vc-browser-select]")).toHaveLength(1);
    });

    it("hides the entire Browser wrapper on native tabs and restores only the single active frame on Browser", async () => {
      buildNativeWorkspacePanel();
      const browserTab = document.querySelector("[data-vc-native-browser-tab]") as HTMLButtonElement;
      const filesTab = document.querySelector("#workspaceFilesTab") as HTMLButtonElement;
      const browserWrapper = document.querySelector("[data-vc-browser]") as HTMLElement;
      const select = document.querySelector("[data-vc-browser-select]") as HTMLSelectElement;
      const refresh = document.querySelector("[data-vc-browser-refresh]") as HTMLButtonElement;

      browserTab.click();
      expect(browserWrapper.hidden).toBe(false);
      expect(select.hidden).toBe(false);
      expect(refresh.hidden).toBe(false);
      // The storefront iframe is lazy: after Browser activation at least one
      // frame exists and the active one becomes visible once the reachability
      // probe resolves (async).
      {
        const frames = [...document.querySelectorAll("[data-vc-tab-frame]")];
        expect(frames.length).toBeGreaterThanOrEqual(1);
        await vi.waitFor(() => {
          for (const frame of frames) {
            expect((frame as HTMLElement).hidden).toBe(false);
          }
        });
      }

      filesTab.click();
      expect(browserWrapper.hidden).toBe(true);
      expect(select.hidden).toBe(false);
      expect(refresh.hidden).toBe(false);
      // Frames are hidden when the panel shows Files so they cannot leak.
      for (const frame of document.querySelectorAll("[data-vc-tab-frame]")) {
        expect((frame as HTMLElement).hidden).toBe(true);
      }

      browserTab.click();
      expect(browserWrapper.hidden).toBe(false);
      // Only the active (selected) frame is re-shown — every other created
      // frame stays hidden (one-frame-only restore, no side-by-side iframes).
      await vi.waitFor(() => {
        const frames = [...document.querySelectorAll("[data-vc-tab-frame]")] as HTMLElement[];
        expect(frames.length).toBeGreaterThanOrEqual(1);
        const visible = frames.filter((frame) => !frame.hidden);
        expect(visible.length).toBe(1);
        expect(visible[0].getAttribute("data-vc-tab-frame")).toBe(select.value);
      });

      // Re-selecting Files hides the browser wrapper (no double-active).
      filesTab.click();
      expect(browserWrapper.hidden).toBe(true);
      for (const frame of document.querySelectorAll("[data-vc-tab-frame]")) {
        expect((frame as HTMLElement).hidden).toBe(true);
      }
    });

    it("marks the native Files tab active and aria-selected=true when the workspace panel opens or is first built", () => {
      buildNativeWorkspacePanel();
      const filesTab = document.querySelector("#workspaceFilesTab") as HTMLButtonElement;
      const artifactsTab = document.querySelector("#workspaceArtifactsTab") as HTMLButtonElement;
      const browserTab = document.querySelector("[data-vc-native-browser-tab]") as HTMLButtonElement;
      // Default host state (data-active-tab=files) → Files marked active.
      expect(filesTab.classList.contains("active")).toBe(true);
      expect(filesTab.getAttribute("aria-selected")).toBe("true");
      expect(artifactsTab.classList.contains("active")).toBe(false);
      expect(artifactsTab.getAttribute("aria-selected")).toBe("false");
      expect(browserTab.classList.contains("active")).toBe(false);

      // Opening the workspace panel via the toggle (no click on a tab) keeps
      // Files authoritative — the extension re-applies it from host state.
      document.querySelector("#btnWorkspacePanelToggle")?.dispatchEvent(
        new Event("click", { bubbles: true }),
      );
      expect(filesTab.classList.contains("active")).toBe(true);
      expect(filesTab.getAttribute("aria-selected")).toBe("true");
    });

    it("preserves a valid persisted Browser target across leaving and re-entering the Browser view", async () => {
      buildNativeWorkspacePanel();
      const browserTab = document.querySelector("[data-vc-native-browser-tab]") as HTMLButtonElement;
      browserTab.click();
      const select = document.querySelector("[data-vc-browser-select]") as HTMLSelectElement;
      select.value = "payload-admin";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      expect(select.value).toBe("payload-admin");
      // Persisted to the namespaced localStorage key (set by activateTab).
      expect(
        (localStorage.getItem("vc:side-panel:browser:target") || "").split("|").at(-1),
      ).toBe("payload-admin");

      // Browser → Files → Browser: selection and single-frame restore survive.
      document.querySelector("#workspaceFilesTab")?.dispatchEvent(new Event("click", { bubbles: true }));
      browserTab.click();
      expect(select.value).toBe("payload-admin");
      await vi.waitFor(() => {
        const frames = [...document.querySelectorAll("[data-vc-tab-frame]")] as HTMLElement[];
        const visible = frames.filter((frame) => !frame.hidden);
        expect(visible.length).toBe(1);
        expect(visible[0].getAttribute("data-vc-tab-frame")).toBe("payload-admin");
      });
    });

    it("restores a persisted Browser target across reload and falls back to Storefront when the target no longer exists", () => {
      localStorage.setItem(
        "vc:side-panel:browser:target",
        "dev|test-session-123|medusa-admin",
      );
      buildNativeWorkspacePanel();
      const browserTab = document.querySelector("[data-vc-native-browser-tab]") as HTMLButtonElement;
      // Reload = fresh build; the persisted target still exists → restored
      // when the Browser view is first entered.
      browserTab.click();
      const select = document.querySelector("[data-vc-browser-select]") as HTMLSelectElement;
      expect(select.value).toBe("medusa-admin");

      // Stale persisted target → default to Storefront (first tab).
      localStorage.clear();
      localStorage.setItem(
        "vc:side-panel:browser:target",
        "dev|test-session-123|frame-does-not-exist",
      );
      buildNativeWorkspacePanel();
      document.querySelector("[data-vc-native-browser-tab]")?.dispatchEvent(
        new Event("click", { bubbles: true }),
      );
      const select2 = document.querySelector("[data-vc-browser-select]") as HTMLSelectElement;
      expect(select2.value).toBe("storefront");
    });

    it("replaces composer folder glyph with a recognizable right-rail sidebar icon (mirrored, ≥18px rendered)", () => {
      buildNativeWorkspacePanel();
      const icon = document.querySelector(".composer-workspace-icon") as HTMLElement;
      const svg = icon.querySelector("svg.vc-panel-sidebar-icon") as SVGElement;
      expect(svg).not.toBeNull();
      const rects = svg.querySelectorAll("rect");
      expect(rects.length).toBe(2);
      // Mirrored from the left-rail layout: wide content pane on the LEFT,
      // narrow vertical rail on the RIGHT — a right-hand sidebar/panel glyph.
      const pane = rects[0];
      const rail = rects[1];
      expect(Number(rail.getAttribute("width"))).toBeLessThan(
        Number(pane.getAttribute("width")),
      );
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      // Minimum 18x18 rendered size — even though the host markup says 14,
      // the extension's icon must not be a tiny speck in the composer.
      expect(Number(svg.getAttribute("width"))).toBeGreaterThanOrEqual(18);
      expect(Number(svg.getAttribute("height"))).toBeGreaterThanOrEqual(18);
      const button = document.querySelector("#btnWorkspacePanelToggle") as HTMLButtonElement;
      expect(button.title).toBe("Show workspace panel");
      expect(button.getAttribute("aria-label")).toBe("Toggle workspace files panel");
    });

    it("re-applies the sidebar icon after the host re-renders the composer workspace control", async () => {
      buildNativeWorkspacePanel();
      const group = document.querySelector(".composer-workspace-group") as HTMLElement;
      expect(
        group.querySelector(".composer-workspace-icon svg.vc-panel-sidebar-icon"),
      ).not.toBeNull();

      // Simulate the host re-rendering the composer: the old toggle button is
      // replaced by a fresh one carrying the stock folder glyph.
      const fresh = document.createElement("span");
      fresh.className = "composer-workspace-icon";
      fresh.innerHTML =
        '<svg><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
      const button = document.querySelector("#btnWorkspacePanelToggle") as HTMLButtonElement;
      button.replaceWith(fresh);

      await vi.waitFor(() => {
        const reapplied = group.querySelector(
          ".composer-workspace-icon svg.vc-panel-sidebar-icon",
        );
        expect(reapplied).not.toBeNull();
      });
    });
  });

  describe("URL resolution from session env", () => {
    it("maps configured Tailscale targets to loopback when the WebUI is loopback", () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getConfig = () => ({
        iframes: [
          { id: "storefront", label: "Storefront", url: "https://vulpy-commerce-private.tail873f17.ts.net:3000" },
          { id: "admin", label: "Medusa Admin", url: "https://vulpy-commerce-private.tail873f17.ts.net:9000/app" },
          { id: "editor", label: "Code Editor", url: "https://vulpy-commerce-private.tail873f17.ts.net:8080" },
        ],
      });
      buildPanel();
      expect((document.querySelector('[data-vc-tab-frame="frame-storefront"]') as HTMLIFrameElement).src).toBe("http://127.0.0.1:3000/");
    });
    it("resolves dev URLs using dev ports by default (fallback, no config.envs)", () => {
      buildPanel();
      const frame = document.querySelector('[data-vc-tab-frame="storefront"]') as HTMLIFrameElement;
      expect(frame).not.toBeNull();
      expect(frame.src).toContain(":3000");
    });

    it("resolves staging URLs when session env is staging", () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getSessionEnv = () => "staging";
      buildPanel();
      // Should use staging ports from PORT_MAP fallback
      const frame = document.querySelector('[data-vc-tab-frame="storefront"]') as HTMLIFrameElement;
      expect(frame).not.toBeNull();
      expect(frame.src).toContain(":3100");
    });

    it("resolves live URLs when session env is live", () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getSessionEnv = () => "live";
      buildPanel();
      const frame = document.querySelector('[data-vc-tab-frame="storefront"]') as HTMLIFrameElement;
      expect(frame).not.toBeNull();
      expect(frame.src).toContain(":3200");
    });

    it("uses config.envs URLs when available", () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getConfig = () => ({
        shopPort: 3000,
        apiPort: 9000,
        envs: {
          dev: { shop: "https://dev.myshop.com", api: "https://api.dev.myshop.com" },
          staging: { shop: "https://staging.myshop.com", api: "https://api.staging.myshop.com" },
          live: { shop: "https://myshop.com", api: "https://api.myshop.com" },
        },
      });
      (vc as Record<string, unknown>).getSessionEnv = () => "staging";
      buildPanel();
      const frame = document.querySelector('[data-vc-tab-frame="storefront"]') as HTMLIFrameElement;
      expect(frame).not.toBeNull();
      expect(frame.src).toContain("https://staging.myshop.com");
    });
  });

  describe("env dot on tabs", () => {
    it("renders a colored dot on each tab matching session env color", () => {
      buildPanel();
      const dots = document.querySelectorAll(".vc-panel-tab-env-dot");
      expect(dots.length).toBeGreaterThan(0);
      for (const dot of dots) {
        expect((dot as HTMLElement).style.backgroundColor).toBe("rgb(59, 130, 246)"); // #3b82f6 dev blue
      }
    });

    it("updates dot color when env changes to staging", () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      let currentEnv = "dev";
      (vc as Record<string, unknown>).getSessionEnv = () => currentEnv;
      buildPanel();

      // Simulate env change
      currentEnv = "staging";
      window.dispatchEvent(new CustomEvent("vulpy-env-changed", {
        detail: { env: "staging", sessionId: "test-session-123" },
      }));

      const dots = document.querySelectorAll(".vc-panel-tab-env-dot");
      for (const dot of dots) {
        expect((dot as HTMLElement).style.backgroundColor).toBe("rgb(245, 158, 11)"); // #f59e0b staging amber
      }
    });
  });

  describe("offline placeholder", () => {
    it("shows offline placeholder when env probe fails", async () => {
      fetchMock.mockRejectedValue(new Error("network error"));
      buildPanel();

      // Wait for async probe
      await vi.waitFor(() => {
        const placeholder = document.querySelector(".vc-panel-env-offline");
        expect(placeholder).not.toBeNull();
      });
    });

    it("offline placeholder shows correct start command for env", async () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getSessionEnv = () => "staging";
      fetchMock.mockRejectedValue(new Error("network error"));
      buildPanel();

      await vi.waitFor(() => {
        const code = document.querySelector(".vc-panel-env-offline code");
        expect(code).not.toBeNull();
        expect(code!.textContent).toContain("staging");
      });
    });

    it("retry button re-probes and loads iframe on success", async () => {
      // First probe fails
      fetchMock.mockRejectedValueOnce(new Error("network error"));
      buildPanel();

      await vi.waitFor(() => {
        const placeholder = document.querySelector(".vc-panel-env-offline");
        expect(placeholder).not.toBeNull();
      });

      // Second probe succeeds
      fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
      const retryBtn = document.querySelector(".vc-panel-env-offline-retry") as HTMLButtonElement;
      expect(retryBtn).not.toBeNull();
      retryBtn.click();

      await vi.waitFor(() => {
        const placeholder = document.querySelector(".vc-panel-env-offline");
        expect(placeholder === null || (placeholder as HTMLElement).hidden).toBe(true);
        const frame = document.querySelector('[data-vc-tab-frame="storefront"]') as HTMLIFrameElement;
        expect(frame).not.toBeNull();
        expect(frame.hidden).toBe(false);
      });
    });
  });

  describe("live Medusa admin gate", () => {
    it("shows gate panel instead of iframe for live admin tab", () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getSessionEnv = () => "live";
      buildPanel();

      // Click medusa admin tab
      const adminTab = document.querySelector('[data-vc-tab="medusa-admin"]') as HTMLElement;
      expect(adminTab).not.toBeNull();
      adminTab.click();

      const gate = document.querySelector(".vc-panel-live-admin-gate");
      expect(gate).not.toBeNull();
      expect(gate!.querySelector("a")).not.toBeNull();
      expect(gate!.querySelector("a")!.getAttribute("target")).toBe("_blank");
    });

    it("shows gate for live payload-admin tab (production editorial content)", () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getSessionEnv = () => "live";
      buildPanel();

      const payloadTab = document.querySelector('[data-vc-tab="payload-admin"]') as HTMLElement;
      expect(payloadTab).not.toBeNull();
      payloadTab.click();

      const gate = document.querySelector(".vc-panel-live-admin-gate");
      expect(gate).not.toBeNull();
      expect(gate!.querySelector("a")).not.toBeNull();
      expect(gate!.querySelector("a")!.getAttribute("target")).toBe("_blank");
      // No inline iframe is created for the gated payload admin.
      expect(document.querySelector('[data-vc-tab-frame="payload-admin"]')).toBeNull();
    });

    it("does NOT show gate for live storefront tab", () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getSessionEnv = () => "live";
      buildPanel();

      // First tab (storefront) should be active
      const gate = document.querySelector(".vc-panel-live-admin-gate");
      expect(gate === null || (gate as HTMLElement).hidden).toBe(true);
    });

    it("does NOT show gate for non-live admin tab", () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getSessionEnv = () => "dev";
      buildPanel();

      const adminTab = document.querySelector('[data-vc-tab="medusa-admin"]') as HTMLElement;
      adminTab.click();

      const gate = document.querySelector(".vc-panel-live-admin-gate");
      expect(gate === null || (gate as HTMLElement).hidden).toBe(true);
    });
  });

  describe("tab URL update on env change", () => {
    it("re-resolves iframe URLs when vulpy-env-changed fires", async () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      let currentEnv = "dev";
      (vc as Record<string, unknown>).getSessionEnv = () => currentEnv;
      buildPanel();

      // Verify dev URL first
      let frame = document.querySelector('[data-vc-tab-frame="storefront"]') as HTMLIFrameElement;
      expect(frame.src).toContain(":3000");

      // Change env
      currentEnv = "staging";
      window.dispatchEvent(new CustomEvent("vulpy-env-changed", {
        detail: { env: "staging", sessionId: "test-session-123" },
      }));

      // Wait for re-probe + rebuild
      await vi.waitFor(() => {
        frame = document.querySelector('[data-vc-tab-frame="storefront"]') as HTMLIFrameElement;
        expect(frame).not.toBeNull();
        expect(frame.src).toContain(":3100");
      });
    });
  });

  describe("backward compatibility", () => {
    it("works with old config (no envs field) using port fallback", () => {
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc as Record<string, unknown>).getConfig = () => ({ shopPort: 4000, apiPort: 8000 });
      (vc as Record<string, unknown>).getSessionEnv = () => "dev";
      buildPanel();

      const frame = document.querySelector('[data-vc-tab-frame="storefront"]') as HTMLIFrameElement;
      expect(frame).not.toBeNull();
      // For dev, should use shopPort from config directly
      expect(frame.src).toContain(":4000");
    });
  });

  describe("[hidden] isolation + browser control geometry in native browser CSS", () => {
    function readCss() {
      return readFileSync(CSS_PATH, "utf-8");
    }

    it("forces .vc-panel-native-browser[hidden] to display:none despite the flex author rule", () => {
      const css = readCss();
      // The author rule is display:flex — without an override, [hidden] on the
      // wrapper (the Browser view leaking into Files) would be defeated.
      expect(css).toMatch(/\.vc-panel-native-browser\s*\{\s*display:\s*flex/m);
      const override = css.match(
        /\.vc-panel-native-browser\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/,
      );
      expect(override).not.toBeNull();
    });

    it("frame wrapper and frame hidden semantics are unambiguous", () => {
      const css = readCss();
      // The wrapper holds absolutely-positioned progress children; a plain
      // author display rule must not resurrect it when [hidden].
      expect(css).toMatch(
        /\.vc-panel-native-frame-wrap\s*\{[^}]*display:\s*flex/m,
      );
      expect(css).toMatch(
        /\.vc-panel-native-frame-wrap\[hidden\]\s*\{[^}]*display:\s*none\s*!important/m,
      );
      // The iframe itself must never be shown while [hidden].
      expect(css).toMatch(/\.vc-panel-frame\[hidden\]\s*\{[^}]*display:\s*none\s*!important/m);
    });

    it("browser controls are a deliberate single flex row with an explicit caret and 32x32 grid refresh", () => {
      const css = readCss();
      // One row: controls container is display:flex; the select wrapper flexes
      // to fill and the refresh button is a fixed 32x32 icon square.
      expect(css).toMatch(
        /\.vc-panel-native-browser-controls\s*\{[^}]*display:\s*flex/m,
      );
      // Select wrapper: position:relative + flex:1 + min-width:0 so the
      // absolutely-positioned caret has a reference and the row never overflows.
      expect(css).toMatch(
        /\.vc-panel-native-browser-select-wrap\s*\{[^}]*position:\s*relative/m,
      );
      expect(css).toMatch(
        /\.vc-panel-native-browser-select-wrap\s*\{[^}]*flex:\s*1/m,
      );
      expect(css).toMatch(
        /\.vc-panel-native-browser-select-wrap\s*\{[^}]*min-width:\s*0/m,
      );
      // Select fills the wrapper and reserves explicit right padding for the
      // caret (option text never sits under the chevron).
      expect(css).toMatch(
        /\.vc-panel-native-browser-select\s*\{[^}]*width:\s*100%/m,
      );
      expect(css).toMatch(
        /\.vc-panel-native-browser-select\s*\{[^}]*padding-right:\s*(2|3)\dpx/m,
      );
      // Refresh: exactly 32x32, flex:0 0 32px, grid-centered, block 18px SVG.
      const refreshRule = css.match(
        /\.vc-panel-native-browser-refresh\s*\{[^}]*\}/m,
      )?.[0] || "";
      expect(refreshRule).toMatch(/width:\s*32px/);
      expect(refreshRule).toMatch(/height:\s*32px/);
      expect(refreshRule).toMatch(/flex:\s*0\s*0\s*32px/);
      expect(refreshRule).toMatch(/display:\s*grid/);
      expect(refreshRule).toMatch(/place-items:\s*center/);
      expect(refreshRule).toMatch(/padding:\s*0/);
      expect(css).toMatch(
        /\.vc-panel-native-browser-refresh\s+svg\s*\{[^}]*width:\s*18px/m,
      );
      expect(css).toMatch(
        /\.vc-panel-native-browser-refresh\s+svg\s*\{[^}]*height:\s*18px/m,
      );
      expect(css).toMatch(
        /\.vc-panel-native-browser-refresh\s+svg\s*\{[^}]*display:\s*block/m,
      );
      // Caret SVG is explicitly sized, block, non-interactive.
      expect(css).toMatch(
        /\.vc-panel-native-browser-select-chevron\s*\{[^}]*pointer-events:\s*none/m,
      );
      expect(css).toMatch(
        /\.vc-panel-native-browser-select-chevron\s*\{[^}]*display:\s*block/m,
      );
    });

    it("removes the Browser preview caption bar entirely (no DOM element, no CSS)", () => {
      const css = readCss();
      // No caption/hint styling may exist for the native frame wrapper — the
      // bar overlapped the iframe bottom and is removed from DOM + CSS.
      const caption = css.match(/\.vc-panel-native-frame-wrap\s+\.vc-panel-frame-hint/);
      expect(caption).toBeNull();
      // A generic hint rule that could still render a bottom bar is also banned
      // inside the native browser view.
      expect(css).not.toMatch(/vc-panel-frame-hint/);
    });

    it("composer sidebar icon is a mirrored right-rail glyph at a minimum rendered size of 18px", () => {
      const css = readCss();
      const iconRule = css.match(/\.vc-panel-sidebar-icon\s*\{[^}]*\}/m)?.[0] || "";
      expect(iconRule).toMatch(/width:\s*18px/);
      expect(iconRule).toMatch(/height:\s*18px/);
      expect(iconRule).toMatch(/display:\s*block/);
    });

    it("keeps the workspace toggle always visible and rotates the glyph when the panel is open", () => {
      const css = readCss();
      expect(css).toMatch(/\.composer-workspace-files-btn\s*\{[^}]*display:\s*inline-flex\s*!important/m);
      expect(css).toMatch(
        /\.composer-workspace-files-btn\[aria-pressed="true"\]\s+\.vc-panel-sidebar-icon[\s\S]*?transform:\s*rotate\(180deg\)/m,
      );
    });
  });
});
