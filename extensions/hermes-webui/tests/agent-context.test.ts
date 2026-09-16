// @vitest-environment jsdom
/**
 * Tests for the vulpy-commerce-agent-context feature.
 *
 * This extension is the RUNTIME DETECTION layer of the environment-context
 * injection pattern (reference: environment-context-injection.md), separate
 * from the static `.hermes.md` contract (auto-injected by the prompt builder):
 *
 *   - Detects the WebUI access mode: embedded iframe (side panel) vs
 *     top-level window (`window.top !== window.self`).
 *   - Probes `host.docker.internal` reachability so the agent knows whether
 *     host-gateway URLs (http://host.docker.internal:9000 / :3000) work from
 *     inside the container.
 *   - Builds a compact environment contract the agent can read — host-gateway
 *     access, the authoritative context files (.hermes.md /
 *     .agent/generated-context.md) + the read-only ts.status bridge command
 *     for live Fox-Tailscale state.
 *   - Does NOT resolve live Tailscale state from inside (impossible — sibling
 *     container); MagicDNS stays static in .hermes.md.
 *
 * INVISIBLE BY DESIGN (operator directive 2026-08-29): the extension renders
 * NO UI. No fresh-chat contract card is injected, no MutationObserver, no
 * session listeners. The detection API is exposed for agent/console use only.
 *
 * The feature is NOT part of the hidden env chrome (see env-visibility.test.ts
 * — that gate covers only .vc-env-* controls). It mounts regardless.
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

describe("vulpy-commerce-agent-context", () => {
  let eventHandlers: Map<string, Array<(...args: unknown[]) => void>>;

  function fireSessionLoaded(data: Record<string, unknown>) {
    const handlers = eventHandlers.get("session:loaded");
    if (!handlers) { return; }
    for (const h of handlers.slice()) { h(data); }
  }

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    eventHandlers = new Map();

    // Stub VulpyCommerce core (loaded before this extension)
    (globalThis as Record<string, unknown>).VulpyCommerce = {
      register: vi.fn(),
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        if (!eventHandlers.has(event)) { eventHandlers.set(event, []); }
        eventHandlers.get(event)!.push(fn);
      }),
      emit: vi.fn(),
      getConfig: () => ({}),
      isEnvironmentControlsVisible: () => false,
      loadConfig: () => Promise.resolve({}),
    };

    // Stub S (WebUI global state)
    (globalThis as Record<string, unknown>).S = {
      session: { session_id: "test-session-123", message_count: 0 },
      messages: [],
    };

    // Stub fetch — jsdom has no fetch; the host.gateway probe uses it.
    (globalThis as Record<string, unknown>).fetch = vi.fn().mockRejectedValue(
      new TypeError("fetch failed"),
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    (globalThis as Record<string, unknown>).VulpyCommerce = undefined;
    (globalThis as Record<string, unknown>).S = undefined;
    (globalThis as Record<string, unknown>).fetch = undefined;
    vi.restoreAllMocks();
  });

  describe("public API", () => {
    it("exposes detectAccessMode(), buildEnvContract(), getEnvContract()", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      expect(typeof vc.detectAccessMode).toBe("function");
      expect(typeof vc.buildEnvContract).toBe("function");
      expect(typeof vc.getEnvContract).toBe("function");
    });

    it("detectAccessMode() reports top-level window when window.top === self", async () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      const mode = await (vc.detectAccessMode as () => Promise<Record<string, unknown>>)();
      expect(mode.iframe).toBe(false);
    });

    it("detectAccessMode() reports iframe when window.top !== self", async () => {
      const fakeTop = {} as Window;
      Object.defineProperty(window, "top", { value: fakeTop, configurable: true });
      try {
        loadExtension();
        const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
        const mode = await (vc.detectAccessMode as () => Promise<Record<string, unknown>>)();
        expect(mode.iframe).toBe(true);
      } finally {
        Object.defineProperty(window, "top", { value: window, configurable: true });
      }
    });

    it("detectAccessMode() reports host reachable when the gateway HEAD resolves", async () => {
      (globalThis as unknown as { fetch: unknown }).fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200 });
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      const mode = await (vc.detectAccessMode as () => Promise<Record<string, unknown>>)();
      expect(mode.hostReachable).toBe(true);
      // The probe targets host.docker.internal (host gateway), not localhost.
      const calls = ((globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch)
        .mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes("host.docker.internal"))).toBe(true);
    });

    it("detectAccessMode() reports host unreachable when the gateway HEAD rejects", async () => {
      (globalThis as unknown as { fetch: unknown }).fetch = vi
        .fn()
        .mockRejectedValue(new TypeError("fetch failed"));
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      const mode = await (vc.detectAccessMode as () => Promise<Record<string, unknown>>)();
      expect(mode.hostReachable).toBe(false);
    });
  });

  describe("buildEnvContract", () => {
    it("includes the detection results and the authoritative context pointers", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      const contract = (vc.buildEnvContract as (d: Record<string, unknown>) => string)({
        iframe: false,
        hostReachable: true,
      });
      expect(contract).toContain(".hermes.md");
      expect(contract).toContain(".agent/generated-context.md");
      expect(contract).toContain("host.docker.internal");
      expect(contract).toContain("ts.status");
    });

    it("reflects unreachable host gateway in the contract", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>;
      const contract = (vc.buildEnvContract as (d: Record<string, unknown>) => string)({
        iframe: false,
        hostReachable: false,
      });
      expect(contract).toContain("NOT reachable");
    });
  });

  describe("invisibility contract", () => {
    it("registers NO session:loaded listener (no fresh-chat injection path)", () => {
      loadExtension();
      // The feature must not subscribe to session events — the old card
      // injection mounted on session:loaded.
      expect(eventHandlers.has("session:loaded")).toBe(false);
    });

    it("renders NO card and injects NO DOM on a fresh thread", async () => {
      document.body.innerHTML = `
        <main>
          <div id="emptyState">
            <h2 data-i18n="empty_title">Think less. Start here.</h2>
            <p data-i18n="empty_subtitle">Try a prompt like…</p>
          </div>
        </main>
      `;
      loadExtension();
      const emptyBefore = document.querySelector("#emptyState")!.innerHTML;
      fireSessionLoaded({ session_id: "test-session-123", env: null });
      // Give any (hypothetical) async injection a chance to run.
      await new Promise((r) => setTimeout(r, 50));
      expect(document.querySelector(".vc-agent-contract")).toBeNull();
      expect(document.querySelector("[data-vc-agent-contract]")).toBeNull();
      // The empty state must be byte-identical — nothing injected.
      expect(document.querySelector("#emptyState")!.innerHTML).toBe(emptyBefore);
    });
  });
});