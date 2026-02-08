/**
 * 07 — Workbench: Todos
 *
 * Tests creating, completing, editing, and managing todos through both
 * the UI and the real API. Verifies persistence and statistics.
 */
import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Workbench — Todos", () => {
  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    await navigateToTab(page, "Workbench");
    await page.waitForTimeout(1000);
  });

  test("create a new todo", async ({ appPage: page }) => {
    const todoName = `E2E Todo ${Date.now()}`;

    // Find the todo input — it may be a quick-add input
    const todoInput = page.locator(
      "input[placeholder*='todo' i], input[placeholder*='task' i], input[placeholder*='add' i], input[name*='todo' i]",
    );

    if ((await todoInput.count()) > 0) {
      await todoInput.first().fill(todoName);

      // Submit (press Enter or click Add)
      const addBtn = page.locator("button").filter({
        hasText: /add todo|add task|add|submit/i,
      });
      if ((await addBtn.count()) > 0) {
        await addBtn.first().click();
      } else {
        await todoInput.first().press("Enter");
      }
      await page.waitForTimeout(1000);
    } else {
      // Create via API
      await page.request.post("/api/workbench/todos", {
        data: { name: todoName },
      });
      await page.reload();
      await navigateToTab(page, "Workbench");
      await page.waitForTimeout(1000);
    }

    // Verify the todo appears
    const todoItem = page.locator("[class*='todo'], [class*='task'], [class*='item'], li")
      .filter({ hasText: todoName });
    await expect(todoItem.first()).toBeVisible({ timeout: 10_000 });
  });

  test("mark todo as complete via API", async ({ appPage: page }) => {
    // Create a todo
    const name = `Complete Me ${Date.now()}`;
    const createResp = await page.request.post("/api/workbench/todos", {
      data: { name },
    });
    expect(createResp.status()).toBe(200);
    const { id: todoId } = (await createResp.json()) as { id: string };

    // Complete it
    const patchResp = await page.request.patch(`/api/workbench/todos/${todoId}`, {
      data: { isCompleted: true },
    });
    expect(patchResp.status()).toBe(200);

    // Verify
    const overview = await page.request.get("/api/workbench/overview");
    const data = (await overview.json()) as {
      todos: Array<{ id: string; isCompleted: boolean }>;
    };
    const todo = data.todos.find((t) => t.id === todoId);
    expect(todo?.isCompleted).toBe(true);
  });

  test("set todo as urgent", async ({ appPage: page }) => {
    const name = `Urgent Todo ${Date.now()}`;
    const createResp = await page.request.post("/api/workbench/todos", {
      data: { name, isUrgent: true },
    });
    expect(createResp.status()).toBe(200);
    const { id: todoId } = (await createResp.json()) as { id: string };

    // Verify urgent flag
    const overview = await page.request.get("/api/workbench/overview");
    const data = (await overview.json()) as {
      todos: Array<{ id: string; isUrgent: boolean }>;
    };
    const todo = data.todos.find((t) => t.id === todoId);
    expect(todo?.isUrgent).toBe(true);
  });

  test("set todo priority", async ({ appPage: page }) => {
    const name = `Priority Todo ${Date.now()}`;
    const createResp = await page.request.post("/api/workbench/todos", {
      data: { name, priority: 1 },
    });
    expect(createResp.status()).toBe(200);
    const { id: todoId } = (await createResp.json()) as { id: string };

    // Update priority
    const patchResp = await page.request.patch(`/api/workbench/todos/${todoId}`, {
      data: { priority: 5 },
    });
    expect(patchResp.status()).toBe(200);

    // Verify
    const overview = await page.request.get("/api/workbench/overview");
    const data = (await overview.json()) as {
      todos: Array<{ id: string; priority: number }>;
    };
    const todo = data.todos.find((t) => t.id === todoId);
    expect(todo?.priority).toBe(5);
  });

  test("todo persists across reload", async ({ appPage: page }) => {
    const name = `Persistent Todo ${Date.now()}`;
    await page.request.post("/api/workbench/todos", {
      data: { name },
    });

    // Reload
    await page.reload();
    await page.waitForTimeout(2000);
    await navigateToTab(page, "Workbench");
    await page.waitForTimeout(1000);

    const todoItem = page.locator("[class*='todo'], [class*='task'], [class*='item'], li")
      .filter({ hasText: name });
    await expect(todoItem.first()).toBeVisible({ timeout: 10_000 });
  });

  test("todo summary statistics are accurate", async ({ appPage: page }) => {
    const resp1 = await page.request.get("/api/workbench/overview");
    const before = (await resp1.json()) as {
      summary: { todoCount: number; openTodos: number; completedTodos: number };
    };

    // Create a todo
    await page.request.post("/api/workbench/todos", {
      data: { name: `Stats Todo ${Date.now()}` },
    });

    const resp2 = await page.request.get("/api/workbench/overview");
    const after = (await resp2.json()) as {
      summary: { todoCount: number; openTodos: number };
    };

    expect(after.summary.todoCount).toBe(before.summary.todoCount + 1);
    expect(after.summary.openTodos).toBe(before.summary.openTodos + 1);
  });

  test("edit todo name", async ({ appPage: page }) => {
    const createResp = await page.request.post("/api/workbench/todos", {
      data: { name: `Original Todo ${Date.now()}` },
    });
    const { id: todoId } = (await createResp.json()) as { id: string };

    const newName = `Renamed Todo ${Date.now()}`;
    const patchResp = await page.request.patch(`/api/workbench/todos/${todoId}`, {
      data: { name: newName },
    });
    expect(patchResp.status()).toBe(200);

    // Reload and verify
    await page.reload();
    await navigateToTab(page, "Workbench");
    await page.waitForTimeout(1000);

    const renamed = page.locator("[class*='todo'], [class*='item'], li")
      .filter({ hasText: newName });
    await expect(renamed.first()).toBeVisible({ timeout: 10_000 });
  });

  test("empty todo name is rejected", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/workbench/todos", {
      data: { name: "" },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });
});
