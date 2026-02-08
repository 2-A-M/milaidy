/**
 * 01 — Server Health & Connectivity
 *
 * Verifies the real Milaidy API server is running, responds correctly,
 * and the WebSocket endpoint is reachable. These tests run first to
 * catch infrastructure issues before testing UI features.
 */
import { test, expect } from "./fixtures.js";

test.describe("Server Health", () => {
  test("GET /api/status returns valid agent status", async ({ page }) => {
    const response = await page.request.get("/api/status");
    expect(response.status()).toBe(200);

    const data = (await response.json()) as Record<string, unknown>;
    expect(data).toHaveProperty("state");
    expect(data).toHaveProperty("agentName");
    expect(typeof data.state).toBe("string");
    expect(typeof data.agentName).toBe("string");
    // Agent should be running after global setup
    expect(["running", "not_started"]).toContain(data.state);
  });

  test("GET /api/onboarding/status shows onboarding complete", async ({ page }) => {
    const response = await page.request.get("/api/onboarding/status");
    expect(response.status()).toBe(200);

    const data = (await response.json()) as { complete: boolean };
    expect(data.complete).toBe(true);
  });

  test("GET /api/plugins returns plugin list", async ({ page }) => {
    const response = await page.request.get("/api/plugins");
    expect(response.status()).toBe(200);

    const data = (await response.json()) as { plugins: Array<Record<string, unknown>> };
    expect(Array.isArray(data.plugins)).toBe(true);
    expect(data.plugins.length).toBeGreaterThan(0);

    // Each plugin has expected shape
    const first = data.plugins[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("enabled");
    expect(first).toHaveProperty("category");
  });

  test("GET /api/onboarding/options returns onboarding configuration", async ({ page }) => {
    const response = await page.request.get("/api/onboarding/options");
    expect(response.status()).toBe(200);

    const data = (await response.json()) as Record<string, unknown>;
    expect(Array.isArray(data.names)).toBe(true);
    expect(Array.isArray(data.styles)).toBe(true);
    expect(Array.isArray(data.providers)).toBe(true);
    expect((data.names as string[]).length).toBeGreaterThan(0);
    expect((data.styles as unknown[]).length).toBeGreaterThan(0);
    expect((data.providers as unknown[]).length).toBeGreaterThan(0);
  });

  test("unknown API route returns 404", async ({ page }) => {
    const response = await page.request.get("/api/nonexistent-endpoint-xyz");
    expect(response.status()).toBe(404);
  });

  test("CORS preflight returns appropriate headers", async ({ page }) => {
    const response = await page.request.fetch("/api/status", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:18790",
        "Access-Control-Request-Method": "GET",
      },
    });
    // OPTIONS should return 204 or 200
    expect([200, 204]).toContain(response.status());
  });

  test("WebSocket endpoint is accessible", async ({ page }) => {
    // Connect directly to the API server WebSocket (not via Vite proxy)
    // The Vite ws proxy may not always be active, so test the direct endpoint
    const wsConnected = await page.evaluate((): Promise<boolean> => {
      return new Promise((resolve) => {
        // Connect directly to the API server's WS endpoint
        const ws = new WebSocket("ws://127.0.0.1:2138/ws");
        const timeout = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 10_000);
        ws.addEventListener("open", () => {
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        });
        ws.addEventListener("error", () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });
    });
    expect(wsConnected).toBe(true);
  });

  test("WebSocket receives status broadcast", async ({ page }) => {
    const statusMessage = await page.evaluate((): Promise<Record<string, unknown> | null> => {
      return new Promise((resolve) => {
        const ws = new WebSocket("ws://127.0.0.1:2138/ws");
        const timeout = setTimeout(() => {
          ws.close();
          resolve(null);
        }, 15_000);
        ws.addEventListener("message", (event: MessageEvent) => {
          const data = JSON.parse(event.data as string) as Record<string, unknown>;
          if (data.type === "status") {
            clearTimeout(timeout);
            ws.close();
            resolve(data);
          }
        });
        ws.addEventListener("error", () => {
          clearTimeout(timeout);
          resolve(null);
        });
      });
    });

    expect(statusMessage).not.toBeNull();
    expect(statusMessage).toHaveProperty("type", "status");
    expect(statusMessage).toHaveProperty("data");
    const statusData = statusMessage!.data as Record<string, unknown>;
    expect(statusData).toHaveProperty("agentState");
    expect(statusData).toHaveProperty("agentName");
  });
});
