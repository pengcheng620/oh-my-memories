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

## Next (M1 — 5 parallel lanes)

> Open one branch per lane. See [`docs/PLAN.md`](./docs/PLAN.md) § M1 Lanes for branch names, deps, DoD.

- [x] **Lane A** — `packages/adapters/claude-code` _Merged @ b154988._
- [x] **Lane B** — `packages/adapters/cursor` _Merged @ 957f582._
- [x] **Lane C** — `packages/adapters/codex` _Merged @ ec5286d._
- [x] **Lane D** — `packages/adapters/serena` _Merged @ 804cb3b._
- [ ] **Lane E1** — CLI shell + Tier 2 error contract: dispatcher, `output/error.ts` + `error-catalog.ts`, `output/{table,json}.ts`, `parse/duration.ts`, `OMEM_HOME` + `NO_COLOR` + `OMEM_NON_INTERACTIVE` env wiring, `tests/contract/{help,error-catalog,duration}.test.ts`. Uses fixture data, no real adapter calls. _Branch: `feat/m1-cli-shell`._
- [ ] **Lane E2** — federation + commands + skills install: wires E1 into real adapters via `commands/{init,scan,recall,doctor,config}`, `core/{inventory,federation}`, `safety/denylist`, `skills install`, `tests/e2e/*`. Depends on E1 + ≥1 of A–D. _Branch: `feat/m1-cli-wiring`._

## After M1 (in priority order)

- [ ] **M1.1** — MCP server (`packages/mcp/`) + `omem mcp serve` + `omem mcp install --ide=<ide>`
- [ ] **M2.A** — Migration (`omem migrate --from --to --dry-run --apply`) + `IWritableAdapter`
- [ ] **M2.B** — Backup (`omem export --all` / `omem import <archive>`)
- [ ] **M2.C** — Self-update (`omem upgrade`)
- [ ] **M3** — Canonical store (SQLite + FTS5) + `omem remember` + (opt-in) `sqlite-vec` + RRF
- [ ] **M4** — Public Adapter SDK semver-major freeze + `omem adapter list/install` + plugin discovery
- [ ] **M5+** — Team / shared store, web UI, cross-machine sync, Cat C SaaS adapters (mem0/Letta/Zep/Cognee)

## Blockers / risks

- **None blocking M1 right now.** Spec rewrite is queued, not blocked.
- **Watching**: MCP SDK changes in Anthropic's Q3 release cycle (could affect M1.1 work plan).
- **Watching**: Codex / Cursor on-disk format changes (we tolerate schema drift, but adapter tests need keeping current).

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
