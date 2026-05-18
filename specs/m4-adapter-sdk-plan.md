# M4 Plan — Adapter SDK as Public Surface

**Branch:** main · **Status:** Draft (for review)
**Prerequisites:** M3 shipped (v0.1.0-alpha.2 tagged, release.yml queued)

---

## What M4 Is

Make it possible for a developer outside this monorepo to publish an adapter
(`@omem-adapter/basic-memory`, `@omem-adapter/obsidian`, …), install it with one
command, and have `omem recall` automatically use it — without touching this repo.

This is the **ecosystem unlock**: M1–M3 made the hub work for _us_; M4 makes it
extensible for _everyone_.

---

## Scope

| Component | What ships |
|-----------|-----------|
| `@oh-my-memories/adapter-sdk@1.0.0` | Semver-stable public types; no breaking changes without a major bump |
| `omem adapter list` | Shows built-ins + installed plugins + available on npm |
| `omem adapter install <name>` | Installs an `@omem-adapter/<pkg>` into `~/.omem/node_modules/` and registers it |
| `omem adapter uninstall <name>` | Removes it |
| Plugin loader | Dynamically loads registered adapters from `~/.omem/node_modules/` |
| `docs/ADAPTER-SDK.md` expanded | End-to-end guide: scaffold → test → publish → install |

**Explicitly NOT in M4:**
- Writing to plugin adapters (write-side is `IWritableAdapter`, M2 shipped that interface; plugin adapters can implement it but M4 won't add new orchestration)
- A plugin registry UI or web search
- Cat C (SaaS) adapter packaging (different auth patterns; defer to M5)
- Adapter auto-update mechanism
- Version pinning / lockfile for plugins

---

## Design Decisions

### D1: Plugin storage location — `~/.omem/node_modules/` (not global npm)

A bun-compiled binary cannot dynamically `import()` packages from `NODE_PATH`
because the module resolver in the compiled artifact doesn't walk the host machine's
global npm tree. Two workable options:

**Option A: Dedicated `~/.omem/node_modules/`**
- `adapter install` runs: `cd ~/.omem && bun add @omem-adapter/<name>`  (or npm install if bun unavailable)
- Plugin loader resolves: `join(OMEM_HOME, 'node_modules', '@omem-adapter', name, 'index.js')`
- Works under Node CJS bundle AND bun; no PATH dependencies; hermetic per-user install

**Option B: Global npm/bun install + scan**
- `npm install -g @omem-adapter/<name>`
- Must locate global prefix at runtime: slow, platform-dependent, breaks in sandboxed envs
- Compiled binary can't import from global npm tree

→ **Decision: Option A.** `~/.omem/node_modules/` is the plugin home.

### D2: Plugin registration — config entry vs. filesystem scan

Filesystem scan (all `@omem-adapter/*` dirs found under `~/.omem/node_modules/`)
vs. explicit list in config.

→ **Decision: filesystem scan.** No config entry needed. If the directory exists under
`~/.omem/node_modules/@omem-adapter/`, it's an installed plugin. This makes
`adapter install` / `uninstall` the single source of truth (install = add dir,
uninstall = remove dir). Avoids config drift.

### D3: Plugin validation at load time

Load the adapter, check `typeof instance.id === 'string'` + `typeof instance.detect === 'function'`
+ `typeof instance.scan === 'function'`. If validation fails, emit a warning to stderr
and skip (don't crash `omem recall` because one broken plugin is installed).

### D4: Adapter SDK 1.0.0 — what to freeze vs. fix first

Issues found in current SDK before we freeze:
1. `ScanResult` (defined in `index.ts`) is a useful summary type but nothing in `IBaseAdapter` returns it — it's orphaned. Resolution: remove from interface contract; keep as utility type adapters may return internally. Document that callers use the summary emitted by the CLI, not from the adapter directly.
2. `ISaasAdapter.fetchRecords(query?: string)` diverges from `IBaseAdapter.scan(opts?: ScanOptions)`. SaaS adapters currently bypass the `scan()` contract. Resolution: deprecate `fetchRecords()` in 1.0.0 and have SaaS adapters implement `scan()` with the `ScanOptions.query` field added; remove `fetchRecords()` in 2.0.0.
3. `IWritableAdapter` is stable; keep as-is.
4. Add `readonly version: string` field to `IBaseAdapter` (optional, `"0.0.0"` default) — lets `adapter list` show adapter package version.

---

## File Map

### New files
```
packages/cli/src/commands/adapter.ts          — omem adapter list / install / uninstall
packages/cli/src/plugin-loader.ts             — discovers + imports adapters from ~/.omem/node_modules/
packages/cli/src/plugin-installer.ts          — wraps bun/npm for install / uninstall
packages/cli/tests/adapter-cmd.test.ts        — unit tests for the adapter command
packages/cli/tests/plugin-loader.test.ts      — unit tests for discovery
tests/e2e/adapter.test.ts                     — end-to-end: install a fixture adapter, list it, use in recall
tests/fixtures/adapter-plugin/               — minimal @omem-adapter/test-plugin fixture
```

### Modified files
```
packages/adapter-sdk/src/index.ts             — remove ScanResult from interface; add optional version; deprecate ISaasAdapter.fetchRecords
packages/adapter-sdk/package.json             — bump to 1.0.0
packages/cli/src/adapters.ts                  — add loadPluginAdapters() call in createAllAdapters()
packages/cli/src/parse/dispatcher.ts          — add 'adapter' subcommand routing
docs/ADAPTER-SDK.md                           — full end-to-end author guide
CHANGELOG.md                                  — M4 section
```

---

## Implementation Sequence

1. **SDK 1.0.0 prep** — fix `ISaasAdapter.fetchRecords` → `scan()`, add `version?`, bump package.json
2. **Plugin loader** — `plugin-loader.ts` scans `~/.omem/node_modules/@omem-adapter/*/` and dynamic-imports each
3. **Wire loader into `createAllAdapters()`** — `adapters.ts` appends plugin adapters after built-ins
4. **`adapter install/uninstall`** — `plugin-installer.ts` + `commands/adapter.ts`
5. **`adapter list`** — `commands/adapter.ts` list subcommand showing built-ins + plugins + optional npm registry query
6. **Tests** — unit tests for loader/installer, E2E for install → scan → recall cycle
7. **Docs** — `ADAPTER-SDK.md` expanded with packaging guide

---

## Acceptance Criteria

```
# Install a community adapter (simulated locally in E2E)
omem adapter install test-plugin
# → downloads @omem-adapter/test-plugin into ~/.omem/node_modules/

omem adapter list
# → shows claude-code, cursor, codex, serena (built-in) + test-plugin (plugin, v0.1.0)

omem recall "hello" --all
# → includes records from test-plugin

omem adapter uninstall test-plugin
# → removes it; omem list no longer shows it
```

---

## Risks

| Risk | Mitigation |
|------|-----------|
| `bun add` not available on user's machine | Fall back to `npm install`; show install instructions if both absent |
| Dynamic `import()` path on Windows | Use `pathToFileURL()` wrapper; E2E test must pass on Windows |
| Plugin exports unexpected shape | Validation gate in loader; skip + warn instead of crash |
| `@omem-adapter/*` namespace squatting on npm | Docs say use the namespace; we can't prevent it; validate interface on load |
| Old SDK consumers break on 1.0.0 bump | 0.x → 1.0.0 bump should be fine since we're alpha; changelog note |

---

## Edge Cases (surfaced during review)

### Plugin loading
1. **ID collision with built-in**: If `@omem-adapter/cursor` is installed, two adapters have `id === 'cursor'`. Rule: plugin IDs that conflict with built-ins are skipped at load time with a warning. Built-ins always win.
2. **Adapter package has no valid default export**: Catches this at validation; skips + warns.
3. **`scan()` hangs indefinitely**: `recall` already has `AbortSignal` support in `ScanOptions` — plugins are subject to the same abort, which the existing federation timeout honors.
4. **Plugin throws in `detect()`**: `catch` in loader; skip + warn. Don't let one broken plugin kill the whole session.
5. **`scan()` returns sync iterable instead of AsyncIterable**: Validation gate catches it. Error: "adapter 'foo' scan() must return AsyncIterable."

### Install/uninstall
6. **`~/.omem/node_modules/` doesn't exist**: `adapter install` must `mkdir -p ~/.omem && cd ~/.omem && bun init -y` (or `npm init -y`) before `bun add`.
7. **Package isn't an omem adapter**: Install succeeds but `adapter list` shows a warning.
8. **Local path install with relative path**: Resolve relative to `process.cwd()` before passing to bun/npm.
9. **bun AND npm both absent**: Error with `OMEM-E35-NO-PACKAGE_MANAGER` + install instructions.
10. **Version pinning**: `omem adapter install foo@0.2.0` → passes `@omem-adapter/foo@0.2.0` to bun/npm.

### API change in `adapters.ts`
11. `createAllAdapters()` stays sync (built-ins only, backward compat).
12. New `loadAllAdapters(opts?): Promise<AnyAdapter[]>` = built-ins + plugins. Callers: scan, recall, doctor, migrate, export, adapter commands.
13. New `loadAdapterById(id, opts?): Promise<AnyAdapter | undefined>` — checks built-ins first, then plugins. Used by migrate.

### SDK 1.0.0 semantics
14. `MemoryRole: 'tool'` stays as-is. Adapter authors that receive `'function'` from OpenAI-style logs must map it to `'tool'`.
15. Sync generator for `scan()`: validation must catch this with clear error.

---

## Resolved Questions

1. **`omem adapter list --available`**: `list` shows installed by default (fast, no network). Add `--available` flag that queries npm for `@omem-adapter/*` search. Deferred network call.
2. **Version pinning**: Yes, `omem adapter install foo@0.2.0` → `@omem-adapter/foo@0.2.0`. Support `@latest` too.
3. **E2E fixture**: A local path fixture adapter in `tests/fixtures/adapter-plugin/` with its own `package.json`. E2E uses `omem adapter install ./tests/fixtures/adapter-plugin` — no npm network dependency in tests.
4. **Local path install**: `omem adapter install ./path` must ship in M4 (DX requirement for adapter authors to test before publish).
5. **`omem doctor` plugin check**: `omem doctor` gains a "plugin health" section that loads all plugins and reports any that fail validation.
