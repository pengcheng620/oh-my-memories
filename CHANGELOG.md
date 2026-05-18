# Changelog

All notable changes to oh-my-memories will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- 9 pre-existing typecheck errors in test files (`packages/mcp/tests/tools.test.ts`, `packages/cli/tests/upgrade-cmd.test.ts` fetch cast). These do not block the test suite (455/455 pass) and predate M2; tracked separately for cleanup.

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
