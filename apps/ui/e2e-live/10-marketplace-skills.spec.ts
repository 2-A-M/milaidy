/**
 * 10 — Marketplace: Skills
 *
 * Tests the skills marketplace tab — searching, installing from
 * the marketplace or via GitHub URL, and managing installed skills.
 */
import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Marketplace — Skills", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    await navigateToTab(page, "Marketplace");
    await page.waitForTimeout(1000);

    // Switch to the Skills sub-tab if available
    const skillsTab = page.locator("button, a").filter({ hasText: /^skills$/i });
    if ((await skillsTab.count()) > 0) {
      await skillsTab.first().click();
      await page.waitForTimeout(500);
    }
  });

  test("skills marketplace config endpoint works", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/skills/marketplace/config");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as { keySet: boolean };
    expect(typeof data.keySet).toBe("boolean");
  });

  test("installed marketplace skills endpoint returns data", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/skills/marketplace/installed");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      count: number;
      skills: Array<{ id: string; name: string }>;
    };
    expect(typeof data.count).toBe("number");
    expect(Array.isArray(data.skills)).toBe(true);
  });

  test("skill catalog browse returns paginated results", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/skills/catalog?page=1&perPage=10");

    if (resp.status() === 200) {
      const data = (await resp.json()) as {
        total: number;
        page: number;
        perPage: number;
        skills: Array<{ name: string }>;
      };
      expect(data.page).toBe(1);
      expect(data.perPage).toBe(10);
      expect(Array.isArray(data.skills)).toBe(true);
    } else {
      // Catalog may not be available if no catalog server is configured
      expect([200, 502, 503]).toContain(resp.status());
    }
  });

  test("skill search returns results when marketplace key is set", async ({ appPage: page }) => {
    // Check if the marketplace key is configured
    const configResp = await page.request.get("/api/skills/marketplace/config");
    const config = (await configResp.json()) as { keySet: boolean };

    if (!config.keySet) {
      // Show guidance message instead
      const guidance = page.locator("body").filter({
        hasText: /api.?key|skillsmp|marketplace.*key/i,
      });
      // There should be some indication that the key is needed
      test.skip();
      return;
    }

    // Search for a common skill term
    const resp = await page.request.get(
      "/api/skills/marketplace/search?q=typescript&limit=10",
    );
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      query: string;
      count: number;
      results: Array<{ name: string }>;
    };
    expect(data.query).toBe("typescript");
    expect(Array.isArray(data.results)).toBe(true);
  });

  test("loaded skills list returns data", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/skills");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      skills: Array<{ id: string; name: string; enabled: boolean }>;
    };
    expect(Array.isArray(data.skills)).toBe(true);
  });

  test("skill refresh reloads skill list", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/skills/refresh");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      ok: boolean;
      skills: Array<{ id: string; name: string }>;
    };
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.skills)).toBe(true);
  });
});
