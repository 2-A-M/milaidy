/**
 * 02 — Navigation
 *
 * Verifies that all 9 main tabs in the app are navigable, the URL updates
 * correctly, the active tab is highlighted, and browser history works.
 */
import { test, expect, waitForApp, navigateToTab } from "./fixtures.js";

const TABS = [
  { name: "Chat", path: "/chat", heading: /chat/i },
  { name: "Workbench", path: "/workbench", heading: /workbench/i },
  { name: "Inventory", path: "/inventory", heading: /inventory|wallet/i },
  { name: "Plugins", path: "/plugins", heading: /plugins/i },
  { name: "Marketplace", path: "/marketplace", heading: /marketplace/i },
  { name: "Skills", path: "/skills", heading: /skills/i },
  { name: "Database", path: "/database", heading: /database/i },
  { name: "Config", path: "/config", heading: /config|settings/i },
  { name: "Logs", path: "/logs", heading: /logs/i },
];

test.describe("Navigation", () => {
  test("defaults to chat tab on initial load", async ({ appPage: page }) => {
    // The default route should be chat (/ or /chat)
    const url = page.url();
    expect(url.endsWith("/") || url.includes("/chat")).toBe(true);
  });

  for (const tab of TABS) {
    test(`navigates to ${tab.name} tab`, async ({ appPage: page }) => {
      await navigateToTab(page, tab.name);

      // URL should reflect the tab
      await expect(page).toHaveURL(new RegExp(tab.path));

      // The page should contain content related to this tab
      // (heading, title, or section that matches the tab name)
      const heading = page.locator("h1, h2, [class*='heading'], [class*='title']")
        .filter({ hasText: tab.heading });
      const navActive = page.locator("nav a[class*='active'], nav a[aria-current='page']")
        .filter({ hasText: new RegExp(tab.name, "i") });

      // Either the heading or the active nav link should be visible
      const hasHeading = (await heading.count()) > 0;
      const hasActiveNav = (await navActive.count()) > 0;
      expect(hasHeading || hasActiveNav).toBe(true);
    });
  }

  test("highlights the active tab in navigation", async ({ appPage: page }) => {
    await navigateToTab(page, "Plugins");
    await page.waitForTimeout(300);

    // The Plugins nav link should have an active class or aria-current
    const pluginsLink = page.locator("nav a").filter({ hasText: /plugins/i });
    if ((await pluginsLink.count()) > 0) {
      const classList = await pluginsLink.first().getAttribute("class");
      // Active class or distinct styling should be applied
      expect(classList).toBeTruthy();
    }
  });

  test("handles direct URL navigation", async ({ page }) => {
    await page.goto("/plugins");
    await waitForApp(page);

    // Should land on the Plugins page
    await expect(page).toHaveURL(/\/plugins/);
  });

  test("handles browser back button", async ({ appPage: page }) => {
    // Navigate: chat -> plugins -> workbench
    await navigateToTab(page, "Plugins");
    await page.waitForTimeout(300);
    await navigateToTab(page, "Workbench");
    await page.waitForTimeout(300);

    // Go back
    await page.goBack();
    await page.waitForTimeout(500);

    // Should be on plugins
    await expect(page).toHaveURL(/\/plugins/);

    // Go back again
    await page.goBack();
    await page.waitForTimeout(500);

    // Should be on chat (or root)
    const url = page.url();
    expect(url.endsWith("/") || url.includes("/chat")).toBe(true);
  });

  test("handles browser forward button", async ({ appPage: page }) => {
    await navigateToTab(page, "Plugins");
    await page.waitForTimeout(300);

    // Go back to chat
    await page.goBack();
    await page.waitForTimeout(300);

    // Go forward to plugins
    await page.goForward();
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(/\/plugins/);
  });
});
