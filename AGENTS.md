# oh-my-memories — Agent Context

> **You are reading this because you are an AI agent (Claude Code / Cursor / Codex / Gemini / Copilot CLI / etc.) opening this repo.**
> Read this file FIRST. It will tell you everything you need to be productive in 5 minutes.

---

## 1. What is this?

**oh-my-memories** (CLI binary: `omem`) is a hub that **manages, federates, and migrates** AI memories across all your tools — Claude Code, Cursor, Codex, Gemini CLI, Copilot, Serena MCP, mem0, and others.

**The problem we solve**: The same context recall that "just works" in Claude Code fails in Cursor — not because Cursor lacks memory, but because the AI agent in Cursor **doesn't know which folder to look in, or which tool to call**. Memories live in 7+ scattered locations (`~/.claude/projects/`, `~/.codex/sessions/`, `~/.cursor/projects/`, `~/.local/share/opencode/`, project-local `.serena/memories/`, third-party SaaS, ...), and no single agent can see across them.

**Our wedge**: Become the cross-tool memory layer first; build our own engine second.

---

## 2. Product Shape — 3 Layers × 2 Things

```
                          Thing 1                          Thing 2
                  Cross-tool migration & recall      Our own memory design
                  ────────────────────────────      ────────────────────────
AI IDEs           CC, Cursor, Codex, Gemini,                 (n/a)
(Cat A)           Copilot, OpenClaw, ...
                       ▲ adapter
                       │
3rd-party MCP     Serena, basic-memory, mem0,                (n/a)
(Cat B)           Letta, Zep, Cognee, ...
                       ▲ adapter
                       │
Our own           oh-my-memories (omem)                  L2: SQLite + FTS5
(L2/L3)           = federation + migration hub          (+ sqlite-vec, M3+)
                                                         serves Cursor / Codex /
                                                         Gemini that lack
                                                         native memory
```

**Layer 1 — Manage others' memories** (M1 priority)
  - `omem scan` — inventory all memory sources on the machine
  - `omem recall --all "<query>"` — federated search across them
  - `omem migrate --from cc --to cursor` — move memories between tools

**Layer 2 — Our own engine** (M3+)
  - For tools without native memory, expose `omem remember` / `omem recall`
  - SQLite + FTS5 (BM25) + sqlite-vec (semantic) + Reciprocal Rank Fusion

**Layer 3 — Third-party MCP/SaaS integration** (M2+)
  - Wrap mem0 / Letta / Zep / Cognee as Cat C adapters
  - Federation can include their results too

---

## 3. Packages (one-liner each)

| Package | Purpose |
|---------|---------|
| `packages/cli/`         | `omem` CLI binary — main entry for humans and agents |
| `packages/core/`        | Storage engine + retrieval + federation logic (no I/O bound to CLI) |
| `packages/mcp/`         | MCP server (`omem mcp serve`) — **M1.1**, not M1 |
| `packages/adapter-sdk/` | Public `IBaseAdapter` / `IIdeAdapter` / `IMcpAdapter` / `ISaasAdapter` interfaces |
| `packages/adapters/claude-code/` | Read `~/.claude/projects/*.jsonl` |
| `packages/adapters/cursor/`      | Read `~/.cursor/projects/*/agent-transcripts/*.jsonl` |
| `packages/adapters/codex/`       | Read `~/.codex/sessions/*.jsonl` |
| `packages/adapters/serena/`      | Read project-local `.serena/memories/*.md` |
| `packages/adapters/_shared/`     | Common JSONL parser, denylist, path utils |

**Skills** (`skills/<ide>/SKILL.md`) are thin wrappers that teach each IDE's agent **when** to call `omem` and **with what flags**. They are not the product — they are the on-ramp.

---

## 4. Read in order (for new AI sessions)

1. **`AGENTS.md`** (this file) — 5 min, you're here
2. **`docs/PRODUCT.md`** — 5 min, the 3×2 thesis + anti-mem0/Letta positioning
3. **`docs/ARCHITECTURE.md`** — 10 min, ASCII data flow + adapter interface
4. **`specs/spec.md`** — 15 min, M1 acceptance criteria + scope boundaries
5. **`.cursor/rules/*.mdc`** — 5 min, code style + testing requirements

After step 5 you have full context. Total: ~40 min.

---

## 5. Decision provenance (where we got here)

We did not vibe-code this. The architecture comes from three reviews and one research pass:

| Document | What it locked in |
|----------|------------------|
| `specs/ceo-review-verdict.md` | Pivoted from "Engine-First" to "Management-First". Defined 3 categories (Cat A IDE / Cat B MCP / Cat C SaaS). Prioritized CC→Cursor migration. |
| `specs/eng-review-verdict.md` | 6 architecture decisions: adapter interface inheritance, dry-run default for migration, BM25+time for M1 federation (RRF deferred), schema drift handling, M1 critical gaps (denylist, corrupt JSONL, MCP cleanup). |
| `specs/product-formation.md` | Project naming, repo creation, monorepo structure, language (TS+Bun), CLI command set, rule files tier design. |
| `research/G-skill-vs-mcp.md`  | **M1 ships CLI + Skill, NOT MCP.** MCP deferred to M1.1 once CLI I/O contract (JSON output, exit codes) is frozen — avoids double breaking-change cost. |

If you find yourself wanting to change one of those decisions, **read the verdict first**. They were not casual choices.

---

## 6. Current Status

- **Milestone**: **M1** — Inventory (scan) + Read-only Federation (recall) + 4 adapters (CC, Cursor, Codex, Serena) + Skill packs for 4 IDEs
- **MCP**: **M1.1** (lands ~1 week after M1; postponed per `research/G-skill-vs-mcp.md`)
- **Branch**: `main`
- **Remote**: `https://github.com/pengcheng620/oh-my-memories`
- **Roadmap**: see `docs/ROADMAP.md`

---

## 7. How to run

```bash
bun install                                  # install workspace deps
bun test                                     # run all tests
bun run build                                # build all packages
bunx biome check .                           # lint + format check
bunx biome check --write .                   # apply fixes

bun run packages/cli/bin/omem -- scan        # local dev: run CLI from source
bun run packages/cli/bin/omem -- recall --all "query"
```

---

## 8. Conventions (ultra-short — full list in `.cursor/rules/conventions.mdc`)

- **Files**: `kebab-case.ts`
- **Functions / vars**: `camelCase`
- **Types / classes**: `PascalCase`
- **Tests**: `*.test.ts` next to source OR in `tests/`
- **Imports**: top of file, no inline imports
- **Comments**: explain *why*, not *what*. No "// Increment counter" noise.
- **Strict mode**: `tsconfig.base.json` has `strict: true`. No `any` without an `// eslint-disable` + reason.
- **Cross-platform paths**: never hardcode `/` or `\`. Use `node:path` `join` / `resolve`.

---

## 9. What NOT to do

- ❌ Do not add a vector / embedding feature in M1. Deferred to M3+.
- ❌ Do not add MCP server work until M1 lands. (It is already designed; just not yet.)
- ❌ Do not add a TUI / GUI. Deferred indefinitely.
- ❌ Do not write to memory sources you read from in M1. M1 is **read-only**. Migration (M2) writes, but always behind `--apply` after `--dry-run`.
- ❌ Do not invent a new adapter interface. Use `packages/adapter-sdk/`.
- ❌ Do not bypass the safety denylist (`*.pem`, `.env*`, `auth.json`, `*credentials*`). Even if scanning your own machine.

---

## 10. Where to put what (quick map)

| You want to ... | Touch ... |
|-----------------|-----------|
| Add a new IDE / MCP source | `packages/adapters/<name>/` + register in `packages/cli/src/commands/scan.ts` |
| Change CLI command behavior | `packages/cli/src/commands/<cmd>.ts` |
| Change retrieval / merge logic | `packages/core/src/retrieval.ts` or `federation.ts` |
| Add docs that humans read | `docs/` |
| Add docs that future-AI reads | This file (`AGENTS.md`) or a new `.cursor/rules/*.mdc` |
| Capture a new design decision | `specs/<topic>-decision.md` (then link from this file) |
| Add or change CI / GitHub automation | `.github/workflows/*.yml` (see `test.yml` for the cross-OS matrix that gates `docs/PLAN.md` §4.5) |

---

**You now have full context. Go.**
