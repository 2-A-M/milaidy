/**
 * 20 — Error States & Edge Cases
 *
 * Tests error handling across the application — invalid API requests,
 * validation errors, and recovery from error states.
 */
import { test, expect, waitForApp, ensureAgentRunning } from "./fixtures.js";

test.describe("Error States", () => {
  test.describe.configure({ timeout: 60_000 });

  test("chat rejects message when agent is stopped", async ({ appPage: page }) => {
    // Stop the agent
    await page.request.post("/api/agent/stop");
    await page.waitForTimeout(2000);

    // Try to send a chat message
    const resp = await page.request.post("/api/chat", {
      data: { text: "Hello" },
    });

    // Should be rejected with 503 (service unavailable)
    expect(resp.status()).toBe(503);

    // Restart for subsequent tests
    await page.request.post("/api/agent/start");
    await page.waitForTimeout(5000);
  });

  test("chat rejects empty message", async ({ appPage: page }) => {
    await ensureAgentRunning(page);

    const resp = await page.request.post("/api/chat", {
      data: { text: "" },
    });

    // Should reject with 400
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("invalid plugin ID returns 404", async ({ appPage: page }) => {
    const resp = await page.request.put("/api/plugins/nonexistent-plugin-xyz", {
      data: { enabled: true },
    });

    expect(resp.status()).toBe(404);
  });

  test("invalid goal UUID is rejected", async ({ appPage: page }) => {
    const resp = await page.request.patch("/api/workbench/goals/not-a-valid-uuid", {
      data: { name: "test" },
    });

    // Should reject with 400 (invalid UUID) or 404 (not found)
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("goal PATCH with no fields is rejected", async ({ appPage: page }) => {
    await ensureAgentRunning(page);

    // Create a goal first
    const createResp = await page.request.post("/api/workbench/goals", {
      data: { name: `Error Test Goal ${Date.now()}` },
    });
    const { id } = (await createResp.json()) as { id: string };

    // PATCH with empty body
    const patchResp = await page.request.patch(`/api/workbench/goals/${id}`, {
      data: {},
    });

    // Should reject (no fields to update)
    expect(patchResp.status()).toBeGreaterThanOrEqual(400);
  });

  test("database query with empty SQL is rejected", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/database/query", {
      data: { sql: "", readOnly: true },
    });

    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("onboarding POST without name is rejected", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/onboarding", {
      data: { theme: "dark" },
    });

    expect(resp.status()).toBe(400);
  });

  test("onboarding POST with invalid theme is rejected", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/onboarding", {
      data: { name: "Test", theme: "neon" },
    });

    expect(resp.status()).toBe(400);
  });

  test("onboarding POST with invalid runMode is rejected", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/onboarding", {
      data: { name: "Test", runMode: "quantum" },
    });

    expect(resp.status()).toBe(400);
  });

  test("wallet export without confirm is forbidden", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/wallet/export", {
      data: { confirm: false },
    });

    expect(resp.status()).toBe(403);
  });

  test("agent import with invalid body is rejected", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/agent/import", {
      data: "not-valid-binary",
      headers: { "Content-Type": "application/octet-stream" },
    });

    // Should fail with 400 (invalid format) or 413 (too large/small)
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("page recovers from navigation to invalid route", async ({ page }) => {
    await page.goto("/nonexistent-page-xyz");
    await waitForApp(page);

    // Should render something (either a 404 page or redirect to default)
    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test("app renders after page reload", async ({ appPage: page }) => {
    await page.reload();
    await waitForApp(page);

    // App should still be functional
    const body = page.locator("body");
    await expect(body).toBeVisible();

    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test("concurrent API requests don't corrupt state", async ({ appPage: page }) => {
    await ensureAgentRunning(page);

    // Send 5 concurrent requests
    const promises = Array.from({ length: 5 }, (_, i) =>
      page.request.get("/api/status"),
    );
    const responses = await Promise.all(promises);

    // All should succeed
    for (const resp of responses) {
      expect(resp.status()).toBe(200);
    }

    // All should return consistent agent name
    const names = await Promise.all(
      responses.map(async (r) => {
        const data = (await r.json()) as { agentName: string };
        return data.agentName;
      }),
    );
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(1);
  });
});
