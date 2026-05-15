# Changelog

All notable changes to oh-my-memories will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
