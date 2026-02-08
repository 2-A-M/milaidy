/**
 * 11 — Marketplace: MCP Servers
 *
 * Tests the MCP (Model Context Protocol) server marketplace and configuration.
 * Verifies searching, adding, configuring, and removing MCP servers.
 */
import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Marketplace — MCP Servers", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    await navigateToTab(page, "Marketplace");
    await page.waitForTimeout(1000);

    // Switch to MCP sub-tab if available
    const mcpTab = page.locator("button, a").filter({ hasText: /mcp/i });
    if ((await mcpTab.count()) > 0) {
      await mcpTab.first().click();
      await page.waitForTimeout(500);
    }
  });

  test("MCP marketplace search returns results", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/mcp/marketplace/search?limit=10");

    if (resp.status() === 200) {
      const data = (await resp.json()) as {
        ok: boolean;
        results: Array<{ name: string; title: string; description: string }>;
      };
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.results)).toBe(true);
    } else {
      // MCP marketplace may not be reachable
      expect([200, 502, 503]).toContain(resp.status());
    }
  });

  test("MCP search with query filters results", async ({ appPage: page }) => {
    const resp = await page.request.get(
      "/api/mcp/marketplace/search?q=github&limit=10",
    );

    if (resp.status() === 200) {
      const data = (await resp.json()) as {
        ok: boolean;
        results: Array<{ name: string }>;
      };
      expect(data.ok).toBe(true);
      if (data.results.length > 0) {
        const hasGithub = data.results.some(
          (r) => r.name.toLowerCase().includes("github"),
        );
        expect(hasGithub).toBe(true);
      }
    }
  });

  test("MCP config endpoint returns current configuration", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/mcp/config");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      ok: boolean;
      servers: Record<string, unknown>;
    };
    expect(data.ok).toBe(true);
    expect(typeof data.servers).toBe("object");
  });

  test("add and remove MCP server via API", async ({ appPage: page }) => {
    const serverName = `e2e-test-echo-${Date.now()}`;

    // Add a remote MCP server
    const addResp = await page.request.post("/api/mcp/config/server", {
      data: {
        name: serverName,
        config: {
          type: "streamable-http",
          url: "https://echo.mcp.example.com",
        },
      },
    });
    expect(addResp.status()).toBe(200);

    const addData = (await addResp.json()) as { ok: boolean; name: string };
    expect(addData.ok).toBe(true);

    // Verify it appears in config
    const configResp = await page.request.get("/api/mcp/config");
    const configData = (await configResp.json()) as {
      servers: Record<string, unknown>;
    };
    expect(configData.servers).toHaveProperty(serverName);

    // Remove it
    const deleteResp = await page.request.delete(
      `/api/mcp/config/server/${encodeURIComponent(serverName)}`,
    );
    expect(deleteResp.status()).toBe(200);

    // Verify removal
    const verifyResp = await page.request.get("/api/mcp/config");
    const verifyData = (await verifyResp.json()) as {
      servers: Record<string, unknown>;
    };
    expect(verifyData.servers).not.toHaveProperty(serverName);
  });

  test("MCP status endpoint returns server statuses", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/mcp/status");
    expect(resp.status()).toBe(200);

    const data = (await resp.json()) as {
      ok: boolean;
      servers: Array<{
        name: string;
        status: string;
        toolCount: number;
        resourceCount: number;
      }>;
    };
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.servers)).toBe(true);
  });

  test("replace entire MCP config", async ({ appPage: page }) => {
    // Save current config
    const currentResp = await page.request.get("/api/mcp/config");
    const currentData = (await currentResp.json()) as {
      servers: Record<string, Record<string, unknown>>;
    };
    const savedConfig = { ...currentData.servers };

    // Replace with a test config
    const putResp = await page.request.put("/api/mcp/config", {
      data: {
        servers: {
          "test-replace": {
            type: "streamable-http",
            url: "https://test.example.com",
          },
        },
      },
    });
    expect(putResp.status()).toBe(200);

    // Verify the replacement
    const verifyResp = await page.request.get("/api/mcp/config");
    const verifyData = (await verifyResp.json()) as {
      servers: Record<string, unknown>;
    };
    expect(verifyData.servers).toHaveProperty("test-replace");

    // Restore original config
    await page.request.put("/api/mcp/config", {
      data: { servers: savedConfig },
    });
  });
});
