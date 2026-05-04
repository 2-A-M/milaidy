# patches/elizacloud — local fixes for `@elizaos/plugin-elizacloud`

These patches are local Milady fixes that have not yet landed in upstream
`elizaOS/eliza/plugins/plugin-elizacloud`. Once the corresponding upstream PR
merges, the patch (and any reference to it from `scripts/patch-elizacloud.mjs`)
can be deleted.

## 0001-json-output-enforcement-and-fence-strip.patch

Targets `@elizaos/plugin-elizacloud@2.0.0-alpha.8` in `node_modules` (older
layout, before the eliza-monorepo plugins-inlining merge of 2026-05-04).

`scripts/patch-elizacloud.mjs` is pinned to `alpha.8` and refuses to apply to
other versions. **Currently dormant** because:
- After the upstream merge of `aa3cfe1946 milady-ai/develop into develop`,
  `plugin-elizacloud` is now at version `alpha.537` (workspace package, not
  npm-fetched), so the pinned-version check in the script blocks application.
- The basic fence-strip portion of this patch is already present in the
  upstream version's `models/object.ts`, so most of 0001 is no longer needed.

Cleanup gated on PR `elizaos-plugins/plugin-elizacloud#18` merging upstream
(see `feedback_pr_workflow.md`).

## 0002-extract-balanced-json-walker.patch

Adds `extractFirstBalancedJsonValue(text)` to upstream
`eliza/plugins/plugin-elizacloud/models/object.ts` and applies it after the
fence-strip but before `JSON.parse`. Mirrors the helper from
`elizaos-plugins/plugin-elizacloud#18` (which is targeting the standalone
plugin repo, not the eliza monorepo copy).

**Why needed**: upstream eliza's `models/object.ts` has only the basic
fence-strip. When an LLM returns prose-prefixed (`Here's the JSON: {...}`)
or bracketed-prefixed (`[note] {...}`) responses, the basic strip leaves
non-parseable text and `JSON.parse` throws. The walker iterates every
`{`/`[` opener and returns the first slice that successfully `JSON.parse`s,
falling back to the original text if no balanced JSON is found.

**Application target**: `eliza/plugins/plugin-elizacloud/models/object.ts`
(the workspace source inside the eliza submodule), NOT
`node_modules/@elizaos/plugin-elizacloud`.

**Manual application** (until the postinstall hook is updated to target the
workspace source):

```powershell
cd a:\programa\ai\milaidy\eliza
git apply ..\patches\elizacloud\0002-extract-balanced-json-walker.patch
cd plugins\plugin-elizacloud
bun run build
```

Then restart the dev server. The fix takes effect on next plugin load /
re-stage.

**Cleanup** gated on either:
- The walker landing upstream in `elizaOS/eliza` (e.g. via a Milady-authored
  PR mirroring `elizaos-plugins/plugin-elizacloud#18` against the monorepo)
- Or `scripts/patch-elizacloud.mjs` being rewritten to apply patches to the
  workspace source rather than `node_modules`
