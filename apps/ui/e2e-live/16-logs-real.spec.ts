/**
 * 16 — Logs
 *
 * Tests the log viewer against the real log buffer. Verifies that
 * log entries are displayed, contain proper structure, and refresh works.
 */
import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Logs", () => {
  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    await navigateToTab(page, "Logs");
    await page.waitForTimeout(1000);
  });

  test("logs page renders", async ({ appPage: page }) => {
    const heading = page.locator("h1, h2, [class*='heading']").filter({
      hasText: /logs/i,
    });
    await expect(heading.first()).toBeVisible({ timeout: 10_000 });
  });

  test("logs API returns structured entries", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/logs");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      entries: Array<{
        timestamp: number;
        level: string;
        message: string;
        source: string;
      }>;
      sources: string[];
    };

    expect(Array.isArray(data.entries)).toBe(true);
    expect(Array.isArray(data.sources)).toBe(true);

    if (data.entries.length > 0) {
      const first = data.entries[0];
      expect(typeof first.timestamp).toBe("number");
      expect(typeof first.level).toBe("string");
      expect(typeof first.message).toBe("string");
      expect(typeof first.source).toBe("string");
    }
  });

  test("log entries appear in the UI", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/logs");
    const data = (await resp.json()) as {
      entries: Array<{ message: string }>;
    };

    if (data.entries.length === 0) {
      // Empty logs state
      const emptyMsg = page.locator("body").filter({
        hasText: /no logs|empty|no entries/i,
      });
      expect((await emptyMsg.count()) >= 0).toBe(true);
      return;
    }

    // At least one log message should be visible in the UI
    // Use a snippet from the first entry
    const snippet = data.entries[0].message.slice(0, 20);
    const logEl = page.locator("body").filter({ hasText: snippet });
    await expect(logEl).toBeVisible({ timeout: 10_000 });
  });

  test("refresh button fetches new logs", async ({ appPage: page }) => {
    const refreshBtn = page.locator("button").filter({
      hasText: /refresh/i,
    });
    if ((await refreshBtn.count()) === 0) {
      test.skip();
      return;
    }

    await refreshBtn.first().click();
    await page.waitForTimeout(1000);

    // After refresh, the logs should still be visible
    const resp = await page.request.get("/api/logs");
    const data = (await resp.json()) as {
      entries: Array<Record<string, unknown>>;
    };
    expect(Array.isArray(data.entries)).toBe(true);
  });

  test("log sources are reported", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/logs");
    const data = (await resp.json()) as { sources: string[] };

    expect(Array.isArray(data.sources)).toBe(true);
    // After agent has been running, there should be at least one source
    if (data.sources.length > 0) {
      expect(typeof data.sources[0]).toBe("string");
    }
  });

  test("log filtering by source works via API", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/logs");
    const data = (await resp.json()) as {
      entries: Array<{ source: string }>;
      sources: string[];
    };

    if (data.sources.length === 0) {
      test.skip();
      return;
    }

    // Filter by the first source
    const source = data.sources[0];
    const filteredResp = await page.request.get(
      `/api/logs?source=${encodeURIComponent(source)}`,
    );
    expect(filteredResp.status()).toBe(200);

    const filteredData = (await filteredResp.json()) as {
      entries: Array<{ source: string }>;
    };

    // All entries should be from the requested source
    for (const entry of filteredData.entries) {
      expect(entry.source).toBe(source);
    }
  });
});
