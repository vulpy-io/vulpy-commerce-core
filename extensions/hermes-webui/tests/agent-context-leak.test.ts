// @vitest-environment jsdom
/**
 * Invisibility contract for vulpy-commerce-agent-context.
 *
 * The feature must NEVER mount any DOM surface: no #emptyState card, no
 * session listeners, no MutationObserver. This replaces the old (now-removed)
 * leak-prevention suite, which guarded the rendered card across session
 * switches. With no UI at all, the strongest guarantee is: the extension
 * leaves the DOM completely untouched.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION_PATH = join(
  import.meta.dirname,
  "..",
  "features",
  "vulpy-commerce-agent-context",
  "index.js",
);

function loadExtension() {
  const code = readFileSync(EXTENSION_PATH, "utf-8");
  new Function(code)();
}

describe("vulpy-commerce-agent-context invisibility", () => {
  let mockEmit: ReturnType<typeof vi.fn>;
  let mockOn: ReturnType<typeof vi.fn>;
  let eventHandlers: Map<string, Array<(...args: unknown[]) => void>>;

  beforeEach(() => {
    document.body.innerHTML = `
      <main id="mainChat" class="main-view">
        <div class="messages-shell">
          <div class="messages">
            <div id="emptyState" class="empty-state">
              <div class="empty-logo"></div>
              <h2>What can I help with?</h2>
              <div class="suggestion-grid"></div>
            </div>
          </div>
        </div>
      </main>`;
    localStorage.clear();
    eventHandlers = new Map();

    mockEmit = vi.fn();
    mockOn = vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) { eventHandlers.set(event, []); }
      eventHandlers.get(event)!.push(fn);
    });

    (globalThis as Record<string, unknown>).VulpyCommerce = {
      register: vi.fn(),
      on: mockOn,
      emit: mockEmit,
      getConfig: () => ({}),
      loadConfig: () => Promise.resolve({}),
      getSessionEnv: () => "dev",
      setSessionEnv: vi.fn(),
      ENV_COLORS: { dev: "#3b82f6" },
      ENV_LABELS: { dev: "DEV" },
    };

    (globalThis as Record<string, unknown>).S = {
      session: { session_id: "sess-fresh" },
      messages: [],
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    (globalThis as Record<string, unknown>).VulpyCommerce = undefined;
    (globalThis as Record<string, unknown>).S = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function trigger(ev: string, data?: unknown) {
    const handlers = eventHandlers.get(ev);
    if (handlers) { for (const h of handlers) { h(data); } }
  }

  it("leaves the DOM completely untouched on load", () => {
    const before = document.body.innerHTML;
    loadExtension();
    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelector("[data-vc-agent-contract]")).toBeNull();
    expect(document.querySelector(".vc-agent-contract")).toBeNull();
  });

  it("registers NO event listeners on VulpyCommerce (no session:loaded, no session:changed)", () => {
    loadExtension();
    expect(eventHandlers.size).toBe(0);
  });

  it("installs NO MutationObserver on the chat surface", () => {
    const spy = vi.spyOn(window, "MutationObserver");
    loadExtension();
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not render the card even after session events fire", async () => {
    loadExtension();
    trigger("session:loaded", { session_id: "sess-fresh" });
    trigger("session:changed", { session_id: "sess-other" });
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelector("[data-vc-agent-contract]")).toBeNull();
    expect(document.querySelector(".vc-agent-contract")).toBeNull();
  });

  it("session switch leaves no card (nothing injected, nothing to leak)", async () => {
    loadExtension();
    // Rebuild the messages shell like a session switch would.
    document.querySelector("#mainChat")!.innerHTML = `
      <div class="messages-shell"><div class="messages"><div id="emptyState" class="empty-state"></div></div></div>`;
    expect(document.querySelector("[data-vc-agent-contract]")).toBeNull();
  });
});