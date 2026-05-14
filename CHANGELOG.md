# Changelog

All notable changes to oh-my-memories will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial monorepo scaffold (packages/cli, core, mcp, adapter-sdk, adapters/{claude-code, cursor, codex, serena, _shared})
- Tier 1 rule files: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`
- Tier 2 rule files: `.cursor/rules/{monorepo, adapter-design, testing, conventions}.mdc`
- Tier 3 docs: `docs/{PRODUCT, ARCHITECTURE, MIGRATION, ROADMAP, ADAPTER-SDK}.md`
- Specs migrated from loci-v2: `ceo-review-verdict.md`, `eng-review-verdict.md`, `product-formation.md`
- Research migrated from loci-v2: A/B/D/E/F/G/SUMMARY
- Bun + Biome + TS strict configuration

## [0.0.0] - 2026-05-14

- Project bootstrap. Successor to `loci`.
