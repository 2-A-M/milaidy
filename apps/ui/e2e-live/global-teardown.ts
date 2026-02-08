/**
 * Playwright global teardown for LIVE E2E tests.
 *
 * Reads the state file written by global-setup.ts, kills the API and Vite
 * server processes, and cleans up the isolated test HOME directory.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATE_FILE = path.join(os.tmpdir(), "milaidy-e2e-live-state.json");

interface StateData {
  apiPid: number | null;
  vitePid: number | null;
  testHome: string | null;
  apiPort: number;
  uiPort: number;
  reusedApi: boolean;
  reusedUi: boolean;
  startedAt: string;
}

function killProcess(pid: number, label: string): void {
  try {
    process.kill(pid, "SIGTERM");
    console.log(`  [e2e-live] Sent SIGTERM to ${label} (pid ${pid})`);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      console.log(`  [e2e-live] ${label} (pid ${pid}) already exited`);
    } else {
      console.warn(
        `  [e2e-live] Failed to kill ${label} (pid ${pid}): ${code}`,
      );
    }
  }

  // Give the process a moment to exit gracefully, then force kill
  setTimeout(() => {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already dead
    }
  }, 3000);
}

export default async function globalTeardown(): Promise<void> {
  console.log("\n  [e2e-live] Starting global teardown...\n");

  if (!fs.existsSync(STATE_FILE)) {
    console.log("  [e2e-live] No state file found — nothing to clean up");
    return;
  }

  const raw = fs.readFileSync(STATE_FILE, "utf-8");
  const state: StateData = JSON.parse(raw) as StateData;

  // ── Kill server processes (only ones we started, not reused) ──────────
  if (state.vitePid && !state.reusedUi) {
    killProcess(state.vitePid, "Vite UI server");
  } else if (state.reusedUi) {
    console.log("  [e2e-live] Skipping Vite teardown (reused existing)");
  }
  if (state.apiPid && !state.reusedApi) {
    killProcess(state.apiPid, "API server");
  } else if (state.reusedApi) {
    console.log("  [e2e-live] Skipping API teardown (reused existing)");
  }

  // ── Clean up temp HOME ────────────────────────────────────────────────
  if (state.testHome && state.testHome.startsWith(os.tmpdir())) {
    try {
      fs.rmSync(state.testHome, { recursive: true, force: true });
      console.log(`  [e2e-live] Cleaned up test HOME: ${state.testHome}`);
    } catch (err) {
      console.warn(
        `  [e2e-live] Failed to clean up test HOME: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ── Remove state file ────────────────────────────────────────────────
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    // Ignore
  }

  console.log("  [e2e-live] Teardown complete\n");
}
