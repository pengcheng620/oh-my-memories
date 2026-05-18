# TODO

> Quick board — current in-progress, next-up, and blockers.
> For the full plan with DoD per lane, dependencies, branch names, and merge order see [`docs/PLAN.md`](./docs/PLAN.md).
> For milestones overview see [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Now (in-progress)

- [x] **spec.md rewrite** — merged ceo-verdict + eng-verdict + product-formation + G-skill-vs-mcp into the canonical M1 spec. _Done @ 85da57d._
- [x] **plan-devex-review** — gstack DevEx review of `omem` CLI surface produced `specs/devex-review-verdict.md` (4 locked decisions D1–D4, 8 pass scorecard, Lane E checklist). _Done._
- [x] **Second-opinion review on D1–D4** — Cursor `code-reviewer` subagent (codex CLI was unreachable). Verdict PASS-WITH-NOTES, fixes applied, Lane E split into E1 + E2. _See `specs/devex-review-verdict.md` §15._
- [x] **`docs/PLAN.md`** — six-lane plan with DoD, file ownership, dependencies, branch names, merge order, risk register. _Done._
- [x] **Lane A complete** — squash-merged as [`b154988`](https://github.com/pengcheng620/oh-my-memories/commit/b154988) via PR [#1](https://github.com/pengcheng620/oh-my-memories/pull/1). All 7 CI checks green across Ubuntu/macOS/Windows. Worktree + branch cleaned up. The `claude-code` adapter is now the reference shape for Lanes B/C/D.
- [x] **Lane B complete** — squash-merged as [`957f582`](https://github.com/pengcheng620/oh-my-memories/commit/957f582) via PR [#2](https://github.com/pengcheng620/oh-my-memories/pull/2). All 7 CI checks green. Worktree + branch cleaned up.
- [x] **Lane D complete** — squash-merged as [`804cb3b`](https://github.com/pengcheng620/oh-my-memories/commit/804cb3b) via PR [#3](https://github.com/pengcheng620/oh-my-memories/pull/3). All 7 CI checks green across Ubuntu/macOS/Windows. Worktree + branch cleaned up. Cat B (MCP) markdown + frontmatter adapter, schema version `serena/2026-05`.
- [x] **Lane C complete** — squash-merged as [`ec5286d`](https://github.com/pengcheng620/oh-my-memories/commit/ec5286d) via PR [#4](https://github.com/pengcheng620/oh-my-memories/pull/4). All 7 CI checks green across Ubuntu/macOS/Windows. Worktree + branch cleaned up. Cat A streaming JSONL adapter for OpenAI Codex CLI rollouts, schema version `codex/2026-04`. **All 4 M1 adapters (A, B, C, D) are now merged.**
- [x] **Lane S — `_shared` rewire complete** — squash-merged as [`6fc77de`](https://github.com/pengcheng620/oh-my-memories/commit/6fc77de) via PR [#5](https://github.com/pengcheng620/oh-my-memories/pull/5). All 7 CI checks green across Ubuntu/macOS/Windows. Introduces `@oh-my-memories/adapter-shared` (`streamJsonl`, `extractTextBlocks`, `isMemoryRole`, `createParseStats` / `ParseStats`) per `specs/spec.md` §7.2, and rewires CC/Cursor/Codex parsers onto it (-71 net lines across 3 parser.ts files; Serena untouched — it's Markdown). 86 tests / 0 fail (was 69; +17 from the new package). Lane E1 is now fully unblocked.
- [x] **Lane E1 complete** — squash-merged as [`9d2c647`](https://github.com/pengcheng620/oh-my-memories/commit/9d2c647) via PR [#6](https://github.com/pengcheng620/oh-my-memories/pull/6). All 7 CI checks green across Ubuntu/macOS/Windows. CLI shell with Tier 2 error contract, 36 files (+2589/-108), 260 tests. Dispatcher, subcommand stubs (returning wire-shape responses), error-catalog, JSON/table output, duration parser, global flags, denylist safety, platform env detection, contract tests (help ↔ CLI.md, error-catalog, duration). Lane E2 is now fully unblocked.

## M1 — COMPLETE

> All 7 lanes merged. See [`docs/PLAN.md`](./docs/PLAN.md) § M1 Lanes for details.

- [x] **Lane A** — `packages/adapters/claude-code` _Merged @ b154988._
- [x] **Lane B** — `packages/adapters/cursor` _Merged @ 957f582._
- [x] **Lane C** — `packages/adapters/codex` _Merged @ ec5286d._
- [x] **Lane D** — `packages/adapters/serena` _Merged @ 804cb3b._
- [x] **Lane S** — `@oh-my-memories/adapter-shared` _Merged @ 6fc77de._
- [x] **Lane E1** — CLI shell + Tier 2 error contract _Merged @ 9d2c647._
- [x] **Lane E2** — federation + commands + skills install _Merged @ 3f27f00 via PR [#7](https://github.com/pengcheng620/oh-my-memories/pull/7)._ All 7 CI checks green. 294 tests / 0 fail / 731 assertions.

## Next (in priority order)

- [x] **M0.5** — Distribution: package renamed to `oh-my-memories`, node-bundled CLI + Bun-compiled binaries, release.yml workflow, VERSION → `0.1.0-alpha.1`. Tag/publish is a manual one-liner (`git tag v0.1.0-alpha.1 && git push --tags`).
- [x] **M1.1** — MCP server (`packages/mcp/`) + `omem mcp serve` + `omem mcp install --ide=<ide>`. `omem_recall` and `omem_scan` MCP tools wrap `core/federation.recall()` and `core/inventory`. Per-IDE config writers for claude-code/cursor/codex (idempotent merge into `~/.claude.json`, `~/.cursor/mcp.json`, `~/.codex/config.toml`). 27 new tests, 323 total / 0 fail.
- [x] **M2.A** — Migration (`omem migrate --from --to --dry-run --apply`) + `IWritableAdapter` interface (`specs/iwritable-adapter-mini-spec.md`). Skip-on-conflict default, `--i-approve-dest-writes` for non-interactive applies, manifest written under `~/.omem/migrations/`. CC/Cursor/Codex writers shipped.
- [x] **M2.B** — Backup (`omem export [--all\|--from=<src>...] --output=<archive>` / `omem import <archive>`). `.tar.gz` with `manifest.json` (omem version, platform, sources, files). Round-trip dry-run + apply verified. System `tar` used for extract on Windows because the npm `tar` package's extract fails under Bun.
- [x] **M2.C** — Self-update (`omem upgrade [--check]`). Reads npm registry with a 5s `AbortController` timeout, prints install instructions or runs `bun install -g`.
- [x] **M3** — Canonical store: `bun:sqlite` + FTS5 (`unicode61 remove_diacritics 2`) + schema versioning + RRF fusion in `omem recall` (k=60). `omem remember` writes deduped records via fingerprint. The L2 store is the curated copy; canonical wins on ties when records appear in both adapter and canonical results. Cold-start safe: missing `canonical.db` is silently skipped. Migrations under `packages/core/src/migrations/` (inlined for `bun build --compile`). 27 canonical-store tests + 7 RRF-fusion federation tests + 5 recall-cmd CLI tests. Bun runtime gate: when `node ./dist/cli.cjs remember ...` runs, it surfaces `OMEM-E34-CANONICAL-RUNTIME` with a "install Bun / use the prebuilt binary" hint instead of crashing with `Cannot find module 'bun:sqlite'`.
- [ ] **M4** — Public Adapter SDK semver-major freeze + `omem adapter list/install` + plugin discovery
- [ ] **M5+** — Team / shared store, web UI, cross-machine sync, Cat C SaaS adapters (mem0/Letta/Zep/Cognee), `sqlite-vec` opt-in embedding for M3.1, file-watch incremental indexing

## Blockers / risks

- **Watching**: MCP SDK changes — we pinned `@modelcontextprotocol/sdk@^1.29.0`. Anthropic's pre-alpha v2 line is incompatible; do not auto-bump.
- **Watching**: Codex / Cursor on-disk format changes (we tolerate schema drift, but adapter tests need keeping current).
- **Pre-existing typecheck debt**: 9 errors in `packages/mcp/tests/tools.test.ts` (FakeAdapter missing `storageRoot()` method introduced for M2.B export). Tests still pass (455/455) — these are TS-only hygiene issues. Worth a janitor-PR before the next major release. **Lint is clean** as of M3 wrap-up (`bun run lint` exits 0).
- **bun:sqlite WAL mode + Windows**: WAL journal mode held `.wal/.shm` handles open after `db.close()` on Windows, wedging test cleanup. Switched to `journal_mode = DELETE` (single-user CLI is fine) and added defensive `try/catch` around test `rmSync`. Documented in `packages/core/src/canonical-store.ts`.

## Decisions log (where to find rationale)

When in doubt about "why is it this way", consult:

| Decision area | File |
|----|----|
| Product positioning, 3 layers × 2 things | [`specs/ceo-review-verdict.md`](./specs/ceo-review-verdict.md) |
| Architecture, 6 issues, parallelization | [`specs/eng-review-verdict.md`](./specs/eng-review-verdict.md) |
| Naming, repo, monorepo, language, CLI surface | [`specs/product-formation.md`](./specs/product-formation.md) |
| M1 = CLI + Skill, MCP → M1.1 | [`research/G-skill-vs-mcp.md`](./research/G-skill-vs-mcp.md) |
| Canonical M1 spec (replaces all of the above for implementation reference) | [`specs/spec.md`](./specs/spec.md) |
| CLI defaults, error contract, init UX, Lane E checklist | [`specs/devex-review-verdict.md`](./specs/devex-review-verdict.md) |
