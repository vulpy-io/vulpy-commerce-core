import { defineConfig, devices } from "@playwright/test";

interface RuntimeGlobal {
  process?: {
    env: Record<string, string | undefined>;
  };
}

const environment = (globalThis as RuntimeGlobal).process?.env ?? {};
const baseURL = environment.CHECKOUT_E2E_BASE_URL ?? "http://127.0.0.1:3300";

export default defineConfig({
  testDir: "./e2e/checkout",
  fullyParallel: false,
  forbidOnly: Boolean(environment.CI),
  retries: environment.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results/checkout",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "en-US",
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      // Structural tests are fully deterministic (no real Stripe network calls).
      // retries: 0 catches real failures immediately and avoids masking regressions.
      name: "checkout-structural",
      grep: /@structural/,
      retries: 0,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Stripe tests require real keys and a live network round-trip; allow one
      // retry in CI to absorb transient Stripe API latency.
      name: "checkout-stripe",
      grep: /@stripe/,
      retries: environment.CI ? 1 : 0,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Catch-all for any tests not tagged @structural or @stripe.
      name: "checkout-chromium",
      grepInvert: /@structural|@stripe/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
