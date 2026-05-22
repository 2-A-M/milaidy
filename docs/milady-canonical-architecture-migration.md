# Milady fork → canonical architecture migration — scope

**Status**: SCOPING. No code changes proposed yet. Decision-ready document.

## Background

Our fork (`2-A-M/milaidy`) vendors elizaOS as a `eliza/` submodule and treats
local source as the default. Canonical upstream (`milady-ai/milady`) has
moved past this: their parent depends on `@elizaos/*` as published npm
packages (`"alpha"` dist-tag), with local source as an opt-in via an
explicit source-mode helper.

The OWNER+AGENT slice (S41–S43) shipped 8 PRs upstream that all merged on
the elizaOS develop branch. Those PRs become available to canonical Milady
automatically via the next `@elizaos/*` alpha release. Our fork, by contrast,
can only pick them up by bumping the submodule — and that bump triggers
cascading parent-side migrations (S43 surfaced ~30 stale dirs, 26k untracked
files, an entire nested `@feed/*` monorepo, and a parent that has 9 dead
`workspace:*` deps to apps no longer in develop).

The "investigate canonical migration" path is about flipping default
**source mode** from local → packages, while keeping local as an opt-in for
package work.

## Canonical's source-mode model (the key insight)

Canonical isn't anti-submodule — it's **packages-default with local opt-in**.
The single source of truth is
`scripts/lib/eliza-package-mode.mjs`, which exports:

- `DEFAULT_ELIZA_SOURCE_MODE = "packages"` — fresh clone gets npm packages.
- `getElizaSourceMode(env)` — checks `MILADY_ELIZA_SOURCE` / `ELIZA_SOURCE` env vars; returns `"local"` or `"packages"`.
- `isLocalElizaDisabled(env)` — true when mode is `"packages"` OR `MILADY_SKIP_LOCAL_UPSTREAMS=1` is set.
- `LOCAL_SOURCE_MODES = {"local", "source", "workspace"}` and `PACKAGE_SOURCE_MODES = {"package", "packages", "published", "npm", "registry", "global"}`.

Every consumer (vite.config.ts, postinstall, build scripts, electrobun
bootstrap) branches off `isLocalElizaDisabled()`. The eliza/ submodule
becomes a development convenience, not a hard dependency.

A fresh `git clone milady-ai/milady && bun install && bun run dev` works
WITHOUT ever cloning eliza/. Running `bun run eliza:local` flips to source
mode and clones eliza on demand.

## What our fork has that canonical doesn't

**Apps**: we ship `apps/{app, browser-bridge, home, homepage}` — canonical
ships `apps/{app, homepage}`. The extras (`browser-bridge`, `home`) need
either preservation or removal in any migration.

**Scripts** (40+ unique to our fork, from a quick diff):
- Bench / probe scripts: `bench-*.sh`, `eliza1-*.sh`, `cerebras-probe.sh`,
  `elizacloud-probe*`. Independent of eliza/ — survive intact.
- Tests: `action-e2e-workflow-contract.test.ts`,
  `docker-ci-smoke-contract.test.ts`, `electrobun-pr-workflow-contract.test.ts`,
  `init-submodules.test.ts`, `build-local-eliza-ci-overrides.test.ts`. Some
  assert submodule structure (e.g., docker-smoke checks for
  `eliza/plugins/plugin-native-activity-tracker`); these need conditional
  guards.
- Tools: `audit-actions.mjs`, `bump-elizaos.sh`, `check-secret-hygiene.mjs`,
  `depot-ci-sync.mjs`, `discord-export-to-markdown-log.mjs`. Mostly
  eliza-agnostic — survive.
- Workflow plumbing: `aggregate-scenario-reports.mjs`, `ci-stubs/`,
  `init-submodules.test.ts`, `eliza1-bench-*.sh`. Bench/training-specific.

**Other surface**: substantial `.claude/` content (104+ skills, agents,
hooks, plans), `docs/` with many design notes, our own `AGENTS.md` and
`CLAUDE.md`. None of this is at risk in the migration — all of it survives
intact.

## Migration shape (5-phase, scoped)

### Phase 1 — Port canonical's source-mode helper

Cherry-pick or replicate these files from `upstream/develop`:

- `scripts/lib/eliza-package-mode.mjs`
- `scripts/run-eliza-app-core-script.mjs`
- `scripts/eliza-source-mode.mjs`
- `scripts/milady-postinstall-repo-setup.mjs`
- `scripts/ensure-elizaos-optional-app-stubs.mjs`
- `scripts/run-production-build.mjs`
- `scripts/run-app-web-build.mjs`
- `scripts/repair-elizaos-package-links.mjs`
- The Milady-only patch scripts: `patch-elizaos-*.mjs`

These are mostly self-contained delegation/conditional logic. Estimated
~600 lines total.

### Phase 2 — Flip the default

Update `package.json`:
- Workspaces: `["apps/*"]` only by default. (Local-mode code can extend at runtime if needed.)
- Top-level deps: change `@elizaos/*` entries to use `"alpha"` (or the locked alpha version) instead of `"workspace:*"` chains.
- Patches: align `patchedDependencies` paths to canonical's (most patches stay at `eliza/packages/app-core/patches/` per the locked alpha; the one outlier `llama-cpp-capacitor` was already fixed in `caee4087b`).
- Scripts: `dev`, `build`, `dev:desktop` delegate via `run-eliza-app-core-script.mjs`.

Update `apps/app/package.json`:
- Replace each `workspace:*` ref to `@elizaos/*` with a published version (or the canonical's pattern of pinning to "alpha"/specific).
- Strip dead deps: `@elizaos/app-shopify`, `@elizaos/app-vincent`,
  `@elizaos/app-companion`, `@elizaos/app-lifeops`,
  `@clawville/app-clawville`, `@elizaos/app-task-coordinator`.
  These apps no longer exist on develop; canonical's
  `apps/app/src/optional-eliza-app-stub.tsx` is the pattern for keeping
  the imports compile-safe.

Update `apps/app/tsconfig.json`: paths point at `node_modules/@elizaos/*` by
default. The dual-array approach I already shipped on the WIP branch
(`002a38fd3`) for capacitor plugins generalizes to other `@elizaos/*` entries.

Update `apps/app/vite.config.ts`: conditional on `isLocalElizaDisabled()`,
matches canonical's pattern (most of which I'd cherry-pick directly).

### Phase 3 — Handle our fork-unique apps

- **`apps/home`**: confirm it doesn't depend on submodule paths. If it does, add `optional-eliza-app-stub` shims.
- **`apps/browser-bridge`**: this used to clash with the `packages/browser-bridge-extension` workspace (per the bump-test failure). Resolve the name collision. Canonical doesn't have this app — verify our content isn't redundant with `eliza/plugins/plugin-browser-bridge` upstream.

### Phase 4 — Conditional guards in submodule-aware scripts

Scripts that assume eliza/ exists (`init-submodules.test.ts`,
`docker-ci-smoke-contract.test.ts`, etc.) need an early-return when
`isLocalElizaDisabled()`. Specifically:

- `scripts/docker-ci-smoke-contract.test.ts`: assertions on `eliza/...` paths gate on local mode.
- `scripts/root-package-workspaces.test.ts`: same.
- `scripts/ensure-workspace-symlinks.mjs`, `scripts/ensure-native-plugins-linked.mjs`: no-op if isLocalElizaDisabled.
- `scripts/setup-upstreams.mjs`: only runs when local mode requested.
- `scripts/disable-local-eliza-workspace.mjs`: keep as-is — it's the existing fallback for the "switch from local to packages" workflow.

### Phase 5 — Dogfood + iterate

1. Fresh clone (or fresh worktree without eliza/ initialized).
2. `bun install` → fetches @elizaos/* from npm, applies patches.
3. `bun run dev` → boots against npm-resolved packages.
4. Verify: app loads, slice features (OWNER/AGENT, slack identity.basic, role-aware routing, agentGoogleSide collapse) all work because they're in the published alpha.
5. Test local mode: `MILADY_ELIZA_SOURCE=local bun run dev` should still work for package development.

## What's at risk in the migration

**No risk**:
- Our `.claude/`, `docs/`, scripts/bench, our 40+ unique scripts.
- The OWNER+AGENT slice — those PRs merged to elizaOS develop and ship via npm alpha.
- AGENTS.md / CLAUDE.md content.

**Low risk**:
- Our `apps/home` and `apps/browser-bridge` — need a quick audit.
- bun.lock will get rewritten — but pre-session bun.lock state was already dirty churn.

**Medium risk**:
- Patches in `eliza/packages/app-core/patches/` reference paths inside the
  pinned alpha version's tree. If the alpha shape diverges from the
  pinned version, patches fail to apply. Canonical's `upstreams.lock.json`
  pins specific alpha versions to mitigate this.
- Our submodule has S40 WIP content (`e42da1696f1`) that includes work
  not yet on develop. Bumping past that means abandoning the WIP. Memory
  notes from prior sessions suggest most of it was distributed via PRs
  already — needs a sanity audit before discarding.

## Estimated effort

- **Phase 1**: ~2 hours. Port 8-10 scripts from canonical.
- **Phase 2**: ~3 hours. Modify root + apps/app package.json, vite, tsconfig.
- **Phase 3**: ~2 hours. Audit + fix apps/home, apps/browser-bridge.
- **Phase 4**: ~2 hours. Add conditional guards across ~10 scripts.
- **Phase 5**: ~4 hours. First dogfood + bug-fix loop.

Total: **~13 hours / 2-3 focused sessions** to reach a working
packages-default boot. Local-mode would continue to work via the
opt-in flag.

## Decision points for shaw

1. **Confirm direction**: align with canonical (packages-default with local opt-in)?
2. **Keep our fork-unique apps?** `apps/home` and `apps/browser-bridge` — preserve, migrate, or drop?
3. **WIP submodule content** (`e42da1696f1`): audit + discard, or rescue specific items first?
4. **Pin strategy**: track canonical's `upstreams.lock.json` pins, or live on rolling `"alpha"`?
5. **Session shape**: tackle the 5 phases sequentially, or split with a milestone after Phase 2?

## Open questions

- Does canonical's `apps/app` import any modules from our fork's
  `apps/home` or `apps/browser-bridge` indirectly? (Quick grep needed.)
- Do any of our `@elizaos/app-*` consumers (we ship plugin code that
  expects shopify/vincent/lifeops to be installable) need to be removed
  too, or are they handled by `optional-eliza-app-stub`?
- Does canonical handle the `@elizaos/skills` package (which is in our
  bundle list) the same way as the rest? Verify.

## Artifacts to consult during migration

- `upstream/develop:scripts/lib/eliza-package-mode.mjs` — the canonical source-mode helper.
- `upstream/develop:apps/app/vite.config.ts` — conditional resolution pattern.
- `upstream/develop:apps/app/tsconfig.json` — node_modules-based path aliases.
- `upstream/develop:apps/app/src/optional-eliza-app-stub.tsx` — stub for absent optional apps.
- `upstream/develop:scripts/milady-postinstall-repo-setup.mjs` — postinstall delegation logic.
- `upstream/develop:upstreams.lock.json` — pinned alpha versions.
- Our WIP branches on origin:
  - `milady/native-plugin-layout-migration-wip` (8b415d3a7, 002a38fd3)
  - `milady/bump-eliza-2026-05-test` (caee4087b)
- `docs/bump-eliza-submodule-checklist.md` (committed in 002a38fd3) — captures the bump-coupled file flips, mostly obviated by this migration but useful if we ever do attempt a submodule bump for some other reason.
