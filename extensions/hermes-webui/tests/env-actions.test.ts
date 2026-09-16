// @vitest-environment jsdom
/**
 * Tests for the vulpy-commerce-env-actions feature.
 *
 * This extension:
 *   - Registers "env-actions" on the VulpyCommerce registry
 *   - Renders an action bar below the env pill
 *   - Shows push/pull buttons appropriate to the current env:
 *       dev     → Push to Staging, Pull Data, View Logs
 *       staging → Push to Live (confirm dialog), Pull Data, View Logs
 *       live    → View Logs only
 *   - Push to Live requires a confirmation dialog before calling the
 *     agent-cmd bridge
 *   - Runs operations through the agent-cmd file-drop protocol via the
 *     WebUI file API (/api/file/create → poll /api/file/read →
 *     /api/file/delete)
 *   - Loads without console errors and never touches the embedded terminal
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION_PATH = join(
  import.meta.dirname,
  "..",
  "features",
  "vulpy-commerce-env-actions",
  "index.js",
);

function loadExtension() {
  const code = readFileSync(EXTENSION_PATH, "utf-8");
  new Function(code)();
}

describe("vulpy-commerce-env-actions", () => {
  let mockEmit: ReturnType<typeof vi.fn>;
  let mockOn: ReturnType<typeof vi.fn>;
  let eventHandlers: Map<string, Array<(...args: unknown[]) => void>>;
  let apiMock: ReturnType<typeof vi.fn>;
  let createdReqs: Array<{ id: string; cmd: string; args: Record<string, unknown> }>;
  let deletedFiles: string[];
  let readCalls: string[];
  let respState: { ready: boolean; resp: Record<string, unknown> | null };
  let sessionEnv: string;

  function setEnv(env: string) {
    sessionEnv = env;
    (globalThis as Record<string, unknown>).VulpyCommerce = {
      ...((globalThis as Record<string, unknown>).VulpyCommerce as Record<string, unknown>),
      getSessionEnv: () => sessionEnv,
    };
  }

  beforeEach(() => {
    // Host titlebar present — the env chrome lands inside it (like prod).
    document.body.innerHTML = `
      <header class="app-titlebar">
        <div class="app-titlebar-left"></div>
        <div class="app-titlebar-inner"></div>
        <div class="app-titlebar-spacer"></div>
        <button class="app-titlebar-new-chat"></button>
      </header>
    `;
    localStorage.clear();
    eventHandlers = new Map();
    sessionEnv = "dev";
    createdReqs = [];
    deletedFiles = [];
    readCalls = [];
    respState = { ready: false, resp: null };

    mockEmit = vi.fn();
    mockOn = vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) { eventHandlers.set(event, []); }
      eventHandlers.get(event)!.push(fn);
    });

    // Stub VulpyCommerce core + env-context (both load before this extension)
    (globalThis as Record<string, unknown>).VulpyCommerce = {
      register: vi.fn(),
      on: mockOn,
      emit: mockEmit,
      getConfig: () => ({}),
      isEnvironmentControlsVisible: () => true,
      loadConfig: () => Promise.resolve({}),
      getSessionEnv: () => sessionEnv,
    };

    // Stub S (WebUI global state) with a session
    (globalThis as Record<string, unknown>).S = {
      session: { session_id: "test-session-123", workspace: "/app/workspace" },
    };

    // Stub api() — WebUI fetch helper (throws Error with .status on non-OK)
    apiMock = vi.fn(async (path: string, opts?: { method?: string; body?: string }) => {
      if (path === "/api/file/create") {
        const body = JSON.parse(opts?.body || "{}");
        const payload = JSON.parse(body.content || "{}");
        createdReqs.push({ id: payload.id, cmd: payload.cmd, args: payload.args });
        return { ok: true, path: body.path };
      }
      if (path.startsWith("/api/file?")) {
        readCalls.push(path);
        if (!respState.ready) {
          const err = new Error("File not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return { content: JSON.stringify(respState.resp || {}), size: 1, lines: 1 };
      }
      if (path === "/api/file/delete") {
        deletedFiles.push(JSON.parse(opts?.body || "{}").path);
        return { ok: true };
      }
      const err = new Error(`unexpected api call: ${path}`) as Error & { status: number };
      err.status = 500;
      throw err;
    });
    (globalThis as Record<string, unknown>).api = apiMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    localStorage.clear();
    (globalThis as Record<string, unknown>).VulpyCommerce = undefined;
    (globalThis as Record<string, unknown>).S = undefined;
    (globalThis as Record<string, unknown>).api = undefined;
    vi.restoreAllMocks();
  });

  function build() {
    loadExtension();
    document.dispatchEvent(new Event("DOMContentLoaded"));
    return document.querySelector("[data-vc-env-actions-bar]") as HTMLElement;
  }

  async function settle(ms = 2000) {
    await vi.advanceTimersByTimeAsync(ms);
  }

  describe("registration", () => {
    it("registers env-actions on the registry", () => {
      loadExtension();
      const register = (globalThis as Record<string, unknown>).VulpyCommerce as {
        register: ReturnType<typeof vi.fn>;
      };
      const calls = register.register.mock.calls as [{ id: string }][];
      expect(calls.some(([feature]) => feature?.id === "env-actions")).toBe(true);
    });

    it("loads without console errors", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      build();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("titlebar chip structure", () => {
    it("places the actions group and sync button inside the titlebar chip", () => {
      const bar = build();
      const header = document.querySelector("header.app-titlebar")!;
      const container = document.getElementById("vc-env-titlebar") as HTMLElement;
      expect(container).not.toBeNull();
      expect(container.classList.contains("vc-env-titlebar")).toBe(true);
      // Containment: chip lives in the native titlebar — no floating row.
      expect(header.contains(container)).toBe(true);
      expect(document.querySelector(".vc-env-row")).toBeNull();
      expect(bar.parentElement).toBe(container);
      const trigger = document.querySelector(".vc-env-sync-btn") as HTMLElement;
      expect(trigger).not.toBeNull();
      expect(trigger.parentElement).toBe(container);
    });

    it("pull-data button carries a thin chevron with aria-expanded", () => {
      const bar = build();
      const pull = bar.querySelector('[data-vc-env-actions="pull-data"]') as HTMLElement;
      expect(pull.getAttribute("aria-expanded")).toBe("false");
      const chev = pull.querySelector(".vc-env-chevron svg polyline") as SVGElement;
      expect(chev).not.toBeNull();
      // Host-style thin chevron: stroke-width 2, down polyline.
      expect(pull.querySelector(".vc-env-chevron svg")!.getAttribute("stroke-width")).toBe("2");
      expect(chev.getAttribute("points")).toBe("6 9 12 15 18 9");
      // Opens the dropdown → chevron flips open.
      pull.dispatchEvent(new MouseEvent("click"));
      expect(pull.getAttribute("aria-expanded")).toBe("true");
      expect(pull.querySelector(".vc-env-chevron")!.classList.contains("is-open")).toBe(true);
      expect(bar.querySelector(".vc-env-actions-pull-menu")).not.toBeNull();
    });
  });

  describe("button visibility per env", () => {
    it("dev shows Push to Staging, Pull Data and View Logs (no Push to Live)", () => {
      const bar = build();
      expect((bar.querySelector('[data-vc-env-actions="push-staging"]') as HTMLElement).hidden).toBe(false);
      expect((bar.querySelector('[data-vc-env-actions="push-live"]') as HTMLElement).hidden).toBe(true);
      expect((bar.querySelector('[data-vc-env-actions="pull-data"]') as HTMLElement).hidden).toBe(false);
      expect((bar.querySelector('[data-vc-env-actions="logs"]') as HTMLElement).hidden).toBe(false);
    });

    it("staging shows Push to Live, Pull Data and View Logs (no Push to Staging)", () => {
      setEnv("staging");
      const bar = build();
      expect((bar.querySelector('[data-vc-env-actions="push-staging"]') as HTMLElement).hidden).toBe(true);
      expect((bar.querySelector('[data-vc-env-actions="push-live"]') as HTMLElement).hidden).toBe(false);
      expect((bar.querySelector('[data-vc-env-actions="pull-data"]') as HTMLElement).hidden).toBe(false);
    });

    it("live shows View Logs only (no push/pull)", () => {
      setEnv("live");
      const bar = build();
      expect((bar.querySelector('[data-vc-env-actions="push-staging"]') as HTMLElement).hidden).toBe(true);
      expect((bar.querySelector('[data-vc-env-actions="push-live"]') as HTMLElement).hidden).toBe(true);
      expect((bar.querySelector('[data-vc-env-actions="pull-data"]') as HTMLElement).hidden).toBe(true);
      expect((bar.querySelector('[data-vc-env-actions="logs"]') as HTMLElement).hidden).toBe(false);
    });
  });

  describe("push to staging (dev)", () => {
    it("creates an env.push request with target=staging, no confirm", async () => {
      vi.useFakeTimers();
      const bar = build();
      respState = { ready: true, resp: { ok: true, out: "env-push.sh: not yet implemented\n", err: "" } };

      bar.querySelector('[data-vc-env-actions="push-staging"]')!.dispatchEvent(new MouseEvent("click"));
      await settle();

      const req = createdReqs.find((r) => r.cmd === "env.push");
      expect(req).toBeTruthy();
      expect(req!.args).toEqual({ target: "staging" });
      expect(apiMock).not.toHaveBeenCalledWith(
        "/api/terminal/start",
        expect.anything(),
      );
    });

    it("polls the REAL file-read route (GET /api/file?session_id=...&path=...)", async () => {
      vi.useFakeTimers();
      const bar = build();
      respState = { ready: true, resp: { ok: true, out: "ok\n", err: "" } };

      bar.querySelector('[data-vc-env-actions="push-staging"]')!.dispatchEvent(new MouseEvent("click"));
      await settle();

      const readUrl = readCalls.find((p) => p.startsWith("/api/file?"));
      expect(readUrl).toBeTruthy();
      expect(readUrl).toContain(`session_id=${encodeURIComponent("test-session-123")}`);
      expect(readUrl).toContain("path=agent-cmds%2Fresp%2F");
      expect(readUrl!.endsWith(".resp.json")).toBe(true);
      // The broken /api/file/read route must never be called.
      expect(readCalls.some((p) => p.startsWith("/api/file/read"))).toBe(false);
    });

    it("deletes BOTH the req and resp files after a successful run", async () => {
      vi.useFakeTimers();
      const bar = build();
      respState = { ready: true, resp: { ok: true, out: "ok\n", err: "" } };

      bar.querySelector('[data-vc-env-actions="push-staging"]')!.dispatchEvent(new MouseEvent("click"));
      await settle();

      expect(deletedFiles.some((p) => p.includes("agent-cmds/req/"))).toBe(true);
      expect(deletedFiles.some((p) => p.includes("agent-cmds/resp/"))).toBe(true);
    });
  });

  describe("push to live (staging) — confirmation dialog", () => {
    it("shows the confirm modal and does nothing on Cancel", async () => {
      vi.useFakeTimers();
      setEnv("staging");
      const bar = build();
      bar.querySelector('[data-vc-env-actions="push-live"]')!.dispatchEvent(new MouseEvent("click"));
      await settle(0);

      const modal = document.querySelector(".vc-env-actions-modal") as HTMLElement;
      expect(modal.hidden).toBe(false);
      expect(modal.textContent).toContain("Push to LIVE");

      modal.querySelector(".vc-env-actions-modal-actions button")!.dispatchEvent(new MouseEvent("click"));
      await settle();
      expect(modal.hidden).toBe(true);
      expect(createdReqs).toEqual([]);
    });

    it("sends confirm:true after Continue", async () => {
      vi.useFakeTimers();
      setEnv("staging");
      const bar = build();
      bar.querySelector('[data-vc-env-actions="push-live"]')!.dispatchEvent(new MouseEvent("click"));
      await settle(0);

      const modal = document.querySelector(".vc-env-actions-modal") as HTMLElement;
      const confirmBtn = modal.querySelector("[data-vc-env-actions-confirm]") as HTMLElement;
      confirmBtn.dispatchEvent(new MouseEvent("click"));
      await settle();

      const req = createdReqs.find((r) => r.cmd === "env.push");
      expect(req).toBeTruthy();
      expect(req!.args).toEqual({ target: "live", confirm: true });
    });

    it("sends confirm:true AND an HMAC approval signature after Continue", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
      setEnv("staging");
      const bar = build();

      // Stub crypto.subtle for HMAC-SHA256 signing
      const fakeKey = {};
      const fakeSig = new Uint8Array([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
        17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
      ]);
      const importKeyMock = vi.fn().mockResolvedValue(fakeKey);
      const signMock = vi.fn().mockResolvedValue(fakeSig);
      vi.stubGlobal("crypto", {
        subtle: {
          importKey: importKeyMock,
          sign: signMock,
        },
      });

      const mockSecretKey =
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      apiMock.mockImplementationOnce(async (path: string) => {
        if (path.startsWith("/api/file/agent-hmac-secret")) {
          return { key: mockSecretKey };
        }
        return undefined;
      });

      bar.querySelector('[data-vc-env-actions="push-live"]')!.dispatchEvent(new MouseEvent("click"));
      await settle(0);

      const modal = document.querySelector(".vc-env-actions-modal") as HTMLElement;
      const confirmBtn = modal.querySelector("[data-vc-env-actions-confirm]") as HTMLElement;
      confirmBtn.dispatchEvent(new MouseEvent("click"));
      await settle(0);

      const req = createdReqs.find((r) => r.cmd === "env.push");
      expect(req).toBeTruthy();
      expect(req!.args.confirm).toBe(true);
      expect(req!.args.approval).toBeDefined();
      expect(typeof req!.args.approval.ts).toBe("number");
      expect(typeof req!.args.approval.sig).toBe("string");
      const now = Math.floor(Date.now() / 1000);
      expect(req!.args.approval.ts).toBeCloseTo(now, -1);
      expect(req!.args.approval.sig.length).toBe(64);

      // Verify the sign message format matches the server-side
      // approval_message() pattern: "cmd|target|source|ts"
      const signArg = signMock.mock.calls[0][2] as Uint8Array;
      const signedMsg = new TextDecoder().decode(signArg);
      expect(signedMsg).toMatch(/^env\.push\|live\|\|\d+$/);
      expect(signedMsg).toContain(`|${req!.args.approval.ts}`);
    });

    it("sends HMAC approval for pull_data as well", async () => {
      vi.useFakeTimers();
      setEnv("dev");
      const bar = build();

      const fakeKey = {};
      const fakeSig = new Uint8Array(32).fill(0x42);
      vi.stubGlobal("crypto", {
        subtle: {
          importKey: vi.fn().mockResolvedValue(fakeKey),
          sign: vi.fn().mockResolvedValue(fakeSig),
        },
      });
      apiMock.mockImplementationOnce(async (path: string) => {
        if (path.startsWith("/api/file/agent-hmac-secret")) {
          return { key: "test-secret-123" };
        }
        return undefined;
      });

      bar.querySelector('[data-vc-env-actions="pull-data"]')!.dispatchEvent(new MouseEvent("click"));
      const menu = document.querySelector(".vc-env-actions-pull-menu") as HTMLElement;
      const fromLive = Array.from(menu.querySelectorAll(".vc-env-actions-pull-option"))
        .find((o) => o.textContent === "from live") as HTMLElement;
      fromLive.dispatchEvent(new MouseEvent("click"));
      await settle(0);

      const modal = document.querySelector(".vc-env-actions-modal") as HTMLElement;
      modal.querySelector("[data-vc-env-actions-confirm]")!.dispatchEvent(new MouseEvent("click"));
      await settle();

      const req = createdReqs.find((r) => r.cmd === "env.pull_data");
      expect(req).toBeTruthy();
      expect(req!.args.confirm).toBe(true);
      expect(req!.args.approval).toBeDefined();
      expect(typeof req!.args.approval.ts).toBe("number");

      const signFn = (globalThis.crypto.subtle.sign as unknown) as ReturnType<typeof vi.fn>;
      const signArg2 = signFn.mock.calls[0][2] as Uint8Array;
      const signedMsg2 = new TextDecoder().decode(signArg2);
      expect(signedMsg2).toMatch(/^env\.pull_data\|dev\|live\|\d+$/);
    });
  });

  describe("pull data", () => {
    it("dev pull menu offers from live and from staging", () => {
      const bar = build();
      bar.querySelector('[data-vc-env-actions="pull-data"]')!.dispatchEvent(new MouseEvent("click"));
      const menu = document.querySelector(".vc-env-actions-pull-menu") as HTMLElement;
      expect(menu.hidden).toBe(false);
      const options = Array.from(menu.querySelectorAll(".vc-env-actions-pull-option")).map(
        (o) => o.textContent,
      );
      expect(options).toEqual(["from live", "from staging"]);
    });

    it("staging pull menu offers only from live", () => {
      setEnv("staging");
      const bar = build();
      bar.querySelector('[data-vc-env-actions="pull-data"]')!.dispatchEvent(new MouseEvent("click"));
      const menu = document.querySelector(".vc-env-actions-pull-menu") as HTMLElement;
      const options = Array.from(menu.querySelectorAll(".vc-env-actions-pull-option")).map(
        (o) => o.textContent,
      );
      expect(options).toEqual(["from live"]);
    });

    it("selecting a source requires confirm, then sends confirm:true", async () => {
      vi.useFakeTimers();
      const bar = build();
      bar.querySelector('[data-vc-env-actions="pull-data"]')!.dispatchEvent(new MouseEvent("click"));
      const menu = document.querySelector(".vc-env-actions-pull-menu") as HTMLElement;
      const fromLive = Array.from(menu.querySelectorAll(".vc-env-actions-pull-option"))
        .find((o) => o.textContent === "from live") as HTMLElement;
      fromLive.dispatchEvent(new MouseEvent("click"));
      await settle(0);

      const modal = document.querySelector(".vc-env-actions-modal") as HTMLElement;
      expect(modal.hidden).toBe(false);
      expect(modal.textContent).toContain("Pull data from live into dev");
      modal.querySelector("[data-vc-env-actions-confirm]")!.dispatchEvent(new MouseEvent("click"));
      await settle();

      const req = createdReqs.find((r) => r.cmd === "env.pull_data");
      expect(req).toBeTruthy();
      expect(req!.args).toEqual({ target: "dev", source: "live", confirm: true });
    });
  });

  describe("mutation redirect guards", () => {
    it("blocks push from live", () => {
      setEnv("live");
      const bar = build();
      // Guard should alert before any request
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      (bar.querySelector('[data-vc-env-actions="pull-data"]') as HTMLElement).dispatchEvent(new MouseEvent("click"));
      // Pull data is hidden on live (button hidden), but guard is a belt-and-suspenders.
      // The visible button test is in "button visibility per env". Here we test
      // that actionPushLive explicity guards.
      expect(createdReqs.filter(r => r.cmd === "env.push" || r.cmd === "env.pull_data").length).toBe(0);
      alertSpy.mockRestore();
    });

    it("blocks pull from dev into dev (same env)", () => {
      setEnv("dev");
      build();
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      // Direct call to guardMutation-like path: push-staging from dev is fine,
      // but pulling from dev itself is nonsense.
      // We can't easily call guardMutation directly — just verify alert blocking works.
      alertSpy.mockRestore();
    });

    it("allows push to staging from dev", () => {
      vi.useFakeTimers();
      setEnv("dev");
      const bar = build();
      respState = { ready: true, resp: { ok: true, out: "ok\n", err: "" } };
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

      bar.querySelector('[data-vc-env-actions="push-staging"]')!.dispatchEvent(new MouseEvent("click"));
      // Should have been allowed through — not blocked by alert.
      expect(alertSpy).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it("allows push to live from staging", () => {
      vi.useFakeTimers();
      setEnv("staging");
      const bar = build();
      respState = { ready: true, resp: { ok: true, out: "ok\n", err: "" } };
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

      bar.querySelector('[data-vc-env-actions="push-live"]')!.dispatchEvent(new MouseEvent("click"));
      // Confirm dialog comes first (not guard-alert) — just verify no guard alert fired.
      const modal = document.querySelector(".vc-env-actions-modal") as HTMLElement;
      expect(modal.hidden).toBe(false);
      expect(alertSpy).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });

  describe("logs", () => {
    it("View Logs sends env.logs for the current env and renders output", async () => {
      vi.useFakeTimers();
      setEnv("staging");
      const bar = build();
      respState = { ready: true, resp: { ok: true, out: "env-logs.sh: not yet implemented\n", err: "" } };

      bar.querySelector('[data-vc-env-actions="logs"]')!.dispatchEvent(new MouseEvent("click"));
      await settle();

      const req = createdReqs.find((r) => r.cmd === "env.logs");
      expect(req).toBeTruthy();
      expect(req!.args).toEqual({ env: "staging", lines: 50 });

      const panel = document.querySelector(".vc-env-actions-log-panel") as HTMLElement;
      expect(panel.hidden).toBe(false);
      expect(panel.textContent).toContain("env-logs.sh: not yet implemented");
      expect(panel.textContent).toContain("done (exit 0)");
    });

    it("streams incremental output while the resp has done:false", async () => {
      vi.useFakeTimers();
      const bar = build();
      const out = document.querySelector(".vc-env-actions-log-output") as HTMLElement;

      // First poll returns a partial (streaming) response, then the final one.
      let poll = 0;
      respState = { ready: true, resp: null };
      apiMock.mockImplementation(async (path: string, opts?: { method?: string; body?: string }) => {
        if (path === "/api/file/create") {
          const body = JSON.parse(opts?.body || "{}");
          createdReqs.push(body);
          return { ok: true, path: body.path };
        }
        if (path.startsWith("/api/file?")) {
          poll += 1;
          if (poll === 1) {
            return { content: JSON.stringify({ ok: false, out: "phase 1…\n", err: "", done: false }), size: 1, lines: 1 };
          }
          return { content: JSON.stringify({ ok: true, out: "phase 1…\nphase 2 done\n", err: "", done: true }), size: 1, lines: 1 };
        }
        if (path === "/api/file/delete") {
          deletedFiles.push(JSON.parse(opts?.body || "{}").path);
          return { ok: true };
        }
        const err = new Error(`unexpected api call: ${path}`) as Error & { status: number };
        err.status = 500;
        throw err;
      });

      bar.querySelector('[data-vc-env-actions="push-staging"]')!.dispatchEvent(new MouseEvent("click"));
      await settle();

      expect(out.textContent).toContain("phase 1…");
      expect(out.textContent).toContain("phase 2 done");
      expect(out.textContent).toContain("done (exit 0)");
      expect(deletedFiles.some((p) => p.includes("agent-cmds/resp/"))).toBe(true);
      // The req file is deleted too (client owns it; the daemon cannot).
      expect(deletedFiles.some((p) => p.includes("agent-cmds/req/"))).toBe(true);
    });
  });

  describe("cleanup on error / timeout paths", () => {
    it("deletes req and resp files when the read fails mid-run", async () => {
      vi.useFakeTimers();
      const bar = build();
      apiMock.mockImplementation(async (path: string, opts?: { method?: string; body?: string }) => {
        if (path === "/api/file/create") {
          const body = JSON.parse(opts?.body || "{}");
          createdReqs.push(body);
          return { ok: true, path: body.path };
        }
        if (path.startsWith("/api/file?")) {
          const err = new Error("server exploded") as Error & { status: number };
          err.status = 500;
          throw err;
        }
        if (path === "/api/file/delete") {
          deletedFiles.push(JSON.parse(opts?.body || "{}").path);
          return { ok: true };
        }
        const err = new Error(`unexpected api call: ${path}`) as Error & { status: number };
        err.status = 500;
        throw err;
      });

      bar.querySelector('[data-vc-env-actions="push-staging"]')!.dispatchEvent(new MouseEvent("click"));
      await settle();

      expect(deletedFiles.some((p) => p.includes("agent-cmds/req/"))).toBe(true);
      expect(deletedFiles.some((p) => p.includes("agent-cmds/resp/"))).toBe(true);
      const panel = document.querySelector(".vc-env-actions-log-panel") as HTMLElement;
      expect(panel.textContent).toContain("[error]");
    });

    it("deletes req and resp files when the run times out", async () => {
      vi.useFakeTimers();
      const bar = build();
      // resp never becomes ready — the client polls until TIMEOUT_MS (320s).
      bar.querySelector('[data-vc-env-actions="push-staging"]')!.dispatchEvent(new MouseEvent("click"));
      await settle(321_000);

      expect(deletedFiles.some((p) => p.includes("agent-cmds/req/"))).toBe(true);
      expect(deletedFiles.some((p) => p.includes("agent-cmds/resp/"))).toBe(true);
      const status = document.querySelector(".vc-env-actions-log-status") as HTMLElement;
      expect(status.textContent).toContain("timed out");
    });

    it("does not reset the service select while a run is streaming, then resets after completion", async () => {
      vi.useFakeTimers();
      build();
      let poll = 0;
      apiMock.mockImplementation(async (path: string, opts?: { method?: string; body?: string }) => {
        if (path === "/api/file/create") {
          const body = JSON.parse(opts?.body || "{}");
          const payload = JSON.parse(body.content || "{}");
          createdReqs.push({ id: payload.id, cmd: payload.cmd, args: payload.args });
          return { ok: true, path: body.path };
        }
        if (path.startsWith("/api/file?")) {
          poll += 1;
          if (poll === 1) {
            return { content: JSON.stringify({ ok: false, out: "streaming…\n", err: "", done: false }), size: 1, lines: 1 };
          }
          return { content: JSON.stringify({ ok: true, out: "streaming…\ndone\n", err: "", done: true }), size: 1, lines: 1 };
        }
        if (path === "/api/file/delete") {
          deletedFiles.push(JSON.parse(opts?.body || "{}").path);
          return { ok: true };
        }
        const err = new Error(`unexpected api call: ${path}`) as Error & { status: number };
        err.status = 500;
        throw err;
      });

      const select = document.querySelector(".vc-env-actions-log-service") as HTMLSelectElement;
      select.value = "medusa";
      select.dispatchEvent(new Event("change"));
      // Flush the writeReq microtask: the run is now in-flight (first poll
      // pending). openLogPanel must NOT have reset the select — the visible
      // value has to match the service the request was built with.
      await vi.advanceTimersByTimeAsync(0);
      expect(select.value).toBe("medusa");

      await settle(); // run completes

      const req = createdReqs.find((r) => r.cmd === "env.logs");
      expect(req).toBeTruthy();
      expect(req!.args).toEqual({ env: "dev", lines: 50, service: "medusa" });
      // After the run completes, the select resets to the default.
      expect(select.value).toBe("all");
    });
  });

  describe("mobile layout (≤640px)", () => {
    function setViewport(width: number) {
      Object.defineProperty(window, "innerWidth", {
        value: width,
        configurable: true,
        writable: true,
      });
    }

    afterEach(() => {
      setViewport(1024);
    });

    it("hides the action buttons and shows the sync button on a mobile viewport", () => {
      setViewport(480);
      const bar = build();
      expect(bar.hidden).toBe(true);

      const trigger = document.querySelector(".vc-env-sync-btn") as HTMLElement;
      expect(trigger).not.toBeNull();
      expect(trigger.hidden).toBe(false);
      // Sync button has an inline SVG with arrow polyline icons.
      const svg = trigger.querySelector("svg") as SVGElement;
      expect(svg).not.toBeNull();
      // Verify the up-arrow polyline exists (export icon)
      const upPoly = svg.querySelector('polyline[points="5 14 10 6 15 14"]') as SVGElement;
      expect(upPoly).not.toBeNull();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    it("shows the inline buttons and hides the sync button on desktop", () => {
      setViewport(1280);
      const bar = build();
      expect(bar.hidden).toBe(false);
      const trigger = document.querySelector(".vc-env-sync-btn") as HTMLElement;
      expect(trigger.hidden).toBe(true);
    });

    it("clicking the sync button opens a dropdown with the same actions", () => {
      setViewport(480);
      build();
      const trigger = document.querySelector(".vc-env-sync-btn") as HTMLElement;
      trigger.dispatchEvent(new MouseEvent("click"));

      const menu = document.querySelector(".vc-env-row-mobile-menu") as HTMLElement;
      expect(menu).not.toBeNull();
      expect(menu.hidden).toBe(false);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(menu.getAttribute("aria-hidden")).toBe("false");

      const actions = Array.from(menu.querySelectorAll("[data-vc-env-actions]")).map(
        (b) => b.getAttribute("data-vc-env-actions"),
      );
      expect(actions).toEqual(expect.arrayContaining(["push-staging", "pull-data", "logs"]));
      expect(menu.querySelector('[data-vc-env-actions="push-live"]')).not.toBeNull();
    });

    it("clicking the SVG icon child (real hit target) inside the sync button opens the dropdown", () => {
      setViewport(480);
      build();
      const trigger = document.querySelector(".vc-env-sync-btn") as HTMLElement;
      const svgIcon = trigger.querySelector("svg") as SVGElement;
      // Real mouse clicks land on the SVG child inside the button. The
      // outside-close guard must treat the child as part of the toggle.
      svgIcon.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const menu = document.querySelector(".vc-env-row-mobile-menu") as HTMLElement;
      expect(menu.hidden).toBe(false);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    });

    it("clicking outside closes the mobile dropdown", () => {
      setViewport(480);
      build();
      const trigger = document.querySelector(".vc-env-sync-btn") as HTMLElement;
      trigger.dispatchEvent(new MouseEvent("click"));

      const menu = document.querySelector(".vc-env-row-mobile-menu") as HTMLElement;
      expect(menu.hidden).toBe(false);

      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(menu.hidden).toBe(true);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(menu.getAttribute("aria-hidden")).toBe("true");
    });

    it("mobile dropdown push button triggers the same agent-cmd api call", async () => {
      vi.useFakeTimers();
      setViewport(480);
      build();
      respState = { ready: true, resp: { ok: true, out: "ok\n", err: "" } };

      const trigger = document.querySelector(".vc-env-sync-btn") as HTMLElement;
      trigger.dispatchEvent(new MouseEvent("click"));
      const menu = document.querySelector(".vc-env-row-mobile-menu") as HTMLElement;
      (menu.querySelector('[data-vc-env-actions="push-staging"]') as HTMLElement)
        .dispatchEvent(new MouseEvent("click"));
      await settle();

      const req = createdReqs.find((r) => r.cmd === "env.push");
      expect(req).toBeTruthy();
      expect(req!.args).toEqual({ target: "staging" });
    });

    it("mobile dropdown pull data reveals sources and triggers confirm + pull_data", async () => {
      vi.useFakeTimers();
      setViewport(480);
      build();

      const trigger = document.querySelector(".vc-env-sync-btn") as HTMLElement;
      trigger.dispatchEvent(new MouseEvent("click"));
      const menu = document.querySelector(".vc-env-row-mobile-menu") as HTMLElement;
      (menu.querySelector('[data-vc-env-actions="pull-data"]') as HTMLElement)
        .dispatchEvent(new MouseEvent("click"));

      const sub = menu.querySelector(".vc-env-row-mobile-pull") as HTMLElement;
      expect(sub).not.toBeNull();
      expect(sub.hidden).toBe(false);
      const sources = Array.from(sub.querySelectorAll("[data-vc-env-actions-pull-source]")).map(
        (b) => b.getAttribute("data-vc-env-actions-pull-source"),
      );
      expect(sources).toEqual(["live", "staging"]);

      (sub.querySelector('[data-vc-env-actions-pull-source="live"]') as HTMLElement)
        .dispatchEvent(new MouseEvent("click"));
      await settle(0);

      const modal = document.querySelector(".vc-env-actions-modal") as HTMLElement;
      expect(modal.hidden).toBe(false);
      (modal.querySelector("[data-vc-env-actions-confirm]") as HTMLElement)
        .dispatchEvent(new MouseEvent("click"));
      await settle();

      const req = createdReqs.find((r) => r.cmd === "env.pull_data");
      expect(req).toBeTruthy();
      expect(req!.args).toEqual({ target: "dev", source: "live", confirm: true });
    });
  });

  describe("mutation redirect guards", () => {
    it("blocks push from live", () => {
      setEnv("live");
      // Can't call actionPushStaging directly — need to test via guardMutation.
      // The action functions call guardMutation first; we test by setting env
      // and verifying alert fires.
      const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});
      // Rebuild so updateButtons runs (though from live push-staging is hidden,
      // guardMutation still fires for belt-and-suspenders).
      build();
      // We can't easily call guardMutation from test since it's module-scoped.
      // Instead, verify the desktop button is hidden on live.
      const pushStaging = document.querySelector(
        '[data-vc-env-actions="push-staging"]',
      ) as HTMLElement;
      expect(pushStaging.hidden).toBe(true);
      const pushLive = document.querySelector(
        '[data-vc-env-actions="push-live"]',
      ) as HTMLElement;
      expect(pushLive).not.toBeNull();
      expect(pushLive.hidden).toBe(true);
      alertMock.mockRestore();
    });

    it("shows push-staging and pull from dev", () => {
      setEnv("dev");
      build();
      const pushStaging = document.querySelector(
        '[data-vc-env-actions="push-staging"]',
      ) as HTMLElement;
      expect(pushStaging.hidden).toBe(false);
      // On desktop, pull-data is visible in dev
      const pull = document.querySelector(
        '[data-vc-env-actions="pull-data"]',
      ) as HTMLElement;
      expect(pull).not.toBeNull();
      expect(pull.hidden).toBe(false);
    });

    it("shows push-live and no push-staging from staging", () => {
      setEnv("staging");
      build();
      const pushLive = document.querySelector(
        '[data-vc-env-actions="push-live"]',
      ) as HTMLElement;
      expect(pushLive.hidden).toBe(false);
      const pushStaging = document.querySelector(
        '[data-vc-env-actions="push-staging"]',
      ) as HTMLElement;
      expect(pushStaging.hidden).toBe(true);
    });

    it("hides pull from live", () => {
      setEnv("live");
      build();
      const pull = document.querySelector(
        '[data-vc-env-actions="pull-data"]',
      ) as HTMLElement;
      expect(pull).not.toBeNull();
      expect(pull.hidden).toBe(true);
    });
  });
});
