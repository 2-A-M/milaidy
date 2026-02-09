/**
 * Release channel constants and utilities.
 *
 * Separated from the config types file because this contains runtime values,
 * not just type definitions.
 */

import type { ReleaseChannel } from "../config/types.milaidy.js";

/** npm dist-tag corresponding to each release channel. */
export const CHANNEL_DIST_TAGS: Readonly<Record<ReleaseChannel, string>> = {
  stable: "latest",
  beta: "beta",
  nightly: "nightly",
};
