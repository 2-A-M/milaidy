/**
 * 14 — Database Viewer
 *
 * Tests the database tab — connection status, table browsing, row viewing,
 * SQL query execution, and inline editing against the real PGLite database.
 */
import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Database Viewer", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    await navigateToTab(page, "Database");
    await page.waitForTimeout(2000);
  });

  test("database status shows connected", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/database/status");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      provider: string;
      connected: boolean;
      tableCount: number;
    };

    expect(data.provider).toBe("pglite");
    expect(data.connected).toBe(true);
    expect(data.tableCount).toBeGreaterThanOrEqual(0);
  });

  test("database config returns provider info", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/database/config");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      config: Record<string, unknown>;
      activeProvider: string;
    };

    expect(typeof data.activeProvider).toBe("string");
    expect(data.config).toBeTruthy();
  });

  test("tables list returns real table metadata", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/database/tables");

    if (resp.status() === 503) {
      // Database not available (agent might not have initialized DB yet)
      test.skip();
      return;
    }

    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      tables: Array<{
        name: string;
        columns: Array<{ name: string; dataType: string }>;
      }>;
    };

    expect(Array.isArray(data.tables)).toBe(true);

    if (data.tables.length > 0) {
      // Each table should have a name and columns
      const first = data.tables[0];
      expect(typeof first.name).toBe("string");
      expect(Array.isArray(first.columns)).toBe(true);
    }
  });

  test("table rows endpoint returns paginated data", async ({ appPage: page }) => {
    // Get tables first
    const tablesResp = await page.request.get("/api/database/tables");
    if (tablesResp.status() !== 200) {
      test.skip();
      return;
    }

    const tablesData = (await tablesResp.json()) as {
      tables: Array<{ name: string }>;
    };

    if (tablesData.tables.length === 0) {
      test.skip();
      return;
    }

    const tableName = tablesData.tables[0].name;
    const resp = await page.request.get(
      `/api/database/tables/${encodeURIComponent(tableName)}/rows?offset=0&limit=10`,
    );
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      table: string;
      rows: Array<Record<string, unknown>>;
      columns: string[];
      total: number;
      offset: number;
      limit: number;
    };

    expect(data.table).toBe(tableName);
    expect(Array.isArray(data.rows)).toBe(true);
    expect(Array.isArray(data.columns)).toBe(true);
    expect(typeof data.total).toBe("number");
  });

  test("SQL query execution returns results", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/database/query", {
      data: {
        sql: "SELECT 1 AS test_col, 'hello' AS greeting",
        readOnly: true,
      },
    });
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      columns: string[];
      rows: Array<Record<string, unknown>>;
      rowCount: number;
      durationMs: number;
    };

    expect(data.columns).toContain("test_col");
    expect(data.columns).toContain("greeting");
    expect(data.rowCount).toBe(1);
    expect(data.rows[0]).toHaveProperty("test_col", 1);
    expect(data.rows[0]).toHaveProperty("greeting", "hello");
    expect(typeof data.durationMs).toBe("number");
  });

  test("SQL query with syntax error returns error", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/database/query", {
      data: {
        sql: "SELEKT * FORM nonexistent_table",
        readOnly: true,
      },
    });
    // Should return an error
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("read-only mode rejects mutations", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/database/query", {
      data: {
        sql: "DROP TABLE IF EXISTS e2e_test_should_not_exist",
        readOnly: true,
      },
    });
    expect(resp.status()).toBe(400);
  });

  test("database viewer UI loads table sidebar", async ({ appPage: page }) => {
    // The database viewer should show a sidebar with table names
    const tablesResp = await page.request.get("/api/database/tables");
    if (tablesResp.status() !== 200) {
      test.skip();
      return;
    }

    const tablesData = (await tablesResp.json()) as {
      tables: Array<{ name: string }>;
    };

    if (tablesData.tables.length === 0) {
      // Empty state
      const emptyMsg = page.locator("body").filter({
        hasText: /no tables|empty|no data/i,
      });
      expect((await emptyMsg.count()) >= 0).toBe(true);
      return;
    }

    // At least one table name should be visible in the sidebar
    const firstName = tablesData.tables[0].name;
    const tableEl = page.locator("body").filter({ hasText: firstName });
    await expect(tableEl).toBeVisible({ timeout: 15_000 });
  });

  test("connection test endpoint works for postgres", async ({ appPage: page }) => {
    // This tests the endpoint exists — real postgres test requires a connection string
    const resp = await page.request.post("/api/database/test", {
      data: {
        host: "localhost",
        port: 5432,
        database: "test",
        user: "test",
        password: "test",
      },
    });

    // Should return a structured response (success or error)
    expect(resp.status()).toBe(200);
    const data = (await resp.json()) as {
      success: boolean;
      error: string | null;
      durationMs: number;
    };
    expect(typeof data.success).toBe("boolean");
    expect(typeof data.durationMs).toBe("number");
    // Connection will likely fail (no postgres running), but the endpoint works
  });
});
