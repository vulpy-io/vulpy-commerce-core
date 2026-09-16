import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/env-chrome.spec.ts",
  timeout: 60_000,
  use: {
    headless: true,
    launchOptions: {
      executablePath: "/opt/hermes/.playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
      ],
    },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
