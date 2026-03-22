#!/usr/bin/env node

/**
 * Build workspace plugins whose dist/ is missing.
 * Runs during postinstall so `bun install` produces ready-to-use plugins.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pluginsDir = path.join(repoRoot, "plugins");

if (!existsSync(pluginsDir)) {
  process.exit(0);
}

for (const entry of readdirSync(pluginsDir)) {
  const pluginDir = path.join(pluginsDir, entry);
  if (!statSync(pluginDir).isDirectory()) continue;

  const pkgPath = path.join(pluginDir, "package.json");
  if (!existsSync(pkgPath)) continue;

  const distIndex = path.join(pluginDir, "dist", "index.js");
  if (existsSync(distIndex)) {
    console.log(`[build-workspace-plugins] ${entry} already built — skipping`);
    continue;
  }

  console.log(`[build-workspace-plugins] building ${entry}...`);
  try {
    execSync("bun run build", { cwd: pluginDir, stdio: "inherit" });
    console.log(`[build-workspace-plugins] ${entry} done`);
  } catch (err) {
    console.error(
      `[build-workspace-plugins] ${entry} build failed:`,
      err.message,
    );
  }
}
