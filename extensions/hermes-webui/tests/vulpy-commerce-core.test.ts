// @vitest-environment jsdom
/**
 * Tests for the vulpy-commerce-core session watcher.
 *
 * The WebUI swaps S.session in-page on session switch (no DOM event), so the
 * core polls S.session.session_id and emits "session:loaded" whenever the
 * active session changes (including the first detection). env-context and
 * env-actions listen for that event to show the new-conversation env picker
 * and re-sync their UI for the new session's env.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION_PATH = join(
  import.meta.dirname,
  "..",
  "features",
  "vulpy-commerce-core",
  "index.js",
);

function loadCore() {
  const code = readFileSync(EXTENSION_PATH, "utf-8");
  new Function(code)();
}

describe("vulpy-commerce-core session watcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).S = {
      session: { session_id: "sess-a" },
    };
    (globalThis as Record<string, unknown>).VulpyCommerce = undefined;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    (globalThis as Record<string, unknown>).S = undefined;
    (globalThis as Record<string, unknown>).VulpyCommerce = undefined;
    document.body.innerHTML = "";
  });

  function coreVc() {
    return (globalThis as Record<string, unknown>).VulpyCommerce as {
      on: (event: string, fn: (data: unknown) => void) => void;
      getSessionEnv?: () => string;
    };
  }

  it("emits session:loaded on the first session detection", () => {
    loadCore();
    const handler = vi.fn();
    coreVc().on("session:loaded", handler);

    vi.advanceTimersByTime(500);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({ session_id: "sess-a", env: null });
  });

  it("emits session:loaded again when S.session.session_id changes", () => {
    loadCore();
    const handler = vi.fn();
    coreVc().on("session:loaded", handler);

    vi.advanceTimersByTime(500); // first detection
    (globalThis as Record<string, unknown>).S = {
      session: { session_id: "sess-b" },
    };
    vi.advanceTimersByTime(500); // watcher notices the switch

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[1][0]).toEqual({ session_id: "sess-b", env: null });
  });

  it("does NOT emit repeatedly while the session is unchanged", () => {
    loadCore();
    const handler = vi.fn();
    coreVc().on("session:loaded", handler);

    vi.advanceTimersByTime(2000); // 4 ticks, same session

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not emit when S is undefined", () => {
    loadCore();
    (globalThis as Record<string, unknown>).S = undefined;
    const handler = vi.fn();
    coreVc().on("session:loaded", handler);

    vi.advanceTimersByTime(1000);

    expect(handler).not.toHaveBeenCalled();
  });

  it("includes the env from VulpyCommerce.getSessionEnv when available", () => {
    loadCore();
    // env-context registers getSessionEnv after core loads; the watcher reads
    // it lazily at emit time.
    (coreVc() as { getSessionEnv?: () => string }).getSessionEnv = () => "staging";
    const handler = vi.fn();
    coreVc().on("session:loaded", handler);

    vi.advanceTimersByTime(500);

    expect(handler.mock.calls[0][0]).toEqual({ session_id: "sess-a", env: "staging" });
  });
});
