/**
 * 06 — Workbench: Goals
 *
 * Tests creating, editing, completing, and viewing goals through the
 * Workbench tab against the real goal service. Verifies persistence
 * and summary statistics.
 */
import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Workbench — Goals", () => {
  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    await navigateToTab(page, "Workbench");
    await page.waitForTimeout(1000);
  });

  test("workbench page renders with summary cards", async ({ appPage: page }) => {
    // Summary section should be visible with stats
    const summaryArea = page.locator(
      "[class*='summary'], [class*='overview'], [class*='stats'], [class*='card']",
    );
    await expect(summaryArea.first()).toBeVisible({ timeout: 10_000 });
  });

  test("create a new goal", async ({ appPage: page }) => {
    const goalName = `E2E Goal ${Date.now()}`;

    // Find the goal name input
    const nameInput = page.locator(
      "input[placeholder*='goal' i], input[placeholder*='name' i], input[name*='goal' i]",
    );
    await nameInput.first().fill(goalName);

    // Optional: add description
    const descInput = page.locator(
      "textarea[placeholder*='description' i], input[placeholder*='description' i]",
    );
    if ((await descInput.count()) > 0) {
      await descInput.first().fill("Created by E2E test suite");
    }

    // Click Add/Create Goal button
    const addBtn = page.locator("button").filter({
      hasText: /add goal|create goal|add|submit/i,
    });
    await addBtn.first().click();
    await page.waitForTimeout(1000);

    // Verify the goal appears in the list
    const goalItem = page.locator("[class*='goal'], [class*='item'], li")
      .filter({ hasText: goalName });
    await expect(goalItem.first()).toBeVisible({ timeout: 10_000 });
  });

  test("goal persists across page reload", async ({ appPage: page }) => {
    const goalName = `Persistent Goal ${Date.now()}`;

    // Create goal
    const nameInput = page.locator(
      "input[placeholder*='goal' i], input[placeholder*='name' i], input[name*='goal' i]",
    );
    await nameInput.first().fill(goalName);

    const addBtn = page.locator("button").filter({
      hasText: /add goal|create goal|add|submit/i,
    });
    await addBtn.first().click();
    await page.waitForTimeout(1000);

    // Reload
    await page.reload();
    await page.waitForTimeout(2000);
    await navigateToTab(page, "Workbench");
    await page.waitForTimeout(1000);

    // Goal should still be there
    const goalItem = page.locator("[class*='goal'], [class*='item'], li")
      .filter({ hasText: goalName });
    await expect(goalItem.first()).toBeVisible({ timeout: 10_000 });
  });

  test("mark goal as complete", async ({ appPage: page }) => {
    // Get the workbench overview to find an existing goal
    const overviewResponse = await page.request.get("/api/workbench/overview");
    const overview = (await overviewResponse.json()) as {
      goals: Array<{ id: string; name: string; isCompleted: boolean }>;
    };

    // Find an incomplete goal, or create one
    let goalId: string;
    const incomplete = overview.goals.find((g) => !g.isCompleted);
    if (incomplete) {
      goalId = incomplete.id;
    } else {
      // Create a new goal via API
      const createResp = await page.request.post("/api/workbench/goals", {
        data: { name: `Goal to complete ${Date.now()}` },
      });
      const created = (await createResp.json()) as { id: string };
      goalId = created.id;
      await page.reload();
      await navigateToTab(page, "Workbench");
      await page.waitForTimeout(1000);
    }

    // Complete the goal via API (UI completion involves clicking a checkbox)
    const patchResp = await page.request.patch(`/api/workbench/goals/${goalId}`, {
      data: { isCompleted: true },
    });
    expect(patchResp.status()).toBe(200);

    // Verify
    const verifyResp = await page.request.get("/api/workbench/overview");
    const verifyData = (await verifyResp.json()) as {
      goals: Array<{ id: string; isCompleted: boolean }>;
    };
    const completedGoal = verifyData.goals.find((g) => g.id === goalId);
    expect(completedGoal?.isCompleted).toBe(true);
  });

  test("edit goal name", async ({ appPage: page }) => {
    // Create a goal via API
    const createResp = await page.request.post("/api/workbench/goals", {
      data: { name: `Original Name ${Date.now()}`, description: "Will be renamed" },
    });
    const { id: goalId } = (await createResp.json()) as { id: string };

    const newName = `Renamed Goal ${Date.now()}`;
    const patchResp = await page.request.patch(`/api/workbench/goals/${goalId}`, {
      data: { name: newName },
    });
    expect(patchResp.status()).toBe(200);

    // Reload workbench and verify the new name appears
    await page.reload();
    await navigateToTab(page, "Workbench");
    await page.waitForTimeout(1000);

    const renamedGoal = page.locator("[class*='goal'], [class*='item'], li")
      .filter({ hasText: newName });
    await expect(renamedGoal.first()).toBeVisible({ timeout: 10_000 });
  });

  test("goal summary statistics update correctly", async ({ appPage: page }) => {
    // Get current summary
    const resp1 = await page.request.get("/api/workbench/overview");
    const data1 = (await resp1.json()) as {
      summary: { goalCount: number; openGoals: number; completedGoals: number };
    };
    const beforeCount = data1.summary.goalCount;

    // Create a new goal
    await page.request.post("/api/workbench/goals", {
      data: { name: `Summary Test ${Date.now()}` },
    });

    // Check summary updated
    const resp2 = await page.request.get("/api/workbench/overview");
    const data2 = (await resp2.json()) as {
      summary: { goalCount: number; openGoals: number };
    };
    expect(data2.summary.goalCount).toBe(beforeCount + 1);
    expect(data2.summary.openGoals).toBeGreaterThan(0);
  });

  test("empty goal name is rejected", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/workbench/goals", {
      data: { name: "" },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });
});
