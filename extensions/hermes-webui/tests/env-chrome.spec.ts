// @ts-check
/**
 * Real-browser Playwright spec for the multi-env WebUI chrome (#180).
 *
 * WHY: jsdom cannot measure layout or evaluate media queries. This spec
 * loads the REAL running WebUI (http://127.0.0.1:8787, password login) and
 * injects the REAL extension sources in manifest order, then verifies:
 *
 *   1. Env chrome renders INSIDE header.app-titlebar (pill + action group in
 *      the .vc-env-titlebar chip) — no floating row, no overlap possible
 *   2. Top bar color matches the session env (dev default = green #19381F)
 *   3. Pill click opens the env-switcher popover (3 options)
 *   4. Mobile viewport (<=640px): action buttons hidden, thin-chevron
 *      trigger visible; clicking it opens a dropdown with the same actions
 *   5. Desktop: action buttons visible next to pill
 *   6. Session list rows carry env tags (DEV/STAGING/LIVE)
 *   7. New chat auto-assigns the previously active env — no picker modal
 *
 * Run (this container):
 *   cd /app/workspace/extensions/hermes-webui
 *   node_modules/.bin/playwright test tests/env-chrome.spec.ts --reporter=line
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

// sessions.js exposes newSession() as a global classic-script function in the
// real app shell; not defined in this module.
declare global {
  function newSession(): Promise<unknown>;
}

const WEBUI = "http://127.0.0.1:8787/";
const PASSWORD = "supersecret";
// Extension sources are read from this checkout (worktree or shared tree) so
// the spec always exercises the code it lives next to.
const EXT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "features/vulpy-commerce-core/index.js",
  "features/vulpy-commerce-env-context/index.js",
  "features/vulpy-commerce-env-actions/index.js",
  "features/vulpy-commerce-side-panel/index.js",
];

const STYLES = [
  "features/vulpy-commerce-core/index.css",
  "features/vulpy-commerce-env-context/index.css",
  "features/vulpy-commerce-env-actions/index.css",
  "features/vulpy-commerce-side-panel/index.css",
  "features/vulpy-commerce-profile-switcher/index.css",
];

/**
 * Password pass-page login (the raw WebUI has no HTTP basic auth layer), then
 * load the app shell and inject the extension sources in manifest order.
 */
async function bootEnvChrome(page: Page) {
  // page.request shares the context cookie jar with the page, so the login
  // session cookie set here authenticates the subsequent navigation.
  const login = await page.request.post(`${WEBUI}api/auth/login`, {
    data: { password: PASSWORD },
  });
  expect(login.ok()).toBe(true);
  await page.goto(WEBUI, { waitUntil: "domcontentloaded" });
  // The live overlay may already run a STALE vulpy-commerce bundle (the
  // watcher syncs only merged main). Neutralize its DOM artifacts so the
  // injected fresh sources are the only env chrome in the page — mirroring
  // what a rebuilt container would serve.
  await page.evaluate(() => {
    document.querySelectorAll("#vc-env-row, #vc-env-titlebar, .vc-env-bar, .vc-env-popover, .vc-env-actions-log-panel, .vc-env-actions-modal, .vc-env-picker-modal, .vc-env-row-mobile-trigger, .vc-env-row-mobile-menu, .vc-env-row-mobile-pull").forEach((n) => n.remove());
    // Also drop any stale feature state the old bundle left on the registry.
    if (window.VulpyCommerce) {
      window.VulpyCommerce.envRow = undefined;
      window.VulpyCommerce.envBar = undefined;
      window.VulpyCommerce.getSessionEnv = undefined;
      window.VulpyCommerce.setSessionEnv = undefined;
    }
    // Reset the env storage so tests start from a clean dev default.
    try {
      for (const k of Object.keys(localStorage).filter((lk) => lk.startsWith("vulpy_env_"))) { localStorage.removeItem(k); }
    } catch { /* ignore */ }
  });
  for (const f of FILES) {
    const code = readFileSync(`${EXT}/${f}`, "utf8");
    await page.addScriptTag({ content: code });
  }
  for (const s of STYLES) {
    const css = readFileSync(`${EXT}/${s}`, "utf8");
    await page.addStyleTag({ content: css });
  }
  // Allow the extension bootstrap + session watcher to settle.
  await page.waitForTimeout(800);
}

test.describe("multi-env WebUI chrome (titlebar-embedded)", () => {
  test("env chrome renders inside the native titlebar", async ({ page }) => {
    await bootEnvChrome(page);

    const chip = page.locator(".vc-env-titlebar");
    await expect(chip).toBeVisible();
    await expect(page.locator(".vc-env-pill")).toBeVisible();

    // Containment: the chip is a CHILD of header.app-titlebar — it cannot
    // cover the titlebar because it lives inside it. The old floating row
    // must not exist anywhere.
    const containment = await page.evaluate(() => {
      const header = document.querySelector("header.app-titlebar");
      const chip = document.querySelector(".vc-env-titlebar");
      return {
        chipInsideTitlebar: !!(header && chip && header.contains(chip)),
        chipSibling: !!(header && chip && chip.parentElement === header),
        oldRowGone: !document.querySelector(".vc-env-row"),
      };
    });
    expect(containment.chipInsideTitlebar).toBe(true);
    expect(containment.chipSibling).toBe(true);
    expect(containment.oldRowGone).toBe(true);

    // Top bar color = dev green by default.
    const barColor = await page.evaluate(() => {
      const bar = document.querySelector(".vc-env-bar");
      return bar ? getComputedStyle(bar).backgroundColor : null;
    });
    expect(barColor).toBe("rgb(25, 56, 31)"); // #19381F
  });

  test("pill click opens the env popover with 3 options", async ({ page }) => {
    await bootEnvChrome(page);
    await page.locator(".vc-env-pill").click();
    const popover = page.locator(".vc-env-popover");
    await expect(popover).toBeVisible();
    await expect(popover.locator("[data-vc-env]")).toHaveCount(3);
  });

  test("mobile viewport: buttons hidden, thin-chevron trigger opens dropdown", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 800 });
    await bootEnvChrome(page);

    const trigger = page.locator(".vc-env-row-mobile-trigger");
    await expect(trigger).toBeVisible();
    // Thin chevron (stroke-width 2 SVG), closed by default.
    const chevron = trigger.locator(".vc-env-chevron svg");
    await expect(chevron).toHaveCount(1);
    expect(await chevron.getAttribute("stroke-width")).toBe("2");
    await expect(trigger.locator(".vc-env-chevron")).not.toHaveClass(/is-open/);

    // Action buttons hidden on mobile (effective visibility — the desktop
    // group is hidden via the .vc-env-actions[hidden] attribute).
    const desktopPush = page.locator(
      '.vc-env-titlebar .vc-env-actions [data-vc-env-actions="push-staging"]',
    );
    await expect(desktopPush).toBeHidden();

    // Dropdown opens with same actions; chevron flips up.
    await trigger.click();
    const menu = page.locator(".vc-env-row-mobile-menu");
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-vc-env-actions="push-staging"]')).toBeVisible();
    await expect(menu.locator('[data-vc-env-actions="logs"]')).toBeVisible();
    await expect(trigger.locator(".vc-env-chevron")).toHaveClass(/is-open/);
  });

  test("desktop: action buttons visible next to pill inside the titlebar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootEnvChrome(page);

    // Scope to the desktop action group — the mobile menu copy also carries
    // the same data attribute but stays hidden.
    const desktopPush = page.locator(
      '.vc-env-titlebar .vc-env-actions [data-vc-env-actions="push-staging"]',
    );
    const desktopLogs = page.locator(
      '.vc-env-titlebar .vc-env-actions [data-vc-env-actions="logs"]',
    );
    await expect(desktopPush).toBeVisible();
    await expect(desktopLogs).toBeVisible();
    // Mobile trigger hidden on desktop.
    await expect(page.locator(".vc-env-row-mobile-trigger")).toBeHidden();
  });

  test("session list rows carry env tags (incl. legacy threads)", async ({ page }) => {
    await bootEnvChrome(page);

    // The 2s backfill interval + tag renderer adds .vc-env-tag to every
    // listed thread; legacy (unpersisted) ones read DEV.
    const tag = page.locator('.session-item[data-sid] .vc-env-tag').first();
    await expect(tag).toBeVisible({ timeout: 5000 });
    // Tag lives in the title row, next to the title/project dot.
    const inTitleRow = await page.evaluate(() => {
      const t = document.querySelector('.session-item[data-sid] .vc-env-tag');
      return !!(t?.parentElement?.classList.contains("session-title-row"));
    });
    expect(inTitleRow).toBe(true);
    // At least one tag must be DEV (legacy threads backfill to dev), and all
    // tags must be one of DEV/STAGING/LIVE.
    const texts = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".vc-env-tag")).map((t) => t.textContent),
    );
    expect(texts.length).toBeGreaterThan(0);
    expect(texts).toContain("DEV");
    for (const t of texts) {
      expect(["DEV", "STAGING", "LIVE"]).toContain(t);
    }
  });

  test("new chat auto-assigns the current env and shows no picker", async ({ page }) => {
    await bootEnvChrome(page);

    // Switch to staging via the real env-switcher (creates session B tagged
    // staging) so the inheritance path is exercised end-to-end.
    await page.locator(".vc-env-pill").click();
    await page.locator('.vc-env-popover-option[data-vc-env="staging"]').click();

    // The host persists the active session id in localStorage (sessions.js);
    // wait for the switch to session B to land.
    await page.waitForFunction(() => {
      const sid = localStorage.getItem("hermes-webui-session");
      return !!sid && localStorage.getItem(`vulpy_env_${sid}`) === "staging";
    }, undefined, { timeout: 8000 });

    // Create a brand-new chat the way the host does (session C, empty).
    const sidBefore = await page.evaluate(() => localStorage.getItem("hermes-webui-session"));
    await page.evaluate(() => newSession());

    // Auto-assign should have persisted the current env (staging) for the
    // new session id immediately — no picker prompt.
    await page.waitForFunction((prev) => {
      const sid = localStorage.getItem("hermes-webui-session");
      if (!sid || sid === prev) { return false; }
      return localStorage.getItem(`vulpy_env_${sid}`) !== null;
    }, sidBefore, { timeout: 8000 });
    const assigned = await page.evaluate(() => {
      const sid = localStorage.getItem("hermes-webui-session");
      return sid ? localStorage.getItem(`vulpy_env_${sid}`) : null;
    });
    expect(assigned).toBe("staging");

    // The picker modal is gone entirely (auto-assign replaced it).
    expect(await page.locator(".vc-env-picker-modal").count()).toBe(0);

    // Pill reflects the auto-assigned env.
    await expect(page.locator(".vc-env-pill")).toHaveText("STAGING");
  });
});
