/**
 * Contract test: setup.js skip button must call /api/onboarding/complete
 *
 * Root cause of #129: the skip function posted to /api/setup/skip which does
 * not exist in Fox's backend. Fox's actual skip/complete endpoint is
 * /api/onboarding/complete. When the wrong endpoint was called Fox returned
 * a 403 and the response body `{}` bled into the next HTTP request's method
 * line, producing the cryptic "Unsupported method ('{}GET')" 501 error.
 *
 * This test guards against the endpoint regressing silently.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const setupJs = readFileSync(join(import.meta.dirname, "../setup.js"), "utf-8");

describe("setup.js onboarding skip endpoint", () => {
  it("does NOT call the nonexistent /api/setup/skip route", () => {
    expect(setupJs).not.toContain("/api/setup/skip");
  });

  it("calls /api/onboarding/complete to mark onboarding done", () => {
    expect(setupJs).toContain("/api/onboarding/complete");
  });

  it("exposes the global skipOnboarding the inline button onclick resolves", () => {
    expect(setupJs).toContain("window.skipOnboarding = _skipOnboarding");
  });

  it("skipOnboarding function posts to /api/onboarding/complete", () => {
    // Extract the skipOnboarding function body (prefixed `_skipOnboarding`).
    const match = setupJs.match(
      /async function _?skipOnboarding\(\)\s*\{[\s\S]*?^}/m
    );
    expect(match).not.toBeNull();
    const fnBody = match?.[0];
    expect(fnBody).toContain("post('/api/onboarding/complete'");
    expect(fnBody).not.toContain("post('/api/setup/skip'");
  });
});
