// @vitest-environment jsdom
/**
 * Tests for the vulpy-commerce-access-mode feature.
 *
 * The feature is INVISIBLE (no DOM). On every session load/send it reads the
 * real page origin via `window.location.hostname`, classifies it exactly into
 * tailscale (`*.ts.net`) / public (`admin.*` or any other non-loopback host) /
 * local (`localhost`, `127.0.0.1`, `::1`, `[::1]`), and POSTs ONLY the
 * normalized {mode, origin} keyed by the active session id to the same-origin
 * WebUI endpoint `/api/access-mode`. No paths, no HTML, no free text.
 *
 * The server persists it per session so the agent prompt for each run can be
 * told the operator's actual access mode (instead of globally preferring
 * Tailscale whenever the sidecar is up).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION_PATH = join(
  import.meta.dirname,
  "..",
  "features",
  "vulpy-commerce-access-mode",
  "index.js",
);

function loadExtension() {
  const code = readFileSync(EXTENSION_PATH, "utf-8");
  new Function(code)();
}

describe("vulpy-commerce-access-mode", () => {
  let eventHandlers: Map<string, Array<(...args: unknown[]) => void>>;
  let apiMock: ReturnType<typeof vi.fn>;
  let windowListeners: Map<string, Array<(...args: unknown[]) => void>>;

  function fireSessionLoaded(data: Record<string, unknown>) {
    const handlers = eventHandlers.get("session:loaded");
    if (!handlers) { return; }
    for (const h of handlers.slice()) { h(data); }
  }

  function fireWindowEvent(type: string, detail: unknown) {
    const handlers = windowListeners.get(type);
    if (!handlers) { return; }
    for (const h of handlers.slice()) { h({ detail }); }
  }

  function setHostname(hostname: string) {
    Object.defineProperty(window, "location", {
      value: { protocol: "https:", hostname, host: hostname, href: `https://${hostname}/` },
      writable: true,
      configurable: true,
    });
  }

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    eventHandlers = new Map();
    windowListeners = new Map();

    // Stub VulpyCommerce core
    (globalThis as Record<string, unknown>).VulpyCommerce = {
      register: vi.fn(),
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        if (!eventHandlers.has(event)) { eventHandlers.set(event, []); }
        eventHandlers.get(event)!.push(fn);
      }),
      emit: vi.fn(),
      getConfig: () => ({}),
      loadConfig: () => Promise.resolve({}),
    };

    // Stub S (WebUI global state)
    (globalThis as Record<string, unknown>).S = {
      session: { session_id: "test-session-123" },
    };

    // Capture window event listeners (hermes:message-sent)
    vi.spyOn(window, "addEventListener").mockImplementation(
      ((type: string, fn: EventListenerOrEventListenerObject) => {
        if (typeof fn === "function") {
          if (!windowListeners.has(type)) { windowListeners.set(type, []); }
          windowListeners.get(type)!.push(fn as (...args: unknown[]) => void);
        }
        return undefined;
      }) as typeof window.addEventListener,
    );

    // Stub the WebUI api() global
    apiMock = vi.fn().mockResolvedValue({ ok: true });
    (globalThis as Record<string, unknown>).api = apiMock;

    setHostname("127.0.0.1");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    (globalThis as Record<string, unknown>).VulpyCommerce = undefined;
    (globalThis as Record<string, unknown>).S = undefined;
    (globalThis as Record<string, unknown>).api = undefined;
    vi.restoreAllMocks();
  });

  describe("origin classification (detectAccessModeHost)", () => {
    it("classifies *.ts.net hostnames as tailscale", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as {
        detectAccessModeHost?: (h: string) => string;
      };
      expect(vc.detectAccessModeHost!("vulpy-commerce-private.tail873f17.ts.net")).toBe("tailscale");
    });

    it("classifies admin.<domain> as public", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as {
        detectAccessModeHost?: (h: string) => string;
      };
      expect(vc.detectAccessModeHost!("admin.myshop.com")).toBe("public");
    });

    it("classifies other non-loopback public hosts as public", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as {
        detectAccessModeHost?: (h: string) => string;
      };
      expect(vc.detectAccessModeHost!("myshop.com")).toBe("public");
      expect(vc.detectAccessModeHost!("api.myshop.com")).toBe("public");
    });

    it("classifies localhost / 127.0.0.1 / ::1 / [::1] as local", () => {
      loadExtension();
      const vc = (globalThis as Record<string, unknown>).VulpyCommerce as {
        detectAccessModeHost?: (h: string) => string;
      };
      expect(vc.detectAccessModeHost!("localhost")).toBe("local");
      expect(vc.detectAccessModeHost!("127.0.0.1")).toBe("local");
      expect(vc.detectAccessModeHost!("::1")).toBe("local");
      expect(vc.detectAccessModeHost!("[::1]")).toBe("local");
    });
  });

  describe("reporting on session load/send", () => {
    it("POSTs the normalized {session_id, mode, origin} to /api/access-mode on session:loaded", () => {
      setHostname("vulpy-commerce-private.tail873f17.ts.net");
      loadExtension();
      fireSessionLoaded({ session_id: "test-session-123", env: null });

      expect(apiMock).toHaveBeenCalledTimes(1);
      const [path, opts] = apiMock.mock.calls[0] as [string, { method: string; body: string }];
      expect(path).toBe("/api/access-mode");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body) as Record<string, string>;
      expect(body).toEqual({
        session_id: "test-session-123",
        mode: "tailscale",
        origin: "vulpy-commerce-private.tail873f17.ts.net",
      });
    });

    it("reports public mode for admin.<domain>", () => {
      setHostname("admin.myshop.com");
      loadExtension();
      fireSessionLoaded({ session_id: "test-session-123", env: null });

      const body = JSON.parse((apiMock.mock.calls[0][1] as { body: string }).body) as Record<string, string>;
      expect(body.mode).toBe("public");
      expect(body.origin).toBe("admin.myshop.com");
    });

    it("reports local mode for loopback", () => {
      setHostname("127.0.0.1");
      loadExtension();
      fireSessionLoaded({ session_id: "test-session-123", env: null });

      const body = JSON.parse((apiMock.mock.calls[0][1] as { body: string }).body) as Record<string, string>;
      expect(body.mode).toBe("local");
      expect(body.origin).toBe("127.0.0.1");
    });

    it("reports again when the session id changes (new session)", () => {
      setHostname("myshop.com");
      loadExtension(); // boot report for test-session-123
      fireSessionLoaded({ session_id: "sess-a", env: null });
      fireSessionLoaded({ session_id: "sess-b", env: null });

      // boot (test-session-123) + sess-a + sess-b
      expect(apiMock).toHaveBeenCalledTimes(3);
      const secondBody = JSON.parse((apiMock.mock.calls[2][1] as { body: string }).body) as Record<string, string>;
      expect(secondBody.session_id).toBe("sess-b");
      expect(secondBody.mode).toBe("public");
    });

    it("does not spam duplicate posts for the same session + origin on send events", () => {
      setHostname("myshop.com");
      loadExtension();
      fireSessionLoaded({ session_id: "test-session-123", env: null });
      // Same session, same origin — send event must NOT fire another POST.
      fireWindowEvent("hermes:message-sent", { sessionId: "test-session-123" });
      expect(apiMock).toHaveBeenCalledTimes(1);
    });

    it("sends NO arbitrary paths/HTML in the payload", () => {
      setHostname("admin.myshop.com");
      loadExtension();
      fireSessionLoaded({ session_id: "test-session-123", env: null });

      const raw = (apiMock.mock.calls[0][1] as { body: string }).body;
      expect(raw).not.toMatch(/[<>]/);            // no HTML
      expect(raw).not.toMatch(/\//);              // no paths
      expect(raw).not.toMatch(/\.\./);            // no traversal
    });

    it("does not fire a POST when there is no active session", () => {
      (globalThis as Record<string, unknown>).S = { session: null };
      loadExtension();
      expect(apiMock).not.toHaveBeenCalled();
    });
  });

  describe("invisibility contract", () => {
    it("renders NO DOM and injects no CSS", () => {
      loadExtension();
      expect(document.querySelector("[data-vc]")).toBeNull();
      expect(document.querySelectorAll("[data-vc-access-mode]").length).toBe(0);
      expect(document.head.querySelectorAll("style").length).toBe(0);
    });
  });
});
