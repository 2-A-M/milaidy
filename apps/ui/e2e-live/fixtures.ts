/**
 * Shared Playwright test fixtures for live E2E tests.
 *
 * Provides an `appPage` fixture that navigates to the app and waits for the
 * milaidy-app web component to be fully rendered before each test.
 *
 * Also exports shared helper functions used across test files.
 */
import { test as base, expect, type Page, type Locator } from "@playwright/test";

// ---------------------------------------------------------------------------
// App readiness helpers
// ---------------------------------------------------------------------------

/** Wait for the milaidy-app web component to be present and interactive. */
export async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector("milaidy-app", {
    state: "attached",
    timeout: 60_000,
  });
  // Wait until the component has rendered a tab (indicates data fetched)
  await page.waitForFunction(
    () => {
      const app = document.querySelector("milaidy-app");
      if (!app || !app.shadowRoot) return false;
      // The app has loaded when either the nav is visible or onboarding is shown
      const nav = app.shadowRoot.querySelector("nav");
      const onboarding = app.shadowRoot.querySelector("[class*='onboarding'], [class*='welcome']");
      return nav !== null || onboarding !== null;
    },
    { timeout: 60_000 },
  );
}

/** Wait for a specific API response to complete. */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  options?: { timeout?: number },
): Promise<void> {
  await page.waitForResponse(
    (resp) => {
      const url = resp.url();
      if (typeof urlPattern === "string") return url.includes(urlPattern);
      return urlPattern.test(url);
    },
    { timeout: options?.timeout ?? 30_000 },
  );
}

/** Navigate to a specific tab by clicking the nav link. */
export async function navigateToTab(page: Page, tabName: string): Promise<void> {
  // Find the nav link for this tab (text match, case-insensitive)
  const navLink = page.locator("nav a").filter({ hasText: new RegExp(tabName, "i") });
  const count = await navLink.count();
  if (count > 0) {
    await navLink.first().click();
  } else {
    // Fallback: navigate via URL
    const pathMap: Record<string, string> = {
      chat: "/chat",
      workbench: "/workbench",
      inventory: "/inventory",
      plugins: "/plugins",
      marketplace: "/marketplace",
      skills: "/skills",
      database: "/database",
      config: "/config",
      logs: "/logs",
    };
    const urlPath = pathMap[tabName.toLowerCase()] ?? `/${tabName.toLowerCase()}`;
    await page.goto(urlPath);
    await waitForApp(page);
  }
  // Allow the view to render
  await page.waitForTimeout(500);
}

/** Get the current agent status from the API. */
export async function getAgentStatus(
  page: Page,
): Promise<{ state: string; agentName: string }> {
  const response = await page.request.get("/api/status");
  const data = (await response.json()) as { state: string; agentName: string };
  return data;
}

/** Wait for the agent to reach a specific state. */
export async function waitForAgentState(
  page: Page,
  targetState: string,
  timeout = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const status = await getAgentStatus(page);
    if (status.state === targetState) return;
    await page.waitForTimeout(1000);
  }
  throw new Error(
    `Agent did not reach state "${targetState}" within ${timeout}ms`,
  );
}

/** Ensure the agent is running; start it if needed. */
export async function ensureAgentRunning(page: Page): Promise<void> {
  const status = await getAgentStatus(page);
  if (status.state === "running") return;
  if (status.state === "paused") {
    await page.request.post("/api/agent/resume");
    await waitForAgentState(page, "running");
    return;
  }
  await page.request.post("/api/agent/start");
  await waitForAgentState(page, "running", 120_000);
}

/** Send a chat message via the API and return the response text. */
export async function sendChatMessage(
  page: Page,
  text: string,
): Promise<string> {
  const response = await page.request.post("/api/chat", {
    data: { text },
  });
  const data = (await response.json()) as { text: string; agentName: string };
  return data.text;
}

/** Get a locator that works inside the milaidy-app shadow DOM. */
export function appLocator(page: Page, selector: string): Locator {
  return page.locator(`milaidy-app ${selector}`);
}

// ---------------------------------------------------------------------------
// Custom test fixture — provides a page with the app already loaded
// ---------------------------------------------------------------------------

export const test = base.extend<{
  /** A Page with the Milaidy app loaded and ready. */
  appPage: Page;
}>({
  appPage: async ({ page }, use) => {
    await page.goto("/");
    await waitForApp(page);
    await use(page);
  },
});

export { expect };
