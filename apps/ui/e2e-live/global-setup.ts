/**
 * Playwright global setup for LIVE E2E tests.
 *
 * 1. Loads real API keys from the workspace .env files
 * 2. Creates an isolated HOME directory with a pre-populated milaidy config
 * 3. Starts the real Milaidy API server (with full runtime) on port 2138
 * 4. Starts the Vite UI dev server on port 18790 (proxies /api to 2138)
 * 5. Waits for both servers to be ready
 * 6. Writes a state file for the teardown to use
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_ROOT = path.resolve(__dirname, "..");
const MILAIDY_ROOT = path.resolve(UI_ROOT, "../..");
const WORKSPACE_ROOT = path.resolve(MILAIDY_ROOT, "..");

const API_PORT = 2138;
const UI_PORT = 18790;
const STATE_FILE = path.join(os.tmpdir(), "milaidy-e2e-live-state.json");

// ---------------------------------------------------------------------------
// Env loader — reads .env files without requiring the dotenv package
// ---------------------------------------------------------------------------

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx);
    let value = trimmed.slice(eqIdx + 1);
    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

// ---------------------------------------------------------------------------
// Port utilities
// ---------------------------------------------------------------------------

function waitForPort(port: number, timeout = 180_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    function attempt(): void {
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for port ${port} (${timeout}ms)`));
        return;
      }
      const socket = createConnection({ port, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        setTimeout(attempt, 500);
      });
    }
    attempt();
  });
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Seed config — creates a minimal milaidy.json so the agent boots directly
// ---------------------------------------------------------------------------

function createSeedConfig(testHome: string, envVars: Record<string, string>): void {
  const stateDir = path.join(testHome, ".milaidy");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });

  const workspaceDir = path.join(stateDir, "workspace");
  fs.mkdirSync(workspaceDir, { recursive: true });

  const config = {
    meta: {
      lastTouchedVersion: "0.0.0-e2e-test",
      lastTouchedAt: new Date().toISOString(),
    },
    agents: {
      defaults: { workspace: workspaceDir },
      list: [
        {
          id: "main",
          default: true,
          name: "Reimu",
          bio: "A test agent for E2E testing. Helpful and concise.",
          system:
            "You are Reimu, a helpful AI assistant used for end-to-end testing. Keep responses short and to the point.",
          adjectives: ["helpful", "concise", "reliable"],
          topics: ["testing", "automation"],
          style: {
            all: ["Keep responses brief and factual."],
            chat: ["Be friendly but concise."],
          },
          workspace: workspaceDir,
        },
      ],
    },
    env: {
      ...(envVars.ANTHROPIC_API_KEY
        ? { ANTHROPIC_API_KEY: envVars.ANTHROPIC_API_KEY }
        : {}),
      ...(envVars.OPENAI_API_KEY
        ? { OPENAI_API_KEY: envVars.OPENAI_API_KEY }
        : {}),
      ...(envVars.GROQ_API_KEY
        ? { GROQ_API_KEY: envVars.GROQ_API_KEY }
        : {}),
      ...(envVars.EVM_PRIVATE_KEY
        ? { EVM_PRIVATE_KEY: envVars.EVM_PRIVATE_KEY }
        : {}),
      ...(envVars.SOLANA_API_KEY
        ? { SOLANA_PRIVATE_KEY: envVars.SOLANA_API_KEY }
        : {}),
    },
    ui: { theme: "dark" as const },
    plugins: {
      entries: {
        anthropic: { enabled: Boolean(envVars.ANTHROPIC_API_KEY) },
        openai: { enabled: Boolean(envVars.OPENAI_API_KEY) },
        groq: { enabled: Boolean(envVars.GROQ_API_KEY) },
      },
    },
    cloud: { enabled: false },
    wizard: {
      lastRunAt: new Date().toISOString(),
      lastRunVersion: "0.0.0-e2e-test",
    },
  };

  fs.writeFileSync(
    path.join(stateDir, "milaidy.json"),
    JSON.stringify(config, null, 2) + "\n",
    { encoding: "utf-8", mode: 0o600 },
  );
}

// ---------------------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------------------

export default async function globalSetup(): Promise<void> {
  console.log("\n  [e2e-live] Starting global setup...\n");

  // ── 1. Load environment variables from .env files ─────────────────────
  const envFiles = [
    path.join(MILAIDY_ROOT, ".env"),
    path.join(WORKSPACE_ROOT, "eliza", ".env"),
  ];

  const loadedEnv: Record<string, string> = {};
  for (const envFile of envFiles) {
    const vars = loadEnvFile(envFile);
    for (const [key, value] of Object.entries(vars)) {
      if (!loadedEnv[key]) loadedEnv[key] = value;
    }
  }

  // Apply to current process so child processes inherit
  for (const [key, value] of Object.entries(loadedEnv)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  const hasLLMKey =
    Boolean(process.env.ANTHROPIC_API_KEY) ||
    Boolean(process.env.OPENAI_API_KEY) ||
    Boolean(process.env.GROQ_API_KEY);

  if (!hasLLMKey) {
    throw new Error(
      "[e2e-live] No LLM API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY in .env",
    );
  }

  // ── 2. Check if servers are already running (reuse existing) ────────
  const apiInUse = await isPortInUse(API_PORT);
  const uiInUse = await isPortInUse(UI_PORT);

  let apiPid: number | null = null;
  let vitePid: number | null = null;
  let testHome: string | null = null;

  if (apiInUse) {
    console.log(
      `  [e2e-live] API server already running on port ${API_PORT} — reusing`,
    );
  } else {
    // ── 3. Create isolated test HOME ────────────────────────────────────
    testHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "milaidy-e2e-live-"),
    );
    console.log(`  [e2e-live] Test HOME: ${testHome}`);

    createSeedConfig(testHome, loadedEnv);
    console.log("  [e2e-live] Seed config written");

    // ── 4. Start the Milaidy API server ─────────────────────────────────
    const serverEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      HOME: testHome,
      USERPROFILE: testHome,
      MILAIDY_PORT: String(API_PORT),
      MILAIDY_HEADLESS: "1",
      LOG_LEVEL: "warn",
      NODE_ENV: "test",
    };

    // Copy known API keys explicitly
    for (const key of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GROQ_API_KEY",
      "EVM_PRIVATE_KEY",
      "SOLANA_API_KEY",
      "ALCHEMY_API_KEY",
      "HELIUS_API_KEY",
      "BIRDEYE_API_KEY",
    ]) {
      if (loadedEnv[key]) serverEnv[key] = loadedEnv[key];
    }

    console.log(`  [e2e-live] Starting API server on port ${API_PORT}...`);

    const apiProcess: ChildProcess = spawn(
      "bun",
      ["src/runtime/dev-server.ts"],
      {
        cwd: MILAIDY_ROOT,
        env: serverEnv,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    apiProcess.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (
        text.includes("Error") ||
        text.includes("error") ||
        text.includes("FATAL")
      ) {
        process.stderr.write(`  [api] ${text}`);
      }
    });

    apiProcess.on("exit", (code) => {
      if (code !== null && code !== 0) {
        console.error(`  [e2e-live] API server exited with code ${code}`);
      }
    });

    const apiStart = Date.now();
    await waitForPort(API_PORT, 180_000);
    const apiElapsed = ((Date.now() - apiStart) / 1000).toFixed(1);
    console.log(`  [e2e-live] API server ready (${apiElapsed}s)`);
    apiPid = apiProcess.pid ?? null;
  }

  if (uiInUse) {
    console.log(
      `  [e2e-live] Vite UI server already running on port ${UI_PORT} — reusing`,
    );
  } else {
    // ── 5. Start the Vite UI dev server ─────────────────────────────────
    console.log(`  [e2e-live] Starting Vite UI server on port ${UI_PORT}...`);

    const viteProcess: ChildProcess = spawn(
      "npx",
      ["vite", "--port", String(UI_PORT), "--strictPort"],
      {
        cwd: UI_ROOT,
        env: process.env as Record<string, string>,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    viteProcess.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes("Error") || text.includes("error")) {
        process.stderr.write(`  [vite] ${text}`);
      }
    });

    viteProcess.on("exit", (code) => {
      if (code !== null && code !== 0) {
        console.error(`  [e2e-live] Vite server exited with code ${code}`);
      }
    });

    const viteStart = Date.now();
    await waitForPort(UI_PORT, 60_000);
    const viteElapsed = ((Date.now() - viteStart) / 1000).toFixed(1);
    console.log(`  [e2e-live] Vite UI server ready (${viteElapsed}s)`);
    vitePid = viteProcess.pid ?? null;
  }

  // ── 6. Write state file for teardown ──────────────────────────────────
  const stateData = {
    apiPid,
    vitePid,
    testHome,
    apiPort: API_PORT,
    uiPort: UI_PORT,
    reusedApi: apiInUse,
    reusedUi: uiInUse,
    startedAt: new Date().toISOString(),
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 2));

  console.log(
    `\n  [e2e-live] Setup complete. UI at http://localhost:${UI_PORT}\n`,
  );
}
