// @vitest-environment jsdom
/**
 * Tests for the vulpy-commerce-env-context feature.
 *
 * This extension:
 *   - Stores env per session in localStorage (vulpy_env_${sessionId})
 *   - Exposes window.VulpyCommerce.getSessionEnv() / setSessionEnv()
 *   - Renders a 4px colored top bar
 *   - Embeds the env chrome (pill + actions slot) INSIDE the WebUI's native
 *     titlebar (header.app-titlebar) — no fixed/floating row
 *   - Auto-assigns new conversations to the previously active env (dev if
 *     none) instead of showing a picker prompt
 *   - Renders a small env tag (DEV/STAGING/LIVE) per session-list row
 *   - Clicking the pill opens a popover; selecting different env opens new chat
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION_PATH = join(
  import.meta.dirname,
  "..",
  "features",
  "vulpy-commerce-env-context",
  "index.js",
);

function loadExtension() {
  const code = readFileSync(EXTENSION_PATH, "utf-8");
  new Function(code)();
}

/** Minimal host titlebar matching the WebUI's header.app-titlebar structure. */
function mountHostTitlebar() {
  document.body.innerHTML = `
    <header class="app-titlebar">
      <div class="app-titlebar-left">
        <button class="app-titlebar-profile">default</button>
      </div>
      <div class="app-titlebar-inner"><span class="app-titlebar-title">Hermes</span></div>
      <div class="app-titlebar-spacer"></div>
      <button class="app-titlebar-new-chat">+</button>
      <button class="app-titlebar-reload">r</button>
    </header>
  `;
}

function mountSessionRow(sid: string, opts: { env?: string; withTime?: boolean } = {}) {
  const row = document.createElement("div");
  row.className = "session-item";
  row.dataset.sid = sid;
  const text = document.createElement("div");
  text.className = "session-text";
  const titleRow = document.createElement("div");
  titleRow.className = "session-title-row";
  const title = document.createElement("span");
  title.className = "session-title";
  title.textContent = sid;
  titleRow.appendChild(title);
  if (opts.withTime) {
    const time = document.createElement("span");
    time.className = "session-time";
    time.textContent = "2m";
    titleRow.appendChild(time);
  }
  text.appendChild(titleRow);
  row.appendChild(text);
  document.body.appendChild(row);
  if (opts.env) { localStorage.setItem(`vulpy_env_${sid}`, opts.env); }
  return row;
}

describe("vulpy-commerce-env-context", () => {
  let mockEmit: ReturnType<typeof vi.fn>;
  let mockOn: ReturnType<typeof vi.fn>;
  let eventHandlers: Map<string, Array<(...args: unknown[]) => void>>;

  function fireSessionLoaded(data: Record<string, unknown>) {
    const handlers = eventHandlers.get("session:loaded");
    if (handlers) {
      for (const h of handlers) { h(data); }
    }
  }

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    eventHandlers = new Map();

    mockEmit = vi.fn();
    mockOn = vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) { eventHandlers.set(event, []); }
      eventHandlers.get(event)!.push(fn);
    });

    // Stub VulpyCommerce core (loaded before this extension)
    (globalThis as Record<string, unknown>).VulpyCommerce = {
      register: vi.fn(),
      on: mockOn,
      emit: mockEmit,
      getConfig: () => ({}),
      isEnvironmentControlsVisible: () => true,
      loadConfig: () => Promise.resolve({}),
    };

    // Stub S (WebUI global state) with a session
    (globalThis as Record<string, unknown>).S = {
      session: { session_id: "test-session-123", message_count: 0 },
      messages: [],
    };

    // Stub api() for new session creation
    (globalThis as Record<string, unknown>).api = vi.fn().mockResolvedValue({
      session: { session_id: "new-session-456" },
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    (globalThis as Record<string, unknown>).VulpyCommerce = undefined;
    (globalThis as Record<string, unknown>).S = undefined;
    (globalThis as Record<string, unknown>).api = undefined;
    vi.restoreAllMocks();
  });

  describe("global API", () => {
    it("exposes getSessionEnv() returning 'dev' by default", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      expect(typeof vc.getSessionEnv).toBe("function");
      expect((vc.getSessionEnv as () => string)()).toBe("dev");
    });

    it("exposes setSessionEnv() that persists to localStorage", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc.setSessionEnv as (env: string) => void)("staging");
      expect(localStorage.getItem("vulpy_env_test-session-123")).toBe("staging");
      expect((vc.getSessionEnv as () => string)()).toBe("staging");
    });

    it("dispatches a custom event on setSessionEnv()", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      const handler = vi.fn();
      window.addEventListener("vulpy-env-changed", handler);
      (vc.setSessionEnv as (env: string) => void)("live");
      expect(handler).toHaveBeenCalled();
      const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toEqual({ env: "live", sessionId: "test-session-123" });
      window.removeEventListener("vulpy-env-changed", handler);
    });

    it("exposes ENV_COLORS and ENV_LABELS", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      expect(vc.ENV_COLORS).toEqual({ dev: "#19381F", staging: "#AB3C00", live: "#760521" });
      expect(vc.ENV_LABELS).toEqual({ dev: "DEV", staging: "STAGING", live: "LIVE" });
    });

    it("reads persisted env from localStorage", () => {
      localStorage.setItem("vulpy_env_test-session-123", "live");
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      expect((vc.getSessionEnv as () => string)()).toBe("live");
    });

    it("defaults to 'dev' when no session ID is available", () => {
      (globalThis as Record<string, unknown>).S = { session: null };
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      expect((vc.getSessionEnv as () => string)()).toBe("dev");
    });
  });

  describe("top bar rendering", () => {
    it("renders a 6px top bar with the correct env color after DOMContentLoaded", () => {
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const bar = document.getElementById("vc-env-bar");
      expect(bar).not.toBeNull();
      expect(bar!.style.height).toBe("6px");
      expect(bar!.style.backgroundColor).toBe("rgb(25, 56, 31)"); // #19381F green
    });

    it("updates bar color when env changes", () => {
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc.setSessionEnv as (env: string) => void)("live");

      const bar = document.getElementById("vc-env-bar");
      expect(bar!.style.backgroundColor).toBe("rgb(118, 5, 33)"); // #760521 red
    });
  });

  describe("titlebar embedding", () => {
    it("renders the env chrome inside header.app-titlebar (no fixed row)", () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const header = document.querySelector("header.app-titlebar")!;
      const container = document.getElementById("vc-env-titlebar") as HTMLElement;
      expect(container).not.toBeNull();
      expect(container.classList.contains("vc-env-titlebar")).toBe(true);
      // Containment: the chip is a child of the native titlebar — overlap
      // with the titlebar's own controls is impossible by construction.
      expect(header.contains(container)).toBe(true);
      // Inserted after the title group, before the new-chat button.
      const newChat = header.querySelector(".app-titlebar-new-chat")!;
      expect(newChat.compareDocumentPosition(container)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
      // No fixed/absolute positioning anywhere on the chip.
      expect(container.style.position).not.toBe("fixed");
      expect(getComputedStyle(container).position).not.toBe("fixed");
      // Old floating row must not exist.
      expect(document.querySelector(".vc-env-row")).toBeNull();
    });

    it("pill and actions group live inside the titlebar chip", () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const container = document.getElementById("vc-env-titlebar") as HTMLElement;
      const pill = container.querySelector(".vc-env-pill") as HTMLElement;
      expect(pill).not.toBeNull();
      expect(pill.textContent).toBe("DEV");
      const actionsGroup = container.querySelector(".vc-env-actions") as HTMLElement;
      expect(actionsGroup).not.toBeNull();
      // Invariant: the action bar keeps [data-vc-env-actions-bar] so tests can find it.
      expect(actionsGroup.hasAttribute("data-vc-env-actions-bar")).toBe(true);
    });

    it("exposes VulpyCommerce.envBar and emits env-bar:ready", () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const container = document.getElementById("vc-env-titlebar");
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      expect(vc.envBar).toBe(container);
      expect(mockEmit).toHaveBeenCalledWith("env-bar:ready", container);
    });

    it("chip is a flex child of the titlebar (not independently fixed/translated)", () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const header = document.querySelector("header.app-titlebar")!;
      const container = document.getElementById("vc-env-titlebar") as HTMLElement;
      expect(container.parentElement).toBe(header);
      expect(container.style.position).not.toBe("fixed");
      expect(container.style.transform).not.toContain("translateX");
    });
  });

  describe("env pill + popover", () => {
    it("renders a pill with the correct label and color class", () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const pill = document.querySelector(".vc-env-pill") as HTMLElement;
      expect(pill).not.toBeNull();
      expect(pill.textContent).toBe("DEV");
      expect(pill.classList.contains("vc-env-pill--dev")).toBe(true);
    });

    it("updates pill when env changes", () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc.setSessionEnv as (env: string) => void)("staging");

      const pill = document.querySelector(".vc-env-pill") as HTMLElement;
      expect(pill.textContent).toBe("STAGING");
      expect(pill.classList.contains("vc-env-pill--staging")).toBe(true);
      expect(pill.classList.contains("vc-env-pill--dev")).toBe(false);
    });

    it("clicking pill shows a popover with three env options", () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const pill = document.querySelector(".vc-env-pill") as HTMLElement;
      pill.click();

      const popover = document.querySelector(".vc-env-popover") as HTMLElement;
      expect(popover).not.toBeNull();
      expect(popover.hidden).toBe(false);
      const options = popover.querySelectorAll("[data-vc-env]");
      expect(options.length).toBe(3);
    });
  });

  describe("new-chat auto-assign (replaces the env picker)", () => {
    it("assigns a brand-new thread the previously active session's env", () => {
      // Prior session is staging.
      localStorage.setItem("vulpy_env_test-session-123", "staging");
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      // New chat: empty thread, no persisted env.
      (globalThis as Record<string, unknown>).S = {
        session: { session_id: "brand-new-session", message_count: 0 },
        messages: [],
      };
      fireSessionLoaded({ session_id: "brand-new-session" });

      expect(localStorage.getItem("vulpy_env_brand-new-session")).toBe("staging");
      // No picker modal exists at all.
      expect(document.querySelector(".vc-env-picker-modal")).toBeNull();
    });

    it("assigns dev when there is no previously active env", () => {
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      (globalThis as Record<string, unknown>).S = {
        session: { session_id: "fresh-session", message_count: 0 },
        messages: [],
      };
      fireSessionLoaded({ session_id: "fresh-session" });

      expect(localStorage.getItem("vulpy_env_fresh-session")).toBe("dev");
    });

    it("assigns dev (not the inherited env) to an existing thread with messages", () => {
      // Prior session is staging — but this is a legacy thread, not a new chat.
      localStorage.setItem("vulpy_env_test-session-123", "staging");
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      (globalThis as Record<string, unknown>).S = {
        session: { session_id: "old-thread", message_count: 7 },
        messages: [{ id: 1, role: "user", content: "hi" }],
      };
      fireSessionLoaded({ session_id: "old-thread", messages: [{ id: 1, role: "user", content: "hi" }] });

      expect(localStorage.getItem("vulpy_env_old-thread")).toBe("dev");
    });

    it("auto-assigns over a corrupt stored env value", () => {
      localStorage.setItem("vulpy_env_corrupt-session", "prod");
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      (globalThis as Record<string, unknown>).S = {
        session: { session_id: "corrupt-session", message_count: 0 },
        messages: [],
      };
      fireSessionLoaded({ session_id: "corrupt-session" });

      expect(localStorage.getItem("vulpy_env_corrupt-session")).toBe("dev");
    });

    it("does NOT overwrite an existing valid env on session load", () => {
      localStorage.setItem("vulpy_env_live-session", "live");
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      (globalThis as Record<string, unknown>).S = {
        session: { session_id: "live-session", message_count: 3 },
        messages: [{ id: 1, role: "user", content: "hi" }],
      };
      fireSessionLoaded({ session_id: "live-session" });

      expect(localStorage.getItem("vulpy_env_live-session")).toBe("live");
    });

    it("dispatches vulpy-env-changed when auto-assigning", () => {
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const handler = vi.fn();
      window.addEventListener("vulpy-env-changed", handler);

      (globalThis as Record<string, unknown>).S = {
        session: { session_id: "fresh-session", message_count: 0 },
        messages: [],
      };
      fireSessionLoaded({ session_id: "fresh-session" });

      expect(handler).toHaveBeenCalled();
      const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toEqual({ env: "dev", sessionId: "fresh-session" });
      window.removeEventListener("vulpy-env-changed", handler);
    });
  });

  describe("session-list env tags", () => {
    it("renders a DEV tag for a backfilled legacy thread", () => {
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));
      mountSessionRow("legacy-thread", { withTime: true });

      fireSessionLoaded({ session_id: "test-session-123" });

      const row = document.querySelector('.session-item[data-sid="legacy-thread"]')!;
      const tag = row.querySelector(".vc-env-tag") as HTMLElement;
      expect(tag).not.toBeNull();
      expect(tag.textContent).toBe("DEV");
      expect(tag.classList.contains("vc-env-tag--dev")).toBe(true);
      // Inserted before the timestamp in the title row.
      const titleRow = row.querySelector(".session-title-row")!;
      expect(tag.parentElement).toBe(titleRow);
      expect(titleRow.querySelector(".session-time")).not.toBeNull();
      expect(tag.nextElementSibling?.classList.contains("session-time")).toBe(true);
    });

    it("renders STAGING/LIVE tags from persisted envs", () => {
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));
      mountSessionRow("staging-thread", { env: "staging" });
      mountSessionRow("live-thread", { env: "live" });

      fireSessionLoaded({ session_id: "test-session-123" });

      const stagingTag = document.querySelector('.session-item[data-sid="staging-thread"] .vc-env-tag') as HTMLElement;
      expect(stagingTag.textContent).toBe("STAGING");
      expect(stagingTag.classList.contains("vc-env-tag--staging")).toBe(true);
      const liveTag = document.querySelector('.session-item[data-sid="live-thread"] .vc-env-tag') as HTMLElement;
      expect(liveTag.textContent).toBe("LIVE");
      expect(liveTag.classList.contains("vc-env-tag--live")).toBe(true);
    });

    it("is idempotent — no duplicate tags across passes", () => {
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));
      mountSessionRow("dup-thread", { env: "live" });

      fireSessionLoaded({ session_id: "test-session-123" });
      fireSessionLoaded({ session_id: "test-session-123" });

      const tags = document.querySelectorAll('.session-item[data-sid="dup-thread"] .vc-env-tag');
      expect(tags.length).toBe(1);
    });

    it("tags all listed threads including legacy ones", () => {
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));
      mountSessionRow("old-a", { withTime: true });
      mountSessionRow("old-b", { withTime: true });

      fireSessionLoaded({ session_id: "test-session-123" });

      expect(document.querySelectorAll(".vc-env-tag").length).toBe(2);
      for (const tag of document.querySelectorAll(".vc-env-tag")) {
        expect(tag.textContent).toBe("DEV");
      }
    });
  });

  describe("legacy thread backfill to dev", () => {
    it("persists dev for pre-existing threads with no stored env", () => {
      document.body.innerHTML = `
        <div data-sid="old-thread-1">old</div>
        <div data-sid="old-thread-2">old</div>
        <div data-sid="staging-thread" class="staging">tagged</div>
      `;
      localStorage.setItem("vulpy_env_staging-thread", "staging");
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      expect(localStorage.getItem("vulpy_env_old-thread-1")).toBe("dev");
      expect(localStorage.getItem("vulpy_env_old-thread-2")).toBe("dev");
      // Explicitly tagged threads are untouched.
      expect(localStorage.getItem("vulpy_env_staging-thread")).toBe("staging");
    });

    it("does not overwrite existing env choices", () => {
      document.body.innerHTML = `<div data-sid="live-thread">live</div>`;
      localStorage.setItem("vulpy_env_live-thread", "live");
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      expect(localStorage.getItem("vulpy_env_live-thread")).toBe("live");
    });
  });

  describe("env awareness in context (marker file)", () => {
    it("exposes writeEnvMarker() on VulpyCommerce", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      expect(typeof vc.writeEnvMarker).toBe("function");
    });

    it("writeEnvMarker calls api(/api/file/create) with .env-current path and env content", () => {
      const apiFn = (globalThis as Record<string, unknown>).api as ReturnType<typeof vi.fn>;
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      (vc.writeEnvMarker as (env: string) => void)("staging");

      expect(apiFn).toHaveBeenCalledWith(
        "/api/file/create",
        expect.objectContaining({ method: "POST" }),
      );
      const lastCall = apiFn.mock.calls.length - 1;
      const parsedBody = JSON.parse(apiFn.mock.calls[lastCall][1].body);
      expect(parsedBody.path).toBe(".env-current");
      expect(parsedBody.content).toBe("staging");
      expect(parsedBody.session_id).toBe("test-session-123");
    });

    it("calls writeEnvMarker when setSessionEnv is called (on vulpy-env-changed)", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      const writeSpy = vi.fn();
      vc.writeEnvMarker = writeSpy;

      (vc.setSessionEnv as (env: string) => void)("live");

      expect(writeSpy).toHaveBeenCalledWith("live");
    });

    it("does not write marker when setSessionEnv is called with the same env", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      // Ensure env is already "dev" so calling setSessionEnv("dev") is a no-change.
      for (const k of Object.keys(localStorage).filter((lk) => lk.startsWith("vulpy_env_"))) { localStorage.removeItem(k); }
      (vc.setSessionEnv as (env: string) => void)("dev");
      const writeSpy = vi.fn();
      vc.writeEnvMarker = writeSpy;
      (vc.setSessionEnv as (env: string) => void)("dev");

      // No change — same env
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  describe("env persistence across sessions", () => {
    it("two sessions can have different envs", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;

      // Session 1 is staging
      (vc.setSessionEnv as (env: string) => void)("staging");
      expect(localStorage.getItem("vulpy_env_test-session-123")).toBe("staging");

      // Switch to session 2
      ((globalThis as Record<string, unknown>).S as Record<string, unknown>).session = {
        session_id: "other-session-789",
      };
      (vc.setSessionEnv as (env: string) => void)("live");
      expect(localStorage.getItem("vulpy_env_other-session-789")).toBe("live");

      // Session 1 still staging
      expect(localStorage.getItem("vulpy_env_test-session-123")).toBe("staging");
    });
  });

  describe("env change = new session", () => {
    it("selecting different env from popover triggers new session creation", async () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      // Open popover
      const pill = document.querySelector(".vc-env-pill") as HTMLElement;
      pill.click();

      const popover = document.querySelector(".vc-env-popover") as HTMLElement;
      const liveOption = popover.querySelector('[data-vc-env="live"]') as HTMLElement;
      liveOption.click();

      // Should have called api to create new session
      const api = (globalThis as Record<string, unknown>).api as ReturnType<typeof vi.fn>;
      expect(api).toHaveBeenCalledWith("/api/session/new", expect.objectContaining({
        method: "POST",
      }));
    });

    it("selecting same env from popover just closes the popover", () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      // Open popover
      const pill = document.querySelector(".vc-env-pill") as HTMLElement;
      pill.click();

      const popover = document.querySelector(".vc-env-popover") as HTMLElement;
      const devOption = popover.querySelector('[data-vc-env="dev"]') as HTMLElement;
      devOption.click();

      // Should NOT call api
      const api = (globalThis as Record<string, unknown>).api as ReturnType<typeof vi.fn>;
      expect(api).not.toHaveBeenCalled();

      // Popover should be hidden
      expect(popover.hidden).toBe(true);
    });

    it("dispatches vulpy-env-changed after switching env via popover", async () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const handler = vi.fn();
      window.addEventListener("vulpy-env-changed", handler);

      const pill = document.querySelector(".vc-env-pill") as HTMLElement;
      pill.click();
      const popover = document.querySelector(".vc-env-popover") as HTMLElement;
      (popover.querySelector('[data-vc-env="live"]') as HTMLElement).click();

      await vi.waitFor(() => expect(handler).toHaveBeenCalled());

      const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toEqual({ env: "live", sessionId: "new-session-456" });
      window.removeEventListener("vulpy-env-changed", handler);
    });

    it("clears S._pendingSessionToolsets when switching env via popover", async () => {
      mountHostTitlebar();
      loadExtension();
      document.dispatchEvent(new Event("DOMContentLoaded"));
      ((globalThis as Record<string, unknown>).S as Record<string, unknown>)._pendingSessionToolsets = { tools: [1] };

      const pill = document.querySelector(".vc-env-pill") as HTMLElement;
      pill.click();
      const popover = document.querySelector(".vc-env-popover") as HTMLElement;
      (popover.querySelector('[data-vc-env="live"]') as HTMLElement).click();

      await vi.waitFor(() => {
        expect(((globalThis as Record<string, unknown>).S as Record<string, unknown>)._pendingSessionToolsets).toBeNull();
      });
    });
  });
});
