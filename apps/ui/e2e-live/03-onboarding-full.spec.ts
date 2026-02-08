/**
 * 03 — Onboarding (Full Wizard with Real LLM)
 *
 * Resets the agent to trigger the onboarding wizard, then walks through
 * every step with real data and a real LLM API key. After completion,
 * the agent should be fully running.
 *
 * This test is destructive — it resets the agent state — but leaves the
 * system in a running state for subsequent tests.
 */
import { test, expect, waitForApp, waitForAgentState } from "./fixtures.js";

test.describe("Onboarding Wizard", () => {
  test.describe.configure({ timeout: 180_000 }); // 3 min for full onboarding

  test("reset agent returns to onboarding state", async ({ page }) => {
    // Reset via API to force onboarding
    const resetResponse = await page.request.post("/api/agent/reset");
    expect(resetResponse.status()).toBe(200);

    // Verify onboarding is now incomplete
    const statusResponse = await page.request.get("/api/onboarding/status");
    const status = (await statusResponse.json()) as { complete: boolean };
    expect(status.complete).toBe(false);
  });

  test("full onboarding wizard completes and starts agent", async ({ page }) => {
    // Ensure agent is in onboarding state
    const onboardingStatus = await page.request.get("/api/onboarding/status");
    const { complete } = (await onboardingStatus.json()) as { complete: boolean };

    if (complete) {
      // Reset if onboarding is already done (from a previous test run)
      await page.request.post("/api/agent/reset");
      await page.waitForTimeout(2000);
    }

    // Navigate to app — should show onboarding wizard
    await page.goto("/");
    await waitForApp(page);

    // ── Step 1: Welcome screen ────────────────────────────────────────
    // Look for the welcome/onboarding screen
    const welcomeOrContinue = page.locator("button").filter({
      hasText: /continue|get started|next|begin/i,
    });
    if ((await welcomeOrContinue.count()) > 0) {
      await welcomeOrContinue.first().click();
      await page.waitForTimeout(500);
    }

    // ── Step 2: Name selection ────────────────────────────────────────
    // Try to find a name input or preset name buttons
    const nameInput = page.locator(
      "input[type='text'][placeholder*='name' i], input[type='text'][name*='name' i], input[placeholder*='agent' i]",
    );
    const presetNames = page.locator("button").filter({ hasText: /^[A-Z][a-z]+$/ });

    if ((await nameInput.count()) > 0) {
      await nameInput.first().fill("Reimu");
    } else if ((await presetNames.count()) > 0) {
      // Click the first preset name
      await presetNames.first().click();
    }

    // Click continue/next
    const nextBtn = page.locator("button").filter({
      hasText: /continue|next|→/i,
    });
    if ((await nextBtn.count()) > 0) {
      await nextBtn.first().click();
      await page.waitForTimeout(500);
    }

    // ── Step 3: Style selection ───────────────────────────────────────
    // Click a style preset if visible
    const styleButtons = page.locator("[class*='style'] button, [class*='preset'] button, button[class*='style']");
    if ((await styleButtons.count()) > 0) {
      await styleButtons.first().click();
      await page.waitForTimeout(300);
    }

    // Advance past style step
    const nextBtn2 = page.locator("button").filter({ hasText: /continue|next|→/i });
    if ((await nextBtn2.count()) > 0) {
      await nextBtn2.first().click();
      await page.waitForTimeout(500);
    }

    // ── Step 4: Theme selection ───────────────────────────────────────
    const themeButtons = page.locator("button").filter({ hasText: /dark|light/i });
    if ((await themeButtons.count()) > 0) {
      // Pick dark theme
      const darkBtn = page.locator("button").filter({ hasText: /dark/i });
      if ((await darkBtn.count()) > 0) {
        await darkBtn.first().click();
      }
      await page.waitForTimeout(300);
    }

    const nextBtn3 = page.locator("button").filter({ hasText: /continue|next|→/i });
    if ((await nextBtn3.count()) > 0) {
      await nextBtn3.first().click();
      await page.waitForTimeout(500);
    }

    // ── Step 5: Run mode selection (local) ────────────────────────────
    const localBtn = page.locator("button").filter({ hasText: /local/i });
    if ((await localBtn.count()) > 0) {
      await localBtn.first().click();
      await page.waitForTimeout(300);
    }

    const nextBtn4 = page.locator("button").filter({ hasText: /continue|next|→/i });
    if ((await nextBtn4.count()) > 0) {
      await nextBtn4.first().click();
      await page.waitForTimeout(500);
    }

    // ── Step 6: Provider selection ────────────────────────────────────
    // Select a provider that matches our available API key
    const anthropicBtn = page.locator("button").filter({ hasText: /anthropic/i });
    const openaiBtn = page.locator("button").filter({ hasText: /openai/i });

    if ((await anthropicBtn.count()) > 0) {
      await anthropicBtn.first().click();
    } else if ((await openaiBtn.count()) > 0) {
      await openaiBtn.first().click();
    }
    await page.waitForTimeout(300);

    // ── Step 7: API key input ─────────────────────────────────────────
    const apiKeyInput = page.locator(
      "input[type='password'], input[type='text'][placeholder*='key' i], input[placeholder*='sk-' i], input[name*='apiKey' i]",
    );
    if ((await apiKeyInput.count()) > 0) {
      // Use the real API key from the environment
      const apiKey =
        process.env.ANTHROPIC_API_KEY ??
        process.env.OPENAI_API_KEY ??
        process.env.GROQ_API_KEY ??
        "";
      await apiKeyInput.first().fill(apiKey);
      await page.waitForTimeout(300);
    }

    const nextBtn5 = page.locator("button").filter({ hasText: /continue|next|→/i });
    if ((await nextBtn5.count()) > 0) {
      await nextBtn5.first().click();
      await page.waitForTimeout(500);
    }

    // ── Step 8: Channel setup (skip) ──────────────────────────────────
    const skipBtn = page.locator("button").filter({ hasText: /skip|later/i });
    if ((await skipBtn.count()) > 0) {
      await skipBtn.first().click();
      await page.waitForTimeout(500);
    }

    // ── Step 9: Skills marketplace key (skip) ─────────────────────────
    const skipBtn2 = page.locator("button").filter({ hasText: /skip|later|finish/i });
    if ((await skipBtn2.count()) > 0) {
      await skipBtn2.first().click();
      await page.waitForTimeout(500);
    }

    // ── Step 10: Finish / Start agent ─────────────────────────────────
    const finishBtn = page.locator("button").filter({
      hasText: /finish|start|launch|complete|done|go/i,
    });
    if ((await finishBtn.count()) > 0) {
      await finishBtn.first().click();
    }

    // Wait for the agent to start — this involves real LLM initialization
    // which can take 30-60 seconds
    await page.waitForTimeout(5000);

    // ── Verify: Onboarding is now complete ────────────────────────────
    const afterStatus = await page.request.get("/api/onboarding/status");
    const afterData = (await afterStatus.json()) as { complete: boolean };
    expect(afterData.complete).toBe(true);

    // Wait for the agent to reach running state
    // The onboarding POST triggers config save and the runtime boots
    await waitForAgentState(page, "running", 120_000);

    // The UI should now show the chat view (not onboarding)
    await page.goto("/");
    await waitForApp(page);

    // Verify we're on the main app (not onboarding)
    const nav = page.locator("nav");
    await expect(nav).toBeVisible({ timeout: 30_000 });
  });
});
