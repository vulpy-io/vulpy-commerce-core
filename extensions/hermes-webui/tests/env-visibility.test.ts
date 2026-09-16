// @vitest-environment jsdom
/**
 * Runtime contract for the deliberately hidden environment chrome.
 *
 * The persistence API remains available to the rest of the extension system,
 * but neither desktop nor mobile environment controls may mount while the
 * product gate is false.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FEATURES = join(import.meta.dirname, "..", "features");

function loadFeature(name: string) {
  const code = readFileSync(join(FEATURES, name, "index.js"), "utf-8");
  new Function(code)();
}

describe("hidden environment controls runtime contract", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <header class="app-titlebar">
        <div class="app-titlebar-left"></div>
        <div class="app-titlebar-inner"></div>
        <div class="app-titlebar-spacer"></div>
        <button class="app-titlebar-new-chat">+</button>
      </header>
      <main>
        <div class="session-item" data-sid="desktop-session">
          <div class="session-text"><div class="session-title-row"><span class="session-title">Desktop</span></div></div>
        </div>
        <div class="session-item" data-sid="mobile-session">
          <div class="session-text"><div class="session-title-row"><span class="session-title">Mobile</span></div></div>
        </div>
      </main>
    `;
    localStorage.clear();
    (globalThis as Record<string, unknown>).S = {
      session: { session_id: "hidden-session", message_count: 0 },
      messages: [],
    };
    (globalThis as Record<string, unknown>).VulpyCommerce = undefined;
    (globalThis as Record<string, unknown>).api = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = "";
    localStorage.clear();
    (globalThis as Record<string, unknown>).S = undefined;
    (globalThis as Record<string, unknown>).VulpyCommerce = undefined;
    (globalThis as Record<string, unknown>).api = undefined;
  });

  it("keeps persistence available while desktop and mobile env UI is absent", () => {
    loadFeature("vulpy-commerce-core");
    loadFeature("vulpy-commerce-env-context");
    loadFeature("vulpy-commerce-env-actions");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    vi.runOnlyPendingTimers();

    const vc = (globalThis as Record<string, unknown>).VulpyCommerce as {
      isEnvironmentControlsVisible: () => boolean;
      getSessionEnv: () => string;
      setSessionEnv: (env: string) => void;
    };
    expect(vc.isEnvironmentControlsVisible).toBeTypeOf("function");
    expect(vc.isEnvironmentControlsVisible()).toBe(false);
    expect(vc.getSessionEnv).toBeTypeOf("function");
    expect(vc.setSessionEnv).toBeTypeOf("function");

    // Desktop titlebar/bar and mobile action surfaces are all user-facing
    // env controls; none may be present behind a hidden attribute.
    expect(document.querySelector("#vc-env-bar")).toBeNull();
    expect(document.querySelector("#vc-env-titlebar")).toBeNull();
    expect(document.querySelectorAll("[data-vc-env-actions], [data-vc-env-actions-bar]")).toHaveLength(0);
    expect(document.querySelectorAll(".vc-env-pill, .vc-env-tag, .vc-env-popover")).toHaveLength(0);

    (vc.setSessionEnv as (env: string) => void)("staging");
    expect((vc.getSessionEnv as () => string)()).toBe("staging");
    expect(localStorage.getItem("vulpy_env_hidden-session")).toBe("staging");
  });
});
