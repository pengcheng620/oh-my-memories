# DevEx Review Verdict — `omem` CLI surface (`docs/CLI.md`)

> **Status**: M1 review · taste calls captured with recommended picks (user skipped consolidated decision round; recommendations stand pending later override)
> **Reviewer mode**: DX EXPANSION (new developer-facing product)
> **Date**: 2026-05-15
> **Artifact under review**: [`docs/CLI.md`](../docs/CLI.md) (75 lines, M1 surface) + dispatcher in `packages/cli/src/index.ts`
> **Pre-read**: [`specs/spec.md`](./spec.md) · [`docs/PRODUCT.md`](../docs/PRODUCT.md) · [`AGENTS.md`](../AGENTS.md) · [`research/G-skill-vs-mcp.md`](../research/G-skill-vs-mcp.md)

This verdict closes the gstack workflow chain (CEO → Eng → DevEx) and unblocks the M1 lane assignments in [`TODO.md`](../TODO.md). Lane E (`packages/cli/src/commands/*` + dispatcher) MUST honour the four locked decisions in §6 before merging.

---

## 1. Developer Persona

```text
TARGET DEVELOPER PERSONA — "Multi-Tool Mid-Senior Dev"
======================================================
Who:       Mid-to-senior engineer using 3-4 AI coding tools concurrently
           (typical mix: Claude Code + Cursor + Codex + Serena MCP)
Context:   Has hit the cross-tool memory gap personally — the wedge is
           lived experience, not theoretical
Tolerance: ~5 min from `npm install -g` to first successful federated
           recall before they pivot to "this is broken" or "I'll write
           my own"
Expects:   npm-installable single binary · opinionated defaults that
           Just Work · `--json` output everywhere agents touch · CI-safe
           non-interactive mode · POSIX conventions (`-h`, `--help`,
           `NO_COLOR`, repeatable flags)
```

This persona matches the project's own dogfood case: lup is the canonical user. Decisions throughout this verdict are calibrated to "lup, on a fresh machine, in 2026."

---

## 2. Developer Empathy Narrative

> _T+0:00_ — I `npm install -g oh-my-memories`. Fast. The README's tagline matches my actual pain (Cursor can't see my Claude Code history), so I'm motivated.
>
> _T+0:30_ — I run `omem init`. The README says it "writes `~/.omem/config.json`" but I don't know if it's interactive, what it asks, or if I can re-run it. I run it anyway. _What does it do?_
>
> _T+1:00_ — I run `omem scan`. I see a table. Good. I have CC, Cursor, Codex, Serena detected. Nice.
>
> _T+1:30_ — I want to recall something. I type `omem recall "websocket reconnect"`. The CLI returns no hits — but I have plenty of websocket discussions in CC. _Why nothing?_
>
> _T+2:30_ — I read `omem recall --help`. The default scope is `(current)`. What's "current"? I never set one. **I have to add `--all` to do the obvious thing.** Mild irritation: the headline use-case requires a non-default flag.
>
> _T+3:00_ — `omem recall --all "websocket reconnect" --json` returns hits. I'm in. But the path here was 3 minutes when it should have been 30 seconds, and the friction was a default that didn't match the wedge.
>
> _T+5:00_ — I want to install the Cursor skill. `omem skills install --ide=cursor`. Equals form is unusual; I try `--ide cursor` first, it errors, I notice the equals. Minor noise.
>
> _T+10:00_ — A week later I've forgotten what I configured. `omem doctor` runs but the docs don't tell me what to look for in its output. I run `omem config get` to see all settings — that's not a documented command. **I have to read source to discover the config keys.**

The journey is _functional_ but not _delightful_. The wedge is real, but the first-command UX charges a "remember the special flag" tax.

---

## 3. Competitive DX Benchmark

| Tool | TTHW (install → first useful command) | Notable DX choice | Source |
|----|----|----|----|
| **Stripe CLI** | < 1 min | `stripe login` opens browser; `stripe listen` produces immediate visible event stream | docs.stripe.com |
| **gh (GitHub CLI)** | ~2 min | `gh auth login` walks through device flow; `gh repo view` works instantly | cli.github.com |
| **Vercel CLI** | ~2 min | `vercel` from any project → deploy URL in your terminal | vercel.com/docs |
| **Serena MCP** | ~2 min | `uvx --from git+... serena ...` + edit `.cursor/mcp.json` | github.com/oraios/serena |
| **mem0 SDK** | ~5 min | API key + env var + `Memory().add(...)` example | mem0.ai/docs |
| **`omem` (current plan)** | **~5–7 min** | npm install → init → scan → realise default scope is wrong → retry with `--all` | this verdict |

**Target tier**: Champion (< 2 min) — the wedge ("cross-tool recall in one command") only works if the headline command works on the first try. Today's draft puts us in **Competitive (2–5 min)** because of the default-scope tax in §2.

---

## 4. Magical Moment

The magical moment for `omem` is **the first time `omem recall --all "<query>"` returns a hit from a tool the user wasn't searching from**. Specifically: running it in a terminal that knows nothing about Cursor, getting back a Cursor transcript snippet, and realising the federation actually works.

**Delivery vehicle (recommended)**: a real `--json` output sample captured from CI fixtures, embedded in both the README and `omem --help recall`. M1 should not invest in a sandbox / playground (cost too high for the wedge stage). M2+ can revisit `omem demo` if onboarding telemetry says we need it.

---

## 5. Developer Journey Map (post-fixes)

| Stage | Today | After this verdict |
|----|----|----|
| **Discover** | README pitch is sharp ✅ | unchanged |
| **Install** | `npm install -g oh-my-memories` ✅ | unchanged |
| **Hello world** | `omem init` is a black box · `omem recall "<q>"` defaults to broken `(current)` ❌ | `omem init` documented (interactive default + `--non-interactive`); `omem recall <q>` defaults to `--all` |
| **Real usage** | `--source` (singular) + `--all` (boolean) is two flags doing one job | Keep both for M1; document `--all` as sugar for "every installed"; add `--sources <list>` in M2 (see §10) |
| **Debug** | `omem doctor` is one bullet · errors have no shape | Tier 2 Rust-style errors with codes (`OMEM-E04-PERM`) + `--verbose` + docs URL · `omem doctor` output documented |
| **Upgrade** | M2 `omem upgrade`; `omem doctor` doesn't warn on stale version | `omem doctor` warns if `omem` is > 30 days old (M1.1 nice-to-have, M2 confirmed) |

---

## 6. Locked Decisions (4 taste calls)

User skipped the consolidated decision round; recommended picks stand. Each is reversible — log a `specs/<topic>-decision.md` if revising.

### D1 — Default scope for `omem recall <query>` → **A) Default to `--all`**

**Why**: the wedge is cross-tool federation. The default for the headline command must match the wedge. `(current)` only makes sense once a user has explicitly opted into per-source workflows, which is a power-user case for M2+. **`docs/CLI.md` MUST be updated**: drop the `(current)` row, set `--all` default, keep `--source <id>` as the override.

### D2 — `--source` syntax → **A) Keep `--source <id>` + `--all` for M1; add `--sources <list>` in M2**

**Why**: M1 is read-only and most users just want "everything". The two-flag pattern is fine while `--all` is the dominant use case. M2 introduces `migrate --from / --to` which already requires picking specific sources, so M2 is the natural moment to introduce `--sources <list>` plural form. Document `--all` as "syntactic sugar for `--sources <every-installed>`".

### D3 — Error message tier → **B) Tier 2 Rust-style**

**Why**: Tier 1 (Elm conversational) is a 12-month investment for the prose; Tier 3 (JSON-only) is hostile to humans. Tier 2 hits the DX/maintenance balance: every error has shape `{code, message, hint?, helpUrl?}`, the text path renders a one-line `OMEM-E04-PERM` message followed by a single-sentence hint (run `omem doctor` or fix the path permission), and the `--json` path emits the structured object verbatim. Skills consuming `omem` via `--json` get a stable contract; humans get actionable text. Specifies what `packages/cli/src/output/{table,json}.ts` MUST emit.

### D4 — `omem init` interactivity → **A) Interactive default + `--non-interactive` (and `OMEM_NON_INTERACTIVE=1`)**

**Why**: the persona expects `init` to walk them through detected sources and offer to install skills (matches `gh auth login`, `stripe login`, `vercel` first-run patterns). CI / scripted installs need an escape hatch — `--non-interactive` auto-detects, writes config, and returns a non-zero exit if any prompt would have been mandatory. The env var matches `CI=true` / `NO_COLOR` conventions.

---

## 7. Eight-Pass Scorecard

```text
+======================================================================+
|              DX PLAN REVIEW — SCORECARD                              |
+======================================================================+
| Dimension            | Score | After fixes | Gap                     |
|----------------------|-------|-------------|-------------------------|
| 1. Getting Started   | 5/10  |    8/10     | --non-interactive,       |
|                      |       |             | demo command (M2)        |
| 2. API/CLI/SDK       | 6/10  |    8/10     | --sources <list> (M2)    |
| 3. Error Messages    | 3/10  |    8/10     | per-error help URLs once |
|                      |       |             | docs site exists (M2)    |
| 4. Documentation     | 6/10  |    8/10     | per-command examples,    |
|                      |       |             | --help/CLI.md drift test |
| 5. Upgrade Path      | 7/10  |    7/10     | M2 territory, on-track   |
| 6. Dev Environment   | 5/10  |    8/10     | shell completion (M2),   |
|                      |       |             | NO_COLOR honored         |
| 7. Community         | n/a   |    n/a      | post-M1                  |
| 8. DX Measurement    | 2/10  |    4/10     | opt-in usage telemetry  |
|                      |       |             | gated to M1.1+           |
+----------------------------------------------------------------------+
| TTHW                 | 5–7m  |    < 2m     | matches Champion tier    |
| Competitive Rank     | Comp. |  Champion   | (target from §3)         |
| Magical Moment       | gap   |  designed   | --json sample in README  |
| Mode                 |             DX EXPANSION                       |
+======================================================================+
| DX PRINCIPLE COVERAGE                                                |
| Zero Friction at T0 | gap → covered (default --all)                  |
| Learn by Doing      | partial (no demo command, no playground)        |
| Fight Uncertainty   | gap → covered (Tier 2 error contract)           |
| Opinionated + Esc.  | covered (--non-interactive, OMEM_HOME)         |
| Code in Context     | covered (real --json fixtures in README)        |
| Magical Moments     | covered (real recall hit, M1 scope)             |
+======================================================================+
```

---

## 8. Pass-by-Pass Findings

### Pass 1 — Getting Started (5/10 → 8/10)

- **F1.1 (P0)**: Default scope of `omem recall` is broken for fresh users. → fixed by D1.
- **F1.2 (P0)**: `omem init` is a black box in `docs/CLI.md`. → fixed by §9 doc additions.
- **F1.3 (P1)**: README shows fake output (`# → 12 hits across CC sessions`). Replace with a real `--json` snippet captured from a CI fixture (matches Pass 4's drift-test contract).
- **F1.4 (P2, M2)**: No `omem demo` subcommand. Defer — M1's wedge is real recall on real data; manufactured fixtures dilute the message.

### Pass 2 — API/CLI/SDK (6/10 → 8/10)

- **F2.1 (P0)**: D2 keeps `--source <id>` + `--all` for M1; M2 adds `--sources <list>`.
- **F2.2 (P0)**: `--ide=cursor` only — also accept space form `--ide cursor`. Both must work; document equals form is the canonical example.
- **F2.3 (P1)**: `--since` accepts `7d` / `30d` / `2026-01-01` per CLI.md. **Lock format**: `<n>{s,m,h,d,w,M,y}` relative + ISO-8601 absolute. Reject anything else with `OMEM-E20-DURATION`. Document explicitly.
- **F2.4 (P1)**: `--json` is listed as a global flag at the top but absent from per-command tables for `doctor`, `config get`, `skills install`. Either make it truly global (recommended) or remove from the global table.
- **F2.5 (P1)**: No `omem config list` to discover keys. Add: lists every key, its current value, its default, and whether it's user-set or inherited.
- **F2.6 (P2)**: No `omem completion bash|zsh|fish|pwsh`. Defer to M1.1, but document the placeholder in CLI.md so users know it's coming.
- **F2.7 (P2)**: No mention of `OMEM_HOME` env var to override `~/.omem/`. Add — needed for tests in Lane E.

### Pass 3 — Errors (3/10 → 8/10)

- **F3.1 (P0)**: D3 locks Tier 2 contract. **MUST be implemented in Lane E** (`packages/cli/src/output/error.ts`). Shape:

  ```ts
  type OmemError = {
    code: string;          // e.g. "OMEM-E04-PERM"
    message: string;       // human-readable, one line
    hint?: string;         // suggested fix, one sentence
    helpUrl?: string;      // optional, may be empty in M1
    cause?: unknown;       // for --verbose
  };
  ```

- **F3.2 (P0)**: Exit code 5 (partial success) MUST surface which adapters failed and why on stderr; success rows on stdout. JSON path: `{ ok: false, partial: true, failures: [...], hits: [...] }`.
- **F3.3 (P1)**: Bad CLI args (exit 2) MUST print the failing subcommand's `--help`, not the global help. POSIX convention.
- **F3.4 (P1)**: Define the canonical error catalog in `packages/cli/src/output/error-catalog.ts` (E01-E2x) and lint that no string error literal appears outside that file.

### Pass 4 — Documentation (6/10 → 8/10)

- **F4.1 (P0)**: Each command in CLI.md needs **synopsis · description · options table · examples · exit codes · related commands**. Today most commands are 1-2 sentences. Concrete shape in §9 below.
- **F4.2 (P0)**: CLI.md says "Keep `--help` text and JSON schemas in sync with this file" but no test enforces it. **Add `tests/contract/help.test.ts`** in Lane E: spawn `omem <cmd> --help` and diff against `docs/CLI.md` per-command sections. Fail CI on drift.
- **F4.3 (P1)**: M2+ commands listed without "M2+, not yet — see ROADMAP" guard. Mark them visually (current dispatcher does this in error path; CLI.md should match).

### Pass 5 — Upgrade (7/10 → 7/10)

- **F5.1 (P2, M1.1)**: `omem doctor` should warn if the installed `omem` version is > 30 days old. Single line. Pre-emptive defence against alpha staleness.
- **F5.2 (P2, M2)**: `omem init --reconfigure` to re-run interactive flow without losing existing config (merge, not overwrite).

### Pass 6 — Dev environment (5/10 → 8/10)

- **F6.1 (P0)**: D4 locks `--non-interactive` + `OMEM_NON_INTERACTIVE=1`. Lane E owns.
- **F6.2 (P1)**: Honour `NO_COLOR=1` for all stdout (POSIX standard, see <https://no-color.org>). Trivial in `output/table.ts`.
- **F6.3 (P1)**: `OMEM_HOME` env var MUST override `~/.omem/`. Required for `tests/e2e/` to use throwaway directories.
- **F6.4 (P2, M2)**: Shell completions (`omem completion <shell>`).

### Pass 7 — Community

Out of scope for this review; revisit post-M1 alpha.

### Pass 8 — DX Measurement (2/10 → 4/10)

- **F8.1 (P2, M1.1+)**: Opt-in anonymous telemetry: command name + duration + outcome (success/error/partial) + omem version. **No payloads, no queries, no source paths.** `omem config set telemetry community|anonymous|off`. Local-only `~/.omem/analytics/usage.jsonl` for the user to inspect via `omem stats` (M2). Default: prompt once on `omem init`; default off if the prompt is skipped (ie. CI).

---

## 9. Required Documentation Updates (Lane E delivers)

`docs/CLI.md` MUST be rewritten under this template per command. Skeleton for `omem recall` (apply pattern to all M1 commands):

```markdown
### `omem recall <query> [options]`

**Synopsis**: Federated full-text search across all configured memory sources.

**Description**: Searches every adapter listed in `~/.omem/config.json` (default
behaviour) or a subset (`--source <id>`). Each hit is tagged with the source
adapter, a recency-weighted score, the timestamp of the source record, a
content snippet, and the absolute path to the source file. Default sort is
score descending, then timestamp descending.

**Options**:
| Flag | Default | Effect |
|----|----|----|
| `--all` | on (M1 default) | Search every configured source. Sugar for `--sources <every>`. |
| `--source <id>` | (none) | Limit to one source. Repeatable in M2 once `--sources` ships. |
| `--limit <n>` | 50 | Max hits returned. |
| `--since <duration>` | (none) | `7d`, `30m`, `2026-01-01`. Strict: `<n>{s,m,h,d,w,M,y}` or ISO-8601. |
| `--json` | off | Emit `{ ok, hits[], stats }` per spec.md §4.3. |
| `--verbose` | off | Include `cause` for any errors that occurred mid-scan. |

**Examples**:
\`\`\`bash
# Headline scenario
omem recall --all "websocket reconnect"

# Limit to last week, JSON for agent consumption
omem recall --all "JWT refresh" --since 7d --json

# One source only
omem recall --source claude-code "Vault server WCF"
\`\`\`

**Exit codes**: 0 success · 2 bad args · 3 no sources detected · 4 I/O error · 5 partial success.

**Related**: `omem scan`, `omem doctor`, `omem config get`.
```

Apply the same template to `init`, `scan`, `doctor`, `config get/set`, `skills install`. M1.1 commands (`mcp serve`, `mcp install`) and M2 commands (`migrate`, `export`, `import`, `remember`, `upgrade`) MUST be marked clearly with their milestone.

---

## 10. NOT in scope (deferred)

| Item | Why deferred | Revisit at |
|----|----|----|
| `omem demo` subcommand with synthetic fixtures | M1's wedge is real recall on real data; manufactured demos dilute the pitch | M2 if onboarding telemetry says TTHW > target |
| Sandbox / playground (browser-hosted) | Cost too high for M1 wedge stage; no demand signal yet | M3+ when L2 engine exists |
| `--sources <list>` plural flag | M1 needs `--all` + `--source` only; plural arrives with `migrate` in M2 | M2 |
| Shell completions (`omem completion <shell>`) | M1's command surface is small; install-time noise | M1.1 |
| Per-error `helpUrl` populated | No docs site URLs to point at yet; field stays optional | M2 once docs are deployed |
| Telemetry (opt-in usage) | Privacy + zero-data infra cost in M1; first measure when there are users | M1.1 |
| Web UI for browsing memories | Indefinitely out of scope | M5+ on demand |

---

## 11. What already exists (reuse)

| Surface | Where | Reuse for |
|----|----|----|
| `printHelp()` in `packages/cli/src/index.ts` | dispatcher | Per-subcommand help generation; current global help is the seed |
| Adapter SDK error classes (`AdapterError` family) in `packages/adapter-sdk/src/index.ts` | already canonical | Wire into the new `OmemError` catalog (D3) so adapter errors map cleanly |
| Skill files at `skills/<ide>/SKILL.md` × 4 | already shipped | Reference them from the new `omem skills install --help` examples |
| `tests/smoke.test.ts` | bun test gate | Add `tests/contract/help.test.ts` and `tests/contract/error-catalog.test.ts` next to it |
| `bunfig.toml` 0.80 coverage threshold | already enforced | Errors and help paths must hit the threshold — test plans in F4.2 cover it |

---

## 12. M1 Lane E impact (concrete deltas)

These are the contract changes Lane E (`feat/m1-cli-wiring`) MUST land before merging — pulled out so the lane owner can checklist them:

- [ ] `packages/cli/src/output/error.ts`: define `OmemError` shape (D3) + catalog
- [ ] `packages/cli/src/output/error-catalog.ts`: `OMEM-E01..E2x` enum, lint rule "no string error literal outside this file"
- [ ] `packages/cli/src/commands/recall.ts`: default scope `--all` (D1)
- [ ] `packages/cli/src/commands/init.ts`: interactive default + `--non-interactive` flag + `OMEM_NON_INTERACTIVE=1` env var (D4)
- [ ] `packages/cli/src/commands/config.ts`: add `omem config list` (F2.5)
- [ ] `packages/cli/src/index.ts`: subcommand-specific `--help` (F3.3); honour `NO_COLOR` (F6.2); `OMEM_HOME` override (F6.3)
- [ ] `packages/cli/src/parse/duration.ts` (new): strict `<n>{s,m,h,d,w,M,y}` + ISO-8601 parser, error code `OMEM-E20-DURATION` on bad input (F2.3)
- [ ] `tests/contract/help.test.ts` (new): spawn each subcommand `--help` and diff against the canonical strings in `docs/CLI.md` (F4.2)
- [ ] `tests/contract/error-catalog.test.ts` (new): assert every `OMEM-E*` code in the catalog is documented in CLI.md
- [ ] `docs/CLI.md`: rewrite per-command sections per §9 template; remove the `(current)` row; document equals + space form for `--ide`; document `--since` formats; document the OmemError JSON shape
- [ ] `README.md`: replace fake `# → 12 hits...` with a real `--json` snippet captured from a Lane E fixture (F1.3)

---

## 13. TODO list (post-M1)

| Item | Milestone | Why |
|----|----|----|
| `--sources <list>` plural form (replaces / supplements `--source` + `--all`) | M2 | Needed by `migrate --from / --to`; natural moment to evolve the API |
| Shell completions (`omem completion bash\|zsh\|fish\|pwsh`) | M1.1 | Power-user expectation; trivial once M1 surface is frozen |
| `omem demo` (synthetic fixture corpus + canned recall) | M2 (only if telemetry justifies) | Onboarding accelerator; not core wedge |
| Per-error `helpUrl` populated | M2 | Requires docs site URL stability |
| Opt-in anonymous telemetry (`telemetry community\|anonymous\|off`) + `omem stats` | M1.1+ | Lets us measure TTHW reality vs §3 target |
| `omem init --reconfigure` (re-run interactive flow without overwrite) | M2 | Smooths multi-machine setup |
| `omem doctor` warns on omem > 30 days old | M1.1 | Pre-emptive defence against alpha staleness |
| `omem config list` with current/default/source provenance | M1 (F2.5) | Discoverability — locked into Lane E above |

---

## 14. Verdict & next step

**DX scorecard projected (post-Lane-E fixes)**: 7.5/10 average · TTHW < 2 min · Champion tier · all six DX principles covered. M1 will ship a CLI surface that does not extract a "remember the special flag" tax from the user's first command.

**The four locked decisions (D1–D4) are non-negotiable for M1**. The eight pass findings (F1.x through F8.x) are split between Lane E (P0/P1, owned now) and the post-M1 TODO list (§13).

**Cross-model tension**: none — outside voice was not invoked because the artifact is small (75 lines of CLI surface) and the wedge case is already locked by `specs/ceo-review-verdict.md` and `specs/eng-review-verdict.md`. If the user disputes any of D1–D4, run `codex review docs/CLI.md` against this verdict for a second opinion.

**Next per gstack flow**: this verdict closes the planning chain. Lane E is unblocked. Lane A can start in parallel as soon as the user opens the worktree. M1.1 (MCP server) and M2 (migration) inherit the contracts locked here — see references in `specs/spec.md` §8 and §9.

---

**End of DevEx Verdict.**
