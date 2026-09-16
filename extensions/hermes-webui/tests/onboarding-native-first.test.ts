// @vitest-environment jsdom
/**
 * Welcome surface: native-first rendering (2026-08-26).
 *
 * Background: the custom message-renderer island is DISABLED at runtime
 * (operator override + product-level manifest default, issue batch
 * "webui-native-onboarding-media"). The welcome feature previously kept a
 * DUAL-RENDER selector (".hermes-empty-state, #emptyState") whose result
 * depended on document order — when the island is off, the island branches
 * are dead weight and the native surface is the only live one.
 *
 * Contract tested here:
 *   1. Renderer NOT mounted → welcome injects strictly into #emptyState and
 *      NEVER adopts stale island markup, even when island DOM precedes the
 *      native node in document order (old selector silently chose the island).
 *   2. Renderer NOT mounted → native empty state gains mission suggestion
 *      buttons (.suggestion[data-msg]) wired the way native boot.js wires its
 *      own (fill composer, call send()), replacing the stock tiles during
 *      onboarding — previously suggestions only existed behind the renderer's
 *      __hermesAuiSuggestionsProvider hook, so with the renderer disabled the
 *      missions were unreachable from the welcome surface.
 *   3. Renderer MOUNTED → island surfaces keep working (legacy path) and the
 *      suggestions provider hook is still registered for future re-enables.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FEATURE_PATH = join(
  import.meta.dirname,
  "..",
  "features",
  "vulpy-commerce-welcome",
  "index.js",
);

const WELCOME_TITLE =
  "Hi. I'm Vulpy, aka Fox in the Box. I'll help you build your store.";

interface VcStub {
  on: (event: string, fn: (data?: unknown) => void) => void;
  emit: (event: string, data?: unknown) => void;
}

function loadFeature() {
  const code = readFileSync(FEATURE_PATH, "utf-8");
  new Function(code)();
}

function vcStub(): VcStub {
  return (globalThis as Record<string, unknown>).VulpyCommerce as VcStub;
}

function installVulpyCommerce() {
  const listeners = new Map<string, Array<(d?: unknown) => void>>();
  (globalThis as Record<string, unknown>).VulpyCommerce = {
    on(event: string, fn: (d?: unknown) => void) {
      const arr = listeners.get(event) ?? [];
      arr.push(fn);
      listeners.set(event, arr);
    },
    emit(event: string, data?: unknown) {
      for (const fn of listeners.get(event) ?? []) {
        fn(data);
      }
    },
  };
}

function htmlDocument(opts: { islandFirst: boolean; rendererMounted: boolean }) {
  const island = `
    <div class="hermes-empty-state">
      <h2 class="hermes-empty-title">ISLAND SENTINEL</h2>
      <p class="hermes-empty-subtitle">ISLAND SUB</p>
      <div class="hermes-suggestion-grid"></div>
    </div>`;
  const native = `
    <div class="empty-state" id="emptyState">
      <h2 data-i18n="empty_title">NATIVE SENTINEL</h2>
      <p data-i18n="empty_subtitle">NATIVE SUB</p>
      <div class="suggestion-grid">
        <button class="suggestion" data-msg="What's in this workspace?">w</button>
        <button class="suggestion" data-msg="What's on my schedule today?">s</button>
        <button class="suggestion" data-msg="Help me plan a small project step by step.">p</button>
      </div>
    </div>`;
  const order = opts.islandFirst
    ? `<main>${island}${native}</main>`
    : `<main>${native}${island}</main>`;
  const mountTag = opts.rendererMounted
    ? '<style id="hermesAssistantUiStyles"></style>'
    : "";
  document.body.innerHTML = `${mountTag}${order}<textarea id="msg"></textarea>`;
}

describe("vulpy-commerce-welcome native-first", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    (globalThis as Record<string, unknown>).__hermesAuiSuggestionsProvider = undefined;
    (globalThis as Record<string, unknown>).newSession = undefined;
    (globalThis as Record<string, unknown>).newChat = undefined;
    (globalThis as Record<string, unknown>).send = undefined;
    (globalThis as Record<string, unknown>).loadSession = undefined;
    (globalThis as Record<string, unknown>).refreshSession = undefined;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = "";
    localStorage.clear();
    (globalThis as Record<string, unknown>).__hermesAuiSuggestionsProvider = undefined;
  });

  async function runWelcome(
    opts: { islandFirst: boolean; rendererMounted: boolean },
  ) {
    installVulpyCommerce();
    htmlDocument(opts);
    loadFeature();
    vcStub().emit("config:loaded");
    // config:loaded schedules injection at ~600/400ms with 200ms retry steps;
    // a 4s budget covers every retry before the attempt cap gives up.
    await vi.advanceTimersByTimeAsync(4000);
  }

  it("injects the welcome strictly into the native empty state when the renderer is not mounted", async () => {
    // Island markup sits FIRST in document order — the legacy dual-render
    // selector picked it and the native surface was left untouched.
    await runWelcome({ islandFirst: true, rendererMounted: false });

    const nativeTitle = document.querySelector<HTMLHeadingElement>(
      "#emptyState h2[data-i18n=empty_title]",
    );
    expect(nativeTitle?.textContent).toBe(WELCOME_TITLE);

    // The island is dead markup when unmounted — it must stay untouched.
    const islandTitle = document.querySelector<HTMLHeadingElement>(
      ".hermes-empty-title",
    );
    expect(islandTitle?.textContent).toBe("ISLAND SENTINEL");
  });

  it("wires mission suggestions onto the native empty state with click-to-send routing", async () => {
    const sendCalls: string[] = [];
    (globalThis as Record<string, unknown>).send = () => sendCalls.push("sent");

    await runWelcome({ islandFirst: false, rendererMounted: false });

    const grid = document.querySelector("#emptyState .suggestion-grid");
    expect(grid).toBeTruthy();

    const buttons = Array.from(
      grid!.querySelectorAll<HTMLButtonElement>("button.suggestion"),
    );
    expect(buttons.length).toBeGreaterThanOrEqual(4);

    const firstMission = buttons.find((b) =>
      (b.dataset.msg ?? "").startsWith("Mission 0"),
    );
    expect(firstMission).toBeTruthy();

    // Native boot.js wiring: fill the composer, then send().
    firstMission!.click();
    expect(sendCalls.length).toBe(1);

    const composer = document.getElementById("msg") as HTMLTextAreaElement | null;
    expect(composer?.value).toContain("Mission 0");
  });

  it("keeps island injection and the suggestions provider hook when the renderer is mounted", async () => {
    await runWelcome({ islandFirst: true, rendererMounted: true });

    const islandTitle = document.querySelector<HTMLHeadingElement>(
      ".hermes-empty-title",
    );
    expect(islandTitle?.textContent).toBe(WELCOME_TITLE);

    const provider = (globalThis as Record<string, unknown>)
      .__hermesAuiSuggestionsProvider;
    expect(typeof provider).toBe("function");
    const out = (provider as () => unknown)();
    expect(Array.isArray(out)).toBe(true);
    expect((out as Array<{ text: string }>).some((s) =>
      s.text.startsWith("Mission 0"),
    )).toBe(true);
  });
});
