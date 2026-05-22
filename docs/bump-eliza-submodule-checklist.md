# Bumping the `eliza/` submodule — checklist

When the upstream eliza submodule pointer moves past 2026-05, the
capacitor-plugin layout in the submodule changes:

- **Old layout** (legacy upstreams): `eliza/packages/native-plugins/<short>/`
- **New layout** (develop ≥ 2026-05): `eliza/plugins/plugin-native-<short>/`

Published package names are unchanged (`@elizaos/capacitor-<short>`); only
the on-disk directory structure moved.

Some parent files have already been migrated to handle both layouts
(see `milady/native-plugin-layout-migration-wip` branch). This checklist
covers the remaining work that must land **in the same commit as the
submodule bump**, because those files assert specific paths and break
if flipped outside a bump.

## Already migrated (works in both layouts)

These ship as additive changes; safe to land before any bump.

- `apps/app/scripts/capacitor-plugin-names.mjs` — auto-detects layout, exports `nativePluginDir()` helper.
- `apps/app/scripts/plugin-build.mjs` — uses `nativePluginDir()`.
- `apps/app/vite.config.ts` — uses `nativePluginDir()` + `NATIVE_PLUGINS_ROOT`.
- `apps/app/vitest.config.ts` — uses `nativePluginDir()` + `NATIVE_PLUGINS_ROOT`.
- `apps/app/tsconfig.json` — each `@elizaos/capacitor-*` path is a 2-element array (new first, old second).
- `scripts/disable-local-eliza-workspace.mjs` — `LOCAL_ONLY_WORKSPACE_GLOBS` includes both layouts.
- `package.json` workspaces — `eliza/plugins/*` already covers the new layout (no change needed).

## Must flip in the bump commit

These break under one layout if pre-applied, so they have to move
atomically with the submodule pointer.

### `apps/app/src/capacitor-plugin-modules.d.ts`

Each `declare module "@elizaos/capacitor-<X>"` block has an `export from`
pointing at the legacy path. Update every line:

```diff
- export * from "../../../eliza/packages/native-plugins/<X>/src/index";
+ export * from "../../../eliza/plugins/plugin-native-<X>/src/index";
```

Apply to all entries: agent, appblocker, camera, canvas, contacts,
desktop, gateway, location, messages, mobile-signals, phone,
screencapture, swabble, system, talkmode, websiteblocker.

Or delete the entire file — `tsconfig.json` paths + Node module
resolution should be sufficient once the workspace exists.

### `test/vitest/default.config.ts`

Two references:

- L223 (`@elizaos/capacitor-llama` alias): change `path.join(repoRoot, "eliza", "packages", "native-plugins", "llama", "src", "index.ts")` → `path.join(repoRoot, "eliza", "plugins", "plugin-native-llama", "src", "index.ts")`.
- L351 (test glob): change `"eliza/packages/native-plugins/llama/src/**/*.test.ts"` → `"eliza/plugins/plugin-native-llama/src/**/*.test.ts"`.

### `scripts/docker-ci-smoke-contract.test.ts`

L125: `expect(linker).toContain("eliza/packages/native-plugins/activity-tracker")` → `expect(linker).toContain("eliza/plugins/plugin-native-activity-tracker")`.

### `scripts/root-package-workspaces.test.ts`

L51: `.toEqual(["./eliza/packages/native-plugins/llama/src/index.ts"])` → `.toEqual(["./eliza/plugins/plugin-native-llama/src/index.ts"])`.

### Docs (text-only, no runtime impact)

Update narrative references in:

- `docs/apps/mobile/capacitor-plugins.md`
- `docs/plan-unified-scenario-matrix.md`
- `docs/plans/2026-04-19-passive-schedule-inference-plan.md`
- `docs/bump-eliza-submodule-checklist.md` (this file — drop the legacy-layout section once develop is the only path agents see)

## Submodule working-tree caveats (separate concern)

The local submodule at `e42da1696f1` has ~26 000 untracked files (some
real local content, some leftover from before the upstream rename). A
clean bump path needs either:

1. A non-destructive **index-only** pointer update (`git update-index --cacheinfo 160000,<sha>,eliza`) that leaves the working tree alone — this is what S43 attempted, but `bun install` still tripped on workspace-name collisions because the old + new dirs both existed on disk.
2. A working-tree reset to develop tip (`git checkout -f develop` inside the submodule), which clobbers the 13 329 truly-local untracked files (BRAND-TODO.md, ELIZA_1_GGUF_*, legacy `cloud/` tree, etc.). Triage those first.

The simplest production-grade approach: bump in a fresh clone of the
parent repo without the legacy clutter, verify boot, then carry the
result back.

## Recommended bump procedure

1. Land this WIP branch (`milady/native-plugin-layout-migration-wip`)
   on develop. The additive changes are no-ops pre-bump.
2. In a fresh worktree (clean submodule), bump the pointer:
   `git -C eliza fetch origin develop && git -C eliza checkout <sha>`.
3. Apply the "must flip in the bump commit" edits above.
4. `bun install` — should succeed because the duplicate-named workspaces are gone with the legacy directory.
5. `bun run dev` — verify boot.
6. Commit as one atomic bump (submodule pointer + the bump-coupled file flips).
7. Push, open PR to canonical Milady upstream.
