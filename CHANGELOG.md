# Changelog

All notable changes to oh-my-memories will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-alpha.4] - 2026-05-18

### Added
- **M5 Gemini CLI adapter** (Cat A): reads `~/.gemini/tmp/<hash>/chats/*.jsonl` session files and `GEMINI.md`, using shared `streamJsonl` + `extractTextBlocks` from `@oh-my-memories/adapter-shared`.
- **M5 Basic Memory adapter** (Cat B): reads `~/basic-memory/**/*.md` Markdown files with YAML frontmatter (title, tags, note_type, timestamps).
- **M5 OpenCode adapter** (Cat A): reads `~/.local/share/opencode/` sessions (platform-aware: `LOCALAPPDATA` on Windows, `XDG_DATA_HOME` on Linux/macOS) by parsing tiered `message/*.json` + `part/*.json` structure.
- **M5 `omem adapter search`**: queries the npm registry for `@omem-adapter/*` packages with display name, version, and description.
- **M5 `omem stats`**: scans all detected adapters and reports per-source record counts, corrupt lines, and presence status.
- **M5 `omem prune`**: removes records from the canonical SQLite store by age (`--older-than <duration>`) and/or deduplication (`--deduplicate`, keeps newest per fingerprint).
- New error code: `OMEM-E45-SEARCH-FAILED`.
- E2E test for adapter install roundtrip: install → list → uninstall → verify removal (`tests/e2e/adapter.e2e.test.ts`, 5 new tests).
- `.cursor/rules/release-checklist.mdc`: pre-release documentation currency and quality checklist.
- M5 roadmap plan in `docs/ROADMAP.md`.

### Changed
- `VERSION` bumped to `0.1.0-alpha.4`.
- Built-in adapter count: 4 → 7 (added gemini-cli, basic-memory, opencode).
- `docs/CLI.md` updated with `omem stats`, `omem prune`, and `omem adapter search` sections.
- `AGENTS.md`, `README.md`, `ADAPTER-SDK.md`, `ROADMAP.md` updated for M5 scope.

### Fixed
- All pre-existing typecheck errors resolved (unused imports, `exactOptionalPropertyTypes` mismatches, `FakeAdapter` missing `storageRoot`). TypeScript `tsc --noEmit` now exits clean.
- Suite total now **511 tests**, 0 failures.

## [0.1.0-alpha.3] - 2026-05-18

### Added
- **M4 Adapter SDK 1.0.0**: `@oh-my-memories/adapter-sdk` is now semver-major-stable. Breaking changes require a 2.0.0 bump. Changes in this release: `ScanOptions.query` field for remote pre-filtering hints; `IBaseAdapter.version?: string` for adapter self-reporting; `ISaasAdapter.fetchRecords()` deprecated (use `scan(opts)` with `opts.query`); orphaned `ScanResult` type retained but marked as optional statistics, not part of `scan()` return type.
- **M4 Plugin loader** (`platform/plugin-loader.ts`): scans `~/.omem/node_modules/@omem-adapter/*`, dynamically imports each package, validates the default export against `IBaseAdapter`, handles ID collisions (`OMEM-W02`), and wraps sync generator `scan()` into `AsyncIterable` automatically.
- **M4 Plugin installer** (`platform/plugin-installer.ts`): `installPlugin(spec)` delegates to `bun add` or `npm install --prefix ~/.omem/node_modules` (first found in PATH). Supports npm names, `name@version`, and local paths. `uninstallPlugin(pkg)` removes by package directory.
- **M4 `omem adapter` command** with three subcommands: `list` (built-ins + plugins, JSON schema with `id/category/version/builtin`), `install <spec>`, `uninstall <id-or-pkg>`.
- **M4 async adapter registry**: `loadAllAdapters()` and `loadAdapterById()` in `adapters.ts`; built-in sync variants deprecated. `scan`, `recall`, and `migrate` commands now route through the async variants so plugin adapters are available everywhere.
- New error codes: `OMEM-E40-NO-PACKAGE-MANAGER`, `OMEM-E41-PLUGIN-INSTALL-FAILED`, `OMEM-E42-PLUGIN-LOAD-FAILED`, `OMEM-E43-PLUGIN-NOT-FOUND`, `OMEM-E44-PLUGIN-UNINSTALL-FAILED`; new warning `OMEM-W02-PLUGIN-ID-COLLISION`.
- New tests: 7 unit tests for `plugin-loader.test.ts` (100% coverage), 11 CLI integration tests for `adapter-cmd.test.ts`. Suite total now **478 tests**.

### Changed
- `VERSION` bumped to `0.1.0-alpha.3` (unreleased).
- `docs/ADAPTER-SDK.md` rewritten with M4 packaging guide (default export contract, `package.json` template, `peerDependencies`, local-path install workflow).
- Global help text and `help.ts` updated with M4 `adapter` commands.

## [0.1.0-alpha.2] - 2026-05-18

### Added
- **M2.A migration**: `omem migrate --from=<src> --to=<dest>` with dry-run by default, `--apply` to write, conflict policies (`skip-on-conflict`, `overwrite`, `newest-wins`), session filter, and per-run JSON manifest under `~/.omem/migrations/`. Backed by a new `IWritableAdapter` interface in `@oh-my-memories/adapter-sdk` (probeWrite + writeRecord) implemented by Cursor, Codex, and Claude Code adapters.
- **M2.B portability**: `omem export [--all|--from=<src>...] --output=<archive.tar.gz>` writes a streaming `.tar.gz` archive with a versioned `manifest.json` listing every file. `omem import <archive>` round-trips it back, dry-run by default with `--apply`, conflict policies, and `--target` to redirect destination.
- **M2.C self-update**: `omem upgrade [--check]` queries the npm registry (5s timeout, network-failure-tolerant), compares against the current version, and either prints install instructions or runs `bun install -g oh-my-memories@latest`.
- **M3 canonical store (the L2 engine)**: `bun:sqlite` + FTS5 with `unicode61 remove_diacritics 2` tokenizer, schema versioning via `schema_meta` (with `OMEM-E33` thrown when the on-disk DB is newer than the binary), and migrations under `packages/core/src/migrations/` (inlined into the bundle for `bun build --compile`).
- **M3 `omem remember <text>`**: writes to `~/.omem/canonical.db`, dedupes by content fingerprint, supports `--source/--session/--role/--metadata/--timestamp`, returns the record id + fingerprint.
- **M3 BM25 + RRF fusion in `omem recall`**: the `recall()` federation now opens the canonical store (when present) and merges BM25-scored canonical hits with adapter scan results via Reciprocal Rank Fusion (k=60, Cormack/Buettcher 2009 default). Records appearing in both lists are deduped by fingerprint and accumulate fused score. Cold-start safe: a missing `canonical.db` is silently skipped. JSON output now carries `origin: "adapter" | "canonical"` per hit.
- New error codes: `OMEM-E26..E28` (import), `OMEM-E29..E33` (remember + canonical store schema/IO), `OMEM-E34-CANONICAL-RUNTIME` (canonical features require Bun runtime or a Bun-compiled binary).
- **M1.1 MCP server**: `omem mcp serve` boots an MCP stdio server exposing two read-only tools — `omem_recall` (federated search) and `omem_scan` (source inventory) — backed by the same federation/inventory paths as the CLI.
- **M1.1 IDE wiring**: `omem mcp install --ide=<claude-code|cursor|codex>` registers the `oh-my-memories` MCP server in each IDE's config (`~/.claude.json`, `~/.cursor/mcp.json`, `~/.codex/config.toml`), idempotent and surgical (other servers in the file are preserved). `omem mcp uninstall` reverses it.
- `@modelcontextprotocol/sdk@^1.29.0` and `zod@4` as runtime dependencies of `@oh-my-memories/mcp`.
- New tests: 20 in `packages/mcp/tests/{tools,installer,server}.test.ts` (incl. an in-memory MCP transport contract test), 7 in `packages/cli/tests/mcp-cmd.test.ts`, 16 in `packages/core/tests/{migrate,export,import}.test.ts`, 27 in `packages/core/tests/canonical-store.test.ts`, 9 in `packages/cli/tests/remember-cmd.test.ts`, 5 in `packages/cli/tests/recall-cmd.test.ts`, 7 new RRF-fusion tests in `packages/core/tests/federation.test.ts`. Suite total now **455 tests**.

### Changed
- `VERSION` bumped from `0.1.0-alpha.1` to `0.1.0-alpha.2`.
- `omem recall` now always passes `canonicalStorePath` to federation; the canonical arm is automatically engaged when `~/.omem/canonical.db` exists.
- `omem recall` honours `OMEM_HOME_OVERRIDE` for hermetic CLI integration tests, matching `omem migrate/export/import`.
- New `canonicalDbPath()` helper in `packages/cli/src/platform/paths.ts` is the single source of truth for `${OMEM_HOME}/canonical.db`. `omem remember` and `omem recall` both use it.
- CLI dispatcher: `migrate`, `export`, `import`, `upgrade`, `remember` are now real subcommands. The `M1_1_COMMANDS` / `M2_COMMANDS` "not yet implemented" gates are empty.
- `RecallHit` interface gained an `origin: 'adapter' | 'canonical'` field.
- `RecallOptions` interface gained an optional `canonicalStorePath: string` field.

### Fixed
- SQLite WAL mode caused `EBUSY` errors on Windows test cleanup. The canonical store now uses `journal_mode = DELETE` (single-user CLI workload, no concurrent writers).
- `omem upgrade` previously hung on slow/offline networks. Added a 5-second `AbortController` timeout to the npm-registry fetch.
- The Node-targeted CJS bundle (`packages/cli/dist/cli.cjs`) was implicitly bundling `bun:sqlite`, which crashed `node ./dist/cli.cjs ...` with `Cannot find module 'bun:sqlite'`. The build now passes `--external bun:sqlite`, and `canonical-store.ts` lazy-loads `bun:sqlite` via `createRequire(import.meta.url)` after a runtime check (`isBun`). Under Node, canonical-store features now fail cleanly with `OMEM-E34-CANONICAL-RUNTIME` and a "install Bun / use the prebuilt binary" hint, while adapter-only commands (`recall`, `scan`, `migrate`, `export`, `import`, `upgrade`, `mcp install`) continue to work.

### Known issues
- 9 pre-existing typecheck errors in test files (`packages/mcp/tests/tools.test.ts`, `packages/cli/tests/upgrade-cmd.test.ts` fetch cast). These do not block the test suite (455/455 pass) and predate M2; tracked separately for cleanup. **Fixed in 0.1.0-alpha.4.**

## [0.1.0-alpha.1] - 2026-05-15

### Added
- **M0.5 distribution**: top-level npm package renamed from `@oh-my-memories/cli` → `oh-my-memories` so `npx oh-my-memories` and `npm i -g oh-my-memories` work.
- `bin/omem.cjs` Node-friendly shim. Loads the bundled CLI under Node and falls back to TypeScript source under Bun for local development.
- `bun build --target=node --format=cjs` packaging script (`packages/cli/scripts/copy-skills.cjs` ships the IDE skill packs into the published tarball).
- `bun build --compile` scripts for macOS x64/arm64, Linux x64, and Windows x64 standalone binaries.
- `.github/workflows/release.yml`: tagged release pipeline that builds binaries on each platform, publishes to npm with the correct dist-tag (`alpha`/`beta`/`next`/`latest`), and attaches binaries to the GitHub release.
- Design specs for upcoming milestones:
  - `specs/iwritable-adapter-mini-spec.md` — IWritableAdapter interface + dry-run-by-default safety model + per-adapter write notes (M2.A).
  - `specs/m3-canonical-store-spec.md` — SQLite (bun:sqlite + better-sqlite3) + FTS5 BM25 + RRF + schema versioning (M3).

### Changed
- `VERSION` bumped from `0.0.0` to `0.1.0-alpha.1`.
- `packages/cli/src/commands/skills.ts` `resolveSkillSource` now also looks in `<package>/skills/<ide>/SKILL.md` so the published tarball can find its bundled IDE skills.
- `.gitignore` excludes `packages/cli/skills/` (synced from repo-root `/skills/` on every build).

## [0.0.0] - 2026-05-14

### Added
- Initial monorepo scaffold (packages/cli, core, mcp, adapter-sdk, adapters/{claude-code, cursor, codex, serena, _shared})
- Tier 1 rule files: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`
- Tier 2 rule files: `.cursor/rules/{monorepo, adapter-design, testing, conventions}.mdc`
- Tier 3 docs: `docs/{PRODUCT, ARCHITECTURE, MIGRATION, ROADMAP, ADAPTER-SDK}.md`
- Specs migrated from loci-v2: `ceo-review-verdict.md`, `eng-review-verdict.md`, `product-formation.md`
- Research migrated from loci-v2: A/B/D/E/F/G/SUMMARY
- Bun + Biome + TS strict configuration
- Project bootstrap. Successor to `loci`.
