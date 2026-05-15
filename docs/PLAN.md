# PLAN.md — M1 implementation plan

> **Audience**: lane owners executing M1.
> **Status**: locked 2026-05-15 after CEO + Eng + DevEx + second-opinion review chain.
> **Source of truth for decisions**: do not duplicate. Always read the verdict first.

| If you're asking… | Read | Authority |
|----|----|----|
| Why this exists / what we're shipping | [`docs/PRODUCT.md`](./PRODUCT.md), [`docs/ROADMAP.md`](./ROADMAP.md) | scope |
| What the M1 contract is (acceptance, file layout, JSON schemas, milestones) | [`specs/spec.md`](../specs/spec.md) | technical |
| Why scope is what it is (3 categories, M1 vs M1.1 vs M2) | [`specs/ceo-review-verdict.md`](../specs/ceo-review-verdict.md) | strategic |
| Why architecture is what it is (interfaces, dry-run, BM25-only, parallelization) | [`specs/eng-review-verdict.md`](../specs/eng-review-verdict.md) | architectural |
| Why CLI defaults are what they are (D1–D4, error contract, init UX, Lane E split) | [`specs/devex-review-verdict.md`](../specs/devex-review-verdict.md) | UX |
| What the CLI surface looks like (every flag, every exit code) | [`docs/CLI.md`](./CLI.md) | reference |
| What SDK contract adapters consume | [`docs/ADAPTER-SDK.md`](./ADAPTER-SDK.md) | reference |

This plan tells you **how to land M1 in parallel without merge conflicts**. It does not justify decisions — those live in the verdict files above.

---

## 1. Lane map (six lanes)

```text
Lane A (claude-code adapter, blocker)
   │
   └──merge──▶  ┌─ Lane B (cursor adapter)
                ├─ Lane C (codex adapter)
                ├─ Lane D (serena adapter)
                └─ Lane E1 (CLI shell + Tier 2 error contract)
                                │
                                └──merge──▶  Lane E2 (federation + commands + skills install)
```

**Why six lanes (was five):** Lane E was split into E1 + E2 per `specs/devex-review-verdict.md` §15 — the original Lane E was sized at "one focused work-week" but stacked with `spec.md` ownership it was multi-week. E1 is the CLI shell + error contract (works against fixtures, no real adapter calls), E2 wires E1 into the real adapters.

| Lane | Branch | Owner | Depends on | Sized for | Output |
|----|----|----|----|----|----|
| **A** | `feat/m1-claude-code-adapter` | TBD | — (P0 blocker) | ~1 work-week | First Cat A adapter, full impl + 4 tests + fixtures |
| **B** | `feat/m1-cursor-adapter` | TBD | A merged | ~1 work-week | Second Cat A adapter |
| **C** | `feat/m1-codex-adapter` | TBD | A merged | ~1 work-week | Third Cat A adapter |
| **D** | `feat/m1-serena-adapter` | TBD | A merged | ~3–4 days | Cat B adapter (smaller — MCP-server format) |
| **E1** | `feat/m1-cli-shell` | TBD | A merged | ~1 work-week | Runnable `omem --help` + Tier 2 error contract on fixtures |
| **E2** | `feat/m1-cli-wiring` | TBD | E1 + ≥1 of A–D merged | ~1 work-week | First end-to-end real recall |

Lane A is the only blocker — it owns the patterns every other adapter copies. After A merges, B/C/D/E1 run in parallel. E2 cannot start until E1 lands plus at least one adapter (it needs a real source to wire against).

---

## 2. Per-lane Definition of Done

Each lane's DoD is the gate the lane owner uses to decide "ship this PR". Reviewers check the DoD before approving.

### Lane A — `packages/adapters/claude-code`

**Branch**: `feat/m1-claude-code-adapter`
**Files owned** (no other lane edits these):

```text
packages/adapters/claude-code/
├── package.json              (dependencies: @oh-my-memories/adapter-sdk, _shared)
├── src/
│   ├── index.ts              (exports the adapter class)
│   ├── adapter.ts            (the IBaseAdapter implementation)
│   ├── parser.ts             (transcript → MemoryRecord)
│   └── paths.ts              (~/.claude/projects/*.jsonl resolution per OS)
├── test/
│   ├── adapter.test.ts       (smoke + live discover)
│   ├── parser.test.ts        (transcript shape parsing)
│   ├── corrupt.test.ts       (proves §7.2 corrupt-line tolerance)
│   └── fixtures/             (3+ real-shaped JSONL transcripts)
└── README.md                 (adapter spec card per ADAPTER-SDK.md)
```

**DoD checklist:**

- [ ] Implements `IBaseAdapter` from `@oh-my-memories/adapter-sdk` end-to-end (`init`, `scan`, `iterate`)
- [ ] Iterates transcripts via `packages/adapters/_shared/src/jsonl.ts` (NOT a local re-implementation — that file ships in Lane E1, so initially block on that, OR temporarily implement locally and rip out in a follow-up PR)
- [ ] `corrupt.test.ts` proves a malformed line in a fixture does NOT crash; `corruptLineCount` increments
- [ ] Honours `denylist` from `packages/cli/safety/denylist.ts` (skips `*.pem`, `.env*`, etc. — see spec §7.1). If `safety/` not yet shipped (Lane E1 owns), stub a const list locally and migrate when E1 merges
- [ ] Coverage ≥ 80% on adapter logic (per `bunfig.toml`)
- [ ] All 4 tests green on Windows + macOS (CI matrix)
- [ ] `README.md` contains schema-version note (`claude-code/2026-05`) and points at the spec's §3 Cat A bullet
- [ ] PR description references `specs/spec.md` §3.1 + §7.2 and links the eng-verdict failure-modes table

**Estimate**: ~1 work-week solo with TDD. Half goes to fixture engineering (real-shaped transcript captures from a working CC install).

### Lanes B, C, D — adapters

Same shape as Lane A, in their own subdirectories. Differences:

| Lane | Subdir | Notes |
|----|----|----|
| B (cursor) | `packages/adapters/cursor` | Cat A. `~/.cursor/sessions/*.json` schema. Has WebView2 quirks on Windows — paths use forward slashes even on Win32. Test on Windows specifically. |
| C (codex) | `packages/adapters/codex` | Cat A. `~/.codex/sessions/<thread-id>/*.jsonl`. Schema can change with codex CLI version — tolerate via try-parse. |
| D (serena) | `packages/adapters/serena` | Cat B (third-party MCP server). `.serena/memories/*.md` plus markdown frontmatter. Smaller — no JSONL streaming, just file-walk + frontmatter parse. ~3–4 days realistic. |

All three follow Lane A's DoD checklist verbatim except where the file format diverges (Serena does Markdown, not JSONL — so no `corrupt.test.ts` for the JSONL path; instead, `malformed-frontmatter.test.ts`).

**Cross-lane rule (locked)**: B/C/D must not edit `packages/adapter-sdk` or `packages/adapters/_shared`. If a fix is needed there, file an issue and let E1's owner cut a separate PR. This avoids 4-way merge conflicts on the SDK surface.

### Lane E1 — CLI shell + Tier 2 error contract

**Branch**: `feat/m1-cli-shell`
**Files owned:**

```text
packages/cli/src/
├── index.ts                  (dispatcher; rewire to subcommand-specific --help per F3.3)
├── commands/                 (stub each command, returns Tier 2 error if not yet wired)
│   ├── init.ts               (interactive default + --non-interactive flag — D4)
│   ├── scan.ts               (stub returns fixture)
│   ├── recall.ts             (stub returns fixture; default --all per D1; --source wins per D2 precedence)
│   ├── doctor.ts             (stub)
│   └── config.ts             (get/set/list — config list per F2.5)
├── output/
│   ├── error.ts              (the OmemError shape from D3)
│   ├── error-catalog.ts      (OMEM-E01..E2x enum + lint rule "no string literal outside this file")
│   ├── table.ts              (human format; honour NO_COLOR per F6.2)
│   └── json.ts               (--json output; emits OmemError verbatim)
├── parse/
│   └── duration.ts           (strict <n>{s,m,h,d,w,M,y} + ISO-8601 — F2.3)
├── platform/
│   ├── home.ts               (OMEM_HOME env var override per F6.3)
│   ├── paths.ts              (cross-OS config path)
│   └── interactive.ts        (TTY detection + OMEM_NON_INTERACTIVE env)
└── safety/
    └── denylist.ts           (the §7.1 deny-list constants)

packages/adapters/_shared/src/
└── jsonl.ts                  (the streaming parser from spec §7.2)

tests/contract/               (NEW — these gate the contract)
├── help.test.ts              (spawn each subcommand --help, diff against docs/CLI.md sections — F4.2)
├── error-catalog.test.ts     (every OMEM-E* code in catalog is documented in CLI.md)
└── duration.test.ts          (every accepted format parses, every rejected format errors as OMEM-E20-DURATION)

docs/CLI.md                   (rewrite per command per devex-verdict §9 template)
README.md                     (replace fake "# → 12 hits..." with real --json snippet from a fixture)
```

**DoD checklist:**

- [ ] `omem --help` works and lists all M1 subcommands; M1.1 + M2 commands marked clearly
- [ ] `omem <bad-subcmd>` exits 2 and prints subcommand-specific help (F3.3)
- [ ] All four error scenarios (`OMEM-E04-PERM`, `OMEM-E11-IO`, `OMEM-E20-DURATION`, partial-success exit-5) emit Tier 2 shape on text and `--json` paths (D3)
- [ ] Lint rule blocks new string error literals outside `error-catalog.ts` (verified via `bunx biome check`)
- [ ] All three contract tests green
- [ ] `OMEM_HOME=/tmp/foo omem init` writes to `/tmp/foo/`, not `~/.omem` (F6.3)
- [ ] `NO_COLOR=1 omem scan` produces ANSI-free output (F6.2)
- [ ] `OMEM_NON_INTERACTIVE=1 omem init` writes a default config without prompting and exits 0; if a mandatory prompt would have fired, exits non-zero (D4)
- [ ] `omem recall <q>` defaults to all configured sources (D1) — verified via fixture data; `--source claude-code` overrides; combined `--all --source claude-code` emits `OMEM-W01-FLAG` to stderr and uses `--source` (D2 precedence rule)
- [ ] `omem config list` lists every key with current/default/source-of-value (F2.5)
- [ ] `docs/CLI.md` rewritten per command using the §9 template; passes the help-drift contract test
- [ ] `README.md` contains a real `--json` snippet (not the placeholder)
- [ ] Coverage ≥ 80% on `output/`, `parse/`, `platform/`
- [ ] CI green on Windows + macOS + Linux

**Estimate**: ~1 work-week solo with TDD. The `error-catalog.ts` lint rule and three contract tests are the highest-yield investment in long-term DX maintenance — do them first, treat them as contract, not test infrastructure.

### Lane E2 — federation + commands + skills install

**Branch**: `feat/m1-cli-wiring`
**Depends on**: Lane E1 merged + at least one of Lanes A–D merged.

**Files owned:**

```text
packages/core/src/
├── inventory/
│   ├── index.ts              (registers all installed adapters)
│   ├── discover.ts           (loads adapter packages from monorepo or npm)
│   └── types.ts
└── federation/
    ├── index.ts              (the recall(query, options) entry point)
    ├── recency.ts            (recency-weighted scoring per spec §4.3)
    ├── stable-sort.ts        (deterministic order on ties — eng-verdict §Failure Modes)
    └── parallel.ts           (Promise.allSettled across adapters; partial-success path)

packages/cli/src/commands/
├── init.ts                   (real impl: detect installed sources via inventory, write config)
├── scan.ts                   (real impl: call inventory + render table or JSON)
├── recall.ts                 (real impl: call federation with --source / --all / --since / --limit)
├── doctor.ts                 (real impl: env check, config check, denylist check, version freshness)
├── config.ts                 (real get/set/list backed by ~/.omem/config.json)
└── skills.ts                 (skills install --ide=<ide> — copies skills/<ide>/SKILL.md into target)

tests/e2e/                    (NEW — real adapter invocations, no mocks)
├── init.e2e.test.ts          (interactive + --non-interactive paths)
├── scan.e2e.test.ts          (with at least one real adapter via Lane A's fixtures)
├── recall.e2e.test.ts        (the headline scenario — see spec §4.1)
├── recall-precedence.e2e.test.ts  (--source wins over --all + warning)
└── doctor.e2e.test.ts
```

**DoD checklist:**

- [ ] `omem init` interactively detects installed sources, asks which to enable, optionally installs IDE skills, writes `~/.omem/config.json` (under `OMEM_HOME` if set)
- [ ] `omem scan` lists every detected adapter's status, item count, last-modified, denied-files, healthy bool, schemaVersion (matches spec §4.2 JSON shape)
- [ ] `omem recall "<q>"` (no flags) returns hits federated across all configured sources; sorted by recency-weighted score with stable-sort tie-break
- [ ] `omem recall "<q>" --source claude-code` returns only CC hits
- [ ] `omem recall "<q>" --all --source claude-code` returns only CC hits AND emits `OMEM-W01-FLAG` to stderr
- [ ] `omem recall "<q>" --json` matches spec §4.3 output shape exactly (scrutinise against `tests/e2e/recall.e2e.test.ts`)
- [ ] Partial success: if 1 adapter fails and 3 succeed, exit 5, `--json` emits `{ ok: false, partial: true, failures: [...], hits: [...] }`, text path lists failures on stderr and hits on stdout
- [ ] `omem skills install --ide=cursor` copies `skills/cursor/SKILL.md` into the project's `.cursor/skills/` (or equivalent target per IDE)
- [ ] Headline scenario from `specs/spec.md` §4.1 passes end-to-end on Windows + macOS in CI
- [ ] Coverage ≥ 80% on `core/inventory/` and `core/federation/`

**Estimate**: ~1 work-week solo. Federation logic is the high-risk piece — get the parallel + partial-success path right first, write the e2e tests against the headline scenario, then iterate.

---

## 3. Cross-cutting rules

These apply to every lane. Violating them produces merge conflicts.

1. **One lane = one disjoint set of files.** Cross-lane edits require a separate "shared rewire" PR cut by a designated owner (default: Lane E1's owner). If you find yourself wanting to edit `packages/adapter-sdk` from inside Lane B, stop and file an issue.
2. **Tests live with code.** Adapter tests in `packages/adapters/<name>/test/`. CLI contract tests in `tests/contract/`. E2E in `tests/e2e/`. No tests in `tests/<root>` outside those three.
3. **Fixtures are real-shaped, not synthetic.** Capture from a working install, scrub PII (replace usernames with `lup`, redact API keys with `xxx`), commit. Synthetic fixtures hide schema drift bugs that this product is built to expose.
4. **Every failure path is a numbered error code.** No `throw new Error("foo")` outside `error-catalog.ts` (Lane E1's lint rule enforces this; A–D should adopt the convention from day one).
5. **Default to `--dry-run` for any future write paths.** M1 is read-only, but Lane E2 sets the precedent — if M2's `migrate` command later defaults to apply, that's a regression on this rule.
6. **Branch hygiene**: rebase on `main` daily. Resolve conflicts forward; never merge `main` into the feature branch (creates noisy graph).
7. **No new top-level files.** Everything lives in `packages/`, `tests/`, `docs/`, `specs/`, `skills/`, or the existing root files (`README.md`, `AGENTS.md`, `TODO.md`, etc.). New top-level files require updating `AGENTS.md`'s orientation table.

---

## 4. Merge order

Strict order until A merges; flexible afterward.

1. **A** lands first. Mandatory. Every other lane needs the patterns A established (the IBaseAdapter shape in code, the corrupt-line test pattern, the fixture style).
2. **E1** should land next or in parallel with B/C/D. E1 ships the lint rule + error catalog that B/C/D will adopt; the longer E1 lags, the more retrofit work the adapter lanes do later.
3. **B, C, D** land in any order after A. Each PR is small (~ 1 lane worth of files), conflicts are minimal (each touches its own subdir).
4. **E2** lands last in M1. It needs E1's CLI shell + error contract AND at least one adapter to wire against. Ideally E2 lands after at least 2 adapters (A + B or A + C) so the headline scenario works end-to-end across two real sources, not one.

After E2 merges, M1 is shipped: tag `v0.1.0-alpha.1`, push to origin, run `npm publish --tag alpha`, smoke-test on a fresh Windows + macOS VM.

---

## 5. Risk register (carry forward to M1.1 retro)

| Risk | Mitigation | Owner |
|----|----|----|
| Lane A scope creep (the canonical pattern attracts every "let me also add X" idea) | A owner is empowered to defer non-DoD items to issues; reviewer rejects scope creep | A reviewer |
| Schema drift in CC / Cursor / Codex during M1 | All adapters tolerate per `corrupt.test.ts`; if a real schema change ships mid-M1, the lane owner pins the schema-version note in their adapter README and files an issue | Per-adapter owner |
| E1 + E2 timeline slip cascades (E2 gates M1 completion) | E1 ships the contract first; E2's commands degrade gracefully when an adapter is unavailable (already in DoD) | E1, E2 owners |
| Cross-OS path bugs (Windows backslash, case-insensitive macOS) | E1 owns `platform/paths.ts` and the test matrix; A–D test on Windows specifically before merge | All |
| Denylist false negatives (missed sensitive file class) | M1 ships a fixed list; M2 adds opt-out per the spec §7.1 — explicit "not configurable in M1" decision | E1 owner |
| Codex CLI gateway outage blocks future independent reviews | This plan was reviewed via Cursor `code-reviewer` subagent fallback (see `specs/devex-review-verdict.md` §15); same fallback applies for future review milestones | Project lead |

---

## 6. After M1 lands

Order locked by `specs/spec.md` §8 and `specs/ceo-review-verdict.md` §M1.1+:

1. **M1.1**: MCP server (`packages/mcp/`) — `omem mcp serve`, `omem mcp install --ide=<ide>`. Reuses E2's `core/federation` library directly. ~1 week post-M1.
2. **M2.A**: Migration. `IWritableAdapter` extension, write-side of CC + Cursor + Codex adapters, `omem migrate --from --to --dry-run --apply`, conflict strategies, manifest + rollback. ~3 weeks post-M1.1.
3. **M2.B**: Backup. `omem export --all` / `omem import <archive>`. Ships in same milestone as M2.A.
4. **M2.C**: Self-update. `omem upgrade`. Tiny lane.
5. **M3+**: Canonical store, M4, M5+ per the roadmap. Out of plan scope.

---

**End of PLAN.md.** When in doubt, read the verdicts. When in doubt about the verdicts, ask before deciding — no silent overrides.
