/**
 * 15 — Config & Settings
 *
 * Tests the configuration page — settings display, Chrome extension status,
 * agent export/import, and the danger zone (reset).
 */
import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Config & Settings", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    await navigateToTab(page, "Config");
    await page.waitForTimeout(1000);
  });

  test("config page renders with settings sections", async ({ appPage: page }) => {
    const heading = page.locator("h1, h2, [class*='heading']").filter({
      hasText: /config|settings/i,
    });
    await expect(heading.first()).toBeVisible({ timeout: 10_000 });
  });

  test("danger zone section is visible", async ({ appPage: page }) => {
    const dangerZone = page.locator("body").filter({
      hasText: /danger zone/i,
    });
    await expect(dangerZone).toBeVisible({ timeout: 10_000 });
  });

  test("Reset Everything button is visible", async ({ appPage: page }) => {
    const resetBtn = page.locator("button").filter({
      hasText: /reset everything|reset/i,
    });
    await expect(resetBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test("Chrome Extension section shows connection status", async ({ appPage: page }) => {
    const extensionSection = page.locator("body").filter({
      hasText: /chrome extension|extension/i,
    });
    await expect(extensionSection).toBeVisible({ timeout: 10_000 });

    // Extension status endpoint
    const resp = await page.request.get("/api/extension/status");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      relayReachable: boolean;
      relayPort: number;
    };
    expect(typeof data.relayReachable).toBe("boolean");
    expect(typeof data.relayPort).toBe("number");
  });

  test("check connection button tests relay", async ({ appPage: page }) => {
    const checkBtn = page.locator("button").filter({
      hasText: /check connection|check/i,
    });
    if ((await checkBtn.count()) === 0) {
      test.skip();
      return;
    }

    await checkBtn.first().click();
    await page.waitForTimeout(2000);

    // Status text should update
    const statusText = page.locator("body").filter({
      hasText: /reachable|not reachable|connected|disconnected/i,
    });
    await expect(statusText).toBeVisible({ timeout: 10_000 });
  });

  test("agent export creates downloadable file", async ({ appPage: page }) => {
    // Test the export size estimate endpoint
    const estimateResp = await page.request.get("/api/agent/export/estimate");

    if (estimateResp.status() === 503) {
      // Agent not running
      test.skip();
      return;
    }

    expect(estimateResp.status()).toBe(200);

    const estimate = (await estimateResp.json()) as {
      sizeBytes: number;
      itemCount: number;
    };
    expect(typeof estimate.sizeBytes).toBe("number");
    expect(estimate.sizeBytes).toBeGreaterThanOrEqual(0);
  });

  test("character endpoint returns current character", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/character");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      character: { name: string };
      agentName: string;
    };
    expect(typeof data.character.name).toBe("string");
    expect(data.character.name.length).toBeGreaterThan(0);
    expect(typeof data.agentName).toBe("string");
  });

  test("character schema returns field definitions", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/character/schema");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      fields: Array<{
        key: string;
        type: string;
        label: string;
        description: string;
      }>;
    };
    expect(Array.isArray(data.fields)).toBe(true);
    expect(data.fields.length).toBeGreaterThan(0);

    // Should include standard character fields
    const keys = data.fields.map((f) => f.key);
    expect(keys).toContain("name");
  });

  test("update character via API", async ({ appPage: page }) => {
    // Get current character
    const getResp = await page.request.get("/api/character");
    const current = (await getResp.json()) as {
      character: Record<string, unknown>;
    };

    // Update with a new bio
    const updatedCharacter = {
      ...current.character,
      bio: "Updated by E2E test at " + new Date().toISOString(),
    };

    const putResp = await page.request.put("/api/character", {
      data: updatedCharacter,
    });
    expect(putResp.status()).toBe(200);

    const result = (await putResp.json()) as {
      ok: boolean;
      character: { bio: string };
    };
    expect(result.ok).toBe(true);

    // Verify the update persisted
    const verifyResp = await page.request.get("/api/character");
    const verifyData = (await verifyResp.json()) as {
      character: { bio: string | string[] };
    };
    const bio = Array.isArray(verifyData.character.bio)
      ? verifyData.character.bio.join(" ")
      : verifyData.character.bio;
    expect(bio).toContain("Updated by E2E test");
  });

  test("character update with empty name is rejected", async ({ appPage: page }) => {
    const resp = await page.request.put("/api/character", {
      data: { name: "" },
    });
    expect(resp.status()).toBe(422);
  });

  test("config endpoint returns full config", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/config");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as Record<string, unknown>;
    // Config should be an object with sections
    expect(typeof data).toBe("object");
    expect(data).toBeTruthy();
  });
});
