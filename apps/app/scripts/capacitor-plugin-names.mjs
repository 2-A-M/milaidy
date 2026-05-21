import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ELIZA_ROOT = path.resolve(__dirname, "../../../eliza");

/**
 * Legacy layout: `eliza/packages/native-plugins/<short>/`. Pre-monorepo
 * upstreams keep capacitor plugins under one parent directory.
 */
const LEGACY_NATIVE_PLUGINS_ROOT = path.join(
  ELIZA_ROOT,
  "packages",
  "native-plugins",
);

/**
 * Current layout (post-monorepo, develop ≥ 2026-05): each capacitor plugin
 * is its own workspace under `eliza/plugins/plugin-native-<short>/`. The
 * published package names are unchanged (`@elizaos/capacitor-<short>`),
 * only the directory layout moved.
 */
const NATIVE_PLUGINS_PARENT = path.join(ELIZA_ROOT, "plugins");
const NATIVE_PLUGIN_DIR_PREFIX = "plugin-native-";

function readLegacyShortNames() {
  if (!fs.existsSync(LEGACY_NATIVE_PLUGINS_ROOT)) return null;
  const entries = fs
    .readdirSync(LEGACY_NATIVE_PLUGINS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const pluginDir = path.join(LEGACY_NATIVE_PLUGINS_ROOT, name);
      return (
        fs.existsSync(path.join(pluginDir, "package.json")) &&
        fs.existsSync(path.join(pluginDir, "src", "index.ts"))
      );
    });
  return entries.length > 0 ? entries : null;
}

function readCurrentShortNames() {
  if (!fs.existsSync(NATIVE_PLUGINS_PARENT)) return [];
  return fs
    .readdirSync(NATIVE_PLUGINS_PARENT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((dirName) => dirName.startsWith(NATIVE_PLUGIN_DIR_PREFIX))
    .filter((dirName) => {
      const pluginDir = path.join(NATIVE_PLUGINS_PARENT, dirName);
      return (
        fs.existsSync(path.join(pluginDir, "package.json")) &&
        fs.existsSync(path.join(pluginDir, "src", "index.ts"))
      );
    })
    .map((dirName) => dirName.slice(NATIVE_PLUGIN_DIR_PREFIX.length));
}

const legacy = readLegacyShortNames();
const usingLegacyLayout = legacy !== null;
const shortNames = (usingLegacyLayout ? legacy : readCurrentShortNames()).sort(
  (left, right) => left.localeCompare(right),
);

/**
 * Absolute path to the directory containing each native plugin workspace.
 * Points to `eliza/packages/native-plugins/` on legacy upstreams or
 * `eliza/plugins/` on current develop.
 */
export const NATIVE_PLUGINS_ROOT = usingLegacyLayout
  ? LEGACY_NATIVE_PLUGINS_ROOT
  : NATIVE_PLUGINS_PARENT;

/** Short names of each real native plugin workspace. Stable across layouts. */
export const CAPACITOR_PLUGIN_NAMES = shortNames;

/**
 * Resolves a short plugin name (e.g. `"agent"`) to its absolute workspace
 * directory under the current layout. Replaces direct `path.join` calls on
 * {@link NATIVE_PLUGINS_ROOT} so consumers don't have to know which layout
 * is active.
 */
export function nativePluginDir(shortName) {
  if (usingLegacyLayout) {
    return path.join(LEGACY_NATIVE_PLUGINS_ROOT, shortName);
  }
  return path.join(NATIVE_PLUGINS_PARENT, `${NATIVE_PLUGIN_DIR_PREFIX}${shortName}`);
}
