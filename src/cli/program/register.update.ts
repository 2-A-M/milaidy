/**
 * CLI command: `milaidy update`
 *
 * Checks for and applies updates based on the user's release channel.
 *
 * Usage:
 *   milaidy update                   # Check & update on current channel
 *   milaidy update --channel beta    # Switch to beta and update
 *   milaidy update --check           # Check only, don't install
 *   milaidy update --channel stable  # Switch back to stable
 */

import type { Command } from "commander";
import { loadMilaidyConfig, saveMilaidyConfig } from "../../config/config.js";
import type { ReleaseChannel } from "../../config/types.milaidy.js";
import { VERSION } from "../../runtime/version.js";
import {
  detectInstallMethod,
  performUpdate,
} from "../../services/self-updater.js";
import {
  checkForUpdate,
  fetchAllChannelVersions,
  resolveChannel,
} from "../../services/update-checker.js";
import { theme } from "../../terminal/theme.js";

// ---------------------------------------------------------------------------
// Channel display helpers
// ---------------------------------------------------------------------------

function channelLabel(channel: ReleaseChannel): string {
  switch (channel) {
    case "stable":
      return theme.success("stable");
    case "beta":
      return theme.warn("beta");
    case "nightly":
      return theme.accent("nightly");
  }
}

function channelDescription(channel: ReleaseChannel): string {
  switch (channel) {
    case "stable":
      return "Production-ready releases. Recommended for most users.";
    case "beta":
      return "Release candidates. May contain minor issues.";
    case "nightly":
      return "Latest development builds. May be unstable.";
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function updateAction(opts: {
  channel?: string;
  check?: boolean;
  force?: boolean;
}): Promise<void> {
  const config = loadMilaidyConfig();

  // Handle channel switch
  const validChannels: ReleaseChannel[] = ["stable", "beta", "nightly"];
  let newChannel: ReleaseChannel | undefined;

  if (opts.channel) {
    if (!validChannels.includes(opts.channel as ReleaseChannel)) {
      console.error(
        theme.error(
          `Invalid channel "${opts.channel}". Valid channels: ${validChannels.join(", ")}`,
        ),
      );
      process.exit(1);
    }
    newChannel = opts.channel as ReleaseChannel;
    const oldChannel = resolveChannel(config.update);

    if (newChannel !== oldChannel) {
      saveMilaidyConfig({
        ...config,
        update: {
          ...config.update,
          channel: newChannel,
          // Reset check cache when switching channels
          lastCheckAt: undefined,
          lastCheckVersion: undefined,
        },
      });
      console.log(
        `\nRelease channel changed: ${channelLabel(oldChannel)} -> ${channelLabel(newChannel)}`,
      );
      console.log(theme.muted(`  ${channelDescription(newChannel)}\n`));
    }
  }

  const effectiveChannel = newChannel ?? resolveChannel(config.update);

  console.log(
    `\n${theme.heading("Milaidy Update")}  ${theme.muted(`(channel: ${effectiveChannel})`)}`,
  );
  console.log(theme.muted(`Current version: ${VERSION}\n`));

  // Check for updates
  console.log("Checking for updates...\n");
  const result = await checkForUpdate({ force: opts.force ?? !!newChannel });

  if (result.error) {
    console.error(theme.warn(`  ${result.error}\n`));
    if (!opts.check) {
      process.exit(1);
    }
    return;
  }

  if (!result.updateAvailable) {
    console.log(
      theme.success(
        `  Already up to date! (${VERSION} is the latest on ${effectiveChannel})\n`,
      ),
    );
    return;
  }

  console.log(
    `  ${theme.accent("Update available:")} ${VERSION} -> ${theme.success(result.latestVersion ?? "unknown")}`,
  );
  console.log(
    theme.muted(
      `  Channel: ${effectiveChannel} | dist-tag: ${result.distTag}\n`,
    ),
  );

  // Check-only mode
  if (opts.check) {
    console.log(theme.muted("  Run `milaidy update` to install the update.\n"));
    return;
  }

  // Detect install method
  const method = detectInstallMethod();
  if (method === "local-dev") {
    console.log(
      theme.warn(
        "  Local development install detected. Use `git pull` to update.\n",
      ),
    );
    return;
  }

  console.log(theme.muted(`  Install method: ${method}`));
  console.log("  Installing update...\n");

  const updateResult = await performUpdate(VERSION, effectiveChannel);

  if (!updateResult.success) {
    console.error(theme.error(`\n  Update failed: ${updateResult.error}\n`));
    console.log(
      theme.muted(
        `  Command: ${updateResult.command}\n  You can try running it manually.\n`,
      ),
    );
    process.exit(1);
  }

  if (updateResult.newVersion) {
    console.log(
      theme.success(
        `\n  Updated successfully! ${VERSION} -> ${updateResult.newVersion}`,
      ),
    );
  } else {
    // Update command succeeded (exit 0) but we couldn't verify the new version.
    // This can happen if the new binary isn't on PATH yet or has issues.
    console.log(theme.success("\n  Update command completed successfully."));
    console.log(
      theme.warn(
        `  Could not verify the new version. Expected: ${result.latestVersion ?? "unknown"}`,
      ),
    );
  }
  console.log(
    theme.muted("  Restart milaidy for the new version to take effect.\n"),
  );
}

async function statusAction(): Promise<void> {
  console.log(`\n${theme.heading("Version Status")}\n`);

  const config = loadMilaidyConfig();
  const channel = resolveChannel(config.update);

  console.log(`  Installed:  ${theme.accent(VERSION)}`);
  console.log(`  Channel:    ${channelLabel(channel)}`);

  const method = detectInstallMethod();
  console.log(`  Install:    ${theme.muted(method)}`);

  console.log(`\n${theme.heading("Available Versions")}\n`);
  console.log("  Fetching from npm registry...\n");

  const versions = await fetchAllChannelVersions();

  const channels: ReleaseChannel[] = ["stable", "beta", "nightly"];
  for (const ch of channels) {
    const version = versions[ch];
    const isCurrent = ch === channel;
    const marker = isCurrent ? theme.accent(" <-- current") : "";
    const versionStr = version ?? theme.muted("(not published)");
    console.log(`  ${channelLabel(ch).padEnd(22)} ${versionStr}${marker}`);
  }

  if (config.update?.lastCheckAt) {
    console.log(
      `\n  ${theme.muted(`Last checked: ${new Date(config.update.lastCheckAt).toLocaleString()}`)}`,
    );
  }

  console.log();
}

async function channelAction(channelArg: string | undefined): Promise<void> {
  const config = loadMilaidyConfig();
  const currentChannel = resolveChannel(config.update);

  if (!channelArg) {
    // Show current channel and options
    console.log(`\n${theme.heading("Release Channel")}\n`);
    console.log(`  Current: ${channelLabel(currentChannel)}`);
    console.log(theme.muted(`  ${channelDescription(currentChannel)}\n`));
    console.log("  Available channels:");
    const channels: ReleaseChannel[] = ["stable", "beta", "nightly"];
    for (const ch of channels) {
      const marker = ch === currentChannel ? theme.accent(" (active)") : "";
      console.log(
        `    ${channelLabel(ch)}${marker}  ${theme.muted(channelDescription(ch))}`,
      );
    }
    console.log(
      `\n  ${theme.muted("Switch with: milaidy update channel <stable|beta|nightly>")}\n`,
    );
    return;
  }

  const validChannels: ReleaseChannel[] = ["stable", "beta", "nightly"];
  if (!validChannels.includes(channelArg as ReleaseChannel)) {
    console.error(
      theme.error(
        `\nInvalid channel "${channelArg}". Valid channels: ${validChannels.join(", ")}\n`,
      ),
    );
    process.exit(1);
  }

  const newChannel = channelArg as ReleaseChannel;

  if (newChannel === currentChannel) {
    console.log(
      `\n  Already on ${channelLabel(currentChannel)} channel. No change needed.\n`,
    );
    return;
  }

  saveMilaidyConfig({
    ...config,
    update: {
      ...config.update,
      channel: newChannel,
      lastCheckAt: undefined,
      lastCheckVersion: undefined,
    },
  });

  console.log(
    `\n  Channel changed: ${channelLabel(currentChannel)} -> ${channelLabel(newChannel)}`,
  );
  console.log(theme.muted(`  ${channelDescription(newChannel)}`));
  console.log(
    `\n  ${theme.muted("Run `milaidy update` to fetch the latest version from this channel.")}\n`,
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerUpdateCommand(program: Command): void {
  const updateCmd = program
    .command("update")
    .description("Check for and install updates")
    .option(
      "-c, --channel <channel>",
      "Switch release channel (stable, beta, nightly)",
    )
    .option("--check", "Check for updates without installing")
    .option("--force", "Force update check (bypass interval cache)")
    .action(updateAction);

  updateCmd
    .command("status")
    .description(
      "Show current version and available updates across all channels",
    )
    .action(statusAction);

  updateCmd
    .command("channel [channel]")
    .description("View or change the release channel")
    .action(channelAction);
}
