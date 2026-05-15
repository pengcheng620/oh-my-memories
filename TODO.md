# TODO

> Quick board — current in-progress, next-up, and blockers.
> For the full plan with DoD per lane, dependencies, branch names, and merge order see [`docs/PLAN.md`](./docs/PLAN.md).
> For milestones overview see [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Now (in-progress)

- [x] **spec.md rewrite** — merged ceo-verdict + eng-verdict + product-formation + G-skill-vs-mcp into the canonical M1 spec. _Done @ 85da57d._
- [x] **plan-devex-review** — gstack DevEx review of `omem` CLI surface produced `specs/devex-review-verdict.md` (4 locked decisions D1–D4, 8 pass scorecard, Lane E checklist). _Done._
- [x] **Second-opinion review on D1–D4** — Cursor `code-reviewer` subagent (codex CLI was unreachable). Verdict PASS-WITH-NOTES, fixes applied, Lane E split into E1 + E2. _See `specs/devex-review-verdict.md` §15._
- [x] **`docs/PLAN.md`** — six-lane plan with DoD, file ownership, dependencies, branch names, merge order, risk register. _Done._
- [ ] **Open lane worktrees** — open A first (blocker), then B/C/D/E1 in parallel, E2 last. See `docs/PLAN.md` §1 + §4. _Use the `using-git-worktrees` skill for safe worktree creation._

## Next (M1 — 5 parallel lanes)

> Open one branch per lane. See [`docs/PLAN.md`](./docs/PLAN.md) § M1 Lanes for branch names, deps, DoD.

- [ ] **Lane A** — `packages/adapters/claude-code` (full impl + tests + fixtures)
- [ ] **Lane B** — `packages/adapters/cursor` (full impl + tests + fixtures)
- [ ] **Lane C** — `packages/adapters/codex` (full impl + tests + fixtures)
- [ ] **Lane D** — `packages/adapters/serena` (full impl + tests + fixtures)
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
