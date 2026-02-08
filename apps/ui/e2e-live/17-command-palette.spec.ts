/**
 * 17 — Command Palette
 *
 * Tests the keyboard-driven command palette (Cmd/Ctrl+K) with real
 * navigation commands and execution.
 */
import { test, expect, waitForApp } from "./fixtures.js";

test.describe("Command Palette", () => {
  test("Cmd/Ctrl+K opens the command palette", async ({ appPage: page }) => {
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(500);

    // Command palette should be visible
    const palette = page.locator(
      "[class*='palette'], [class*='command'], [class*='modal'], [role='dialog']",
    );
    await expect(palette.first()).toBeVisible({ timeout: 5_000 });
  });

  test("Escape closes the command palette", async ({ appPage: page }) => {
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(500);

    // Verify it's open
    const palette = page.locator(
      "[class*='palette'], [class*='command'], [class*='modal'], [role='dialog']",
    );
    await expect(palette.first()).toBeVisible({ timeout: 5_000 });

    // Close with Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Should be hidden
    await expect(palette.first()).not.toBeVisible({ timeout: 5_000 });
  });

  test("typing filters command list", async ({ appPage: page }) => {
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(500);

    // Type a search term
    await page.keyboard.type("plug");
    await page.waitForTimeout(300);

    // There should be a "Plugins" option visible
    const pluginsOption = page.locator(
      "[class*='palette'] [class*='item'], [class*='command'] [class*='option'], [role='option']",
    ).filter({ hasText: /plugin/i });

    await expect(pluginsOption.first()).toBeVisible({ timeout: 5_000 });
  });

  test("executing a navigation command changes the tab", async ({ appPage: page }) => {
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(500);

    // Type to filter for a specific tab
    await page.keyboard.type("work");
    await page.waitForTimeout(300);

    // Select the Workbench option
    const option = page.locator(
      "[class*='palette'] [class*='item'], [class*='command'] [class*='option'], [role='option']",
    ).filter({ hasText: /workbench/i });

    if ((await option.count()) > 0) {
      await option.first().click();
    } else {
      // Try Enter to select the first match
      await page.keyboard.press("Enter");
    }

    await page.waitForTimeout(500);

    // Should navigate to workbench
    await expect(page).toHaveURL(/\/workbench/);
  });

  test("palette closes after command execution", async ({ appPage: page }) => {
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    await page.waitForTimeout(500);

    await page.keyboard.type("chat");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);

    // Palette should be closed
    const palette = page.locator(
      "[class*='palette'], [class*='command'], [class*='modal'], [role='dialog']",
    );
    await expect(palette.first()).not.toBeVisible({ timeout: 5_000 });
  });
});
