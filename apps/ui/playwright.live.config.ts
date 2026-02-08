/**
 * Playwright configuration for LIVE end-to-end tests.
 *
 * Unlike the standard playwright.config.ts (which mocks all API calls),
 * this configuration runs tests against a REAL Milaidy server with
 * real LLM inference, real database, and real API calls.
 *
 * The global-setup boots the full Milaidy dev-server in an isolated HOME
 * directory and a Vite UI server that proxies to it.
 *
 * Usage:
 *   pnpm exec playwright test --config playwright.live.config.ts
 */
import { defineConfig, devices } from "@playwright/test";

const UI_PORT = 18790;

export default defineConfig({
  testDir: "./e2e-live",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 60_000 },
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: `http://localhost:${UI_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./e2e-live/global-setup.ts",
  globalTeardown: "./e2e-live/global-teardown.ts",
});
