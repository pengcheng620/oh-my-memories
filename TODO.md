# TODO

> Quick board — current in-progress, next-up, and blockers.
> For the full plan with DoD, dependencies, and lanes see [`docs/PLAN.md`](./docs/PLAN.md).
> For milestones overview see [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Now (in-progress)

- [ ] **spec.md rewrite** — merge ceo-verdict + eng-verdict + product-formation + G-skill-vs-mcp into a single canonical M1 spec. _Owner: lup. Blocks: devex-review, M1 worktree._
- [ ] **plan-devex-review** — gstack DevEx review of `omem` CLI surface (command names, flags, output, error messages, install flow). _Blocked by: spec.md rewrite._
- [ ] **GitHub repo creation + first push** — `gh repo create` + push `dbae586`. _No blocker; just a button-press._

## Next (M1 — 5 parallel lanes)

> Open one branch per lane. See [`docs/PLAN.md`](./docs/PLAN.md) § M1 Lanes for branch names, deps, DoD.

- [ ] **Lane A** — `packages/adapters/claude-code` (full impl + tests + fixtures)
- [ ] **Lane B** — `packages/adapters/cursor` (full impl + tests + fixtures)
- [ ] **Lane C** — `packages/adapters/codex` (full impl + tests + fixtures)
- [ ] **Lane D** — `packages/adapters/serena` (full impl + tests + fixtures)
- [ ] **Lane E** — `packages/core/{inventory,federation}` complete + `packages/cli/commands/{init,scan,recall,doctor,config}` + `safety/denylist` + `platform/*` + `output/{table,json}` + `skills install` + E2E tests

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
