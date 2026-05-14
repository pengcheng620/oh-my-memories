# CLAUDE.md — Claude Code & Cursor Project Rules

> **Read `AGENTS.md` first** — it has the product overview and the 5-step "read in order" path. This file only adds Claude Code / Cursor-specific rules on top of that.

---

## Tooling assumptions (this repo)

- **Runtime**: Bun (Node-compatible). Use `bun` not `npm` for scripts.
- **Lint/format**: Biome (replaces ESLint + Prettier). Single config: `biome.json`.
- **Test**: `bun test` (built-in).
- **TS strict**: `tsconfig.base.json` has `strict: true`. Don't loosen.

---

## Workflow rules

### Before editing
1. **Use Read on the file first** (you must, not "should").
2. If the change touches >1 package, check `.cursor/rules/monorepo.mdc` for which package owns the concern.
3. If the change touches an adapter, read `.cursor/rules/adapter-design.mdc` and `packages/adapter-sdk/src/` to understand the interface contract.

### While editing
- **DRY/KISS/YAGNI**: do not invent layers. If a function has 1 effective line, inline it.
- **No comments narrating what code does.** Only comments that explain *why*.
- **No `any`** without an `// biome-ignore` + reason on the same line.
- **No inline imports.** Imports go at the top.
- **Cross-platform paths.** Use `node:path`. Never hardcode `\` or `/`.

### After editing
- Run `bunx biome check --write <file>` on touched files.
- Run `bun test <package>` for the package you touched.
- Run `ReadLints` on touched files; fix anything you introduced.

### Before claiming "done"
- All tests in the touched package pass.
- `bunx biome check .` is clean.
- New behavior has at least one test (unit OR integration; not "I tested it manually").

---

## Communication rules

- **Never** call `git commit` unless I explicitly say "commit". You can stage; I review.
- **Never** call `git push` unless I explicitly say "push".
- **Never** modify `git config`.
- For non-trivial multi-step changes, use `TodoWrite` to track. Mark items in_progress / completed in real time.
- For decisions with >1 reasonable answer (architecture, dependency choice, naming), **ask via `AskQuestion`** before coding. Do not pick silently.
- For irreversible / destructive operations (`rm -rf`, schema migration, force push, deleting a memory source), **stop and confirm**.

---

## What "done" means for M1

A change is M1-ready when:
1. The relevant adapter / command has unit tests (≥80% line coverage in changed file).
2. There is one E2E test in `tests/e2e/` that exercises the new code path through the CLI.
3. `bun run packages/cli/bin/omem -- <command>` works end-to-end on Windows AND macOS (CI verifies).
4. Output schema is documented in the command's `--help` AND in `docs/CLI.md`.
5. If the command produces JSON, the schema is in `packages/cli/src/output/schemas/`.

---

## Cursor-specific notes

- **MCP dogfooding**: once M1.1 ships MCP, `.cursor/mcp.json` will configure `omem mcp serve` for this repo. Then editing this codebase will let Cursor's agent recall past discussions about it. (Currently empty — placeholder.)
- **Skills**: this repo has its own `.claude/skills/` for project-internal automation. The `skills/cursor/` directory at repo root is what we **publish** for end users.
- **Don't** run `omem init` against your real machine while developing — it will scan your private memory sources. Use the fixtures in `tests/fixtures/` for local dev.

---

## Skills the agent has (and should use proactively)

When relevant, the agent should call:
- **`brainstorming`** — before any creative / new-feature work
- **`systematic-debugging`** — before proposing any bug fix
- **`test-driven-development`** — before writing implementation code
- **`verification-before-completion`** — before claiming work is done
- **`writing-plans`** — when given a multi-step task with no plan
- **`adsk-github` / `adsk-jira`** — for GitHub Enterprise (NOT for this repo; this repo is on github.com)

**For this repo specifically**, the agent should also lean on:
- `framework-docs-researcher` — when wiring a new dependency (Bun / Biome / @modelcontextprotocol/sdk / better-sqlite3)
- `code-simplifier` — after large changes, to delete cleverness
- `pattern-recognition-specialist` — when adding a 5th+ adapter, to enforce parity with the first 4

---

## Anti-patterns (specific to this repo)

| Anti-pattern | Instead |
|--------------|---------|
| Adapter writes a 200-line custom JSONL parser | Use `packages/adapters/_shared/jsonl.ts` |
| Command directly calls `fs.readFileSync` | Go through `packages/core/` so retrieval logic is testable |
| MCP work happening in an M1 PR | Open a separate `m1.1-mcp` branch; reviewer will reject mixing |
| New adapter without a test fixture | Add a 3-line fixture to `tests/fixtures/<adapter-name>/` first |
| `console.log` for output | Use `packages/cli/src/output/` formatters (table / json / pretty) |
| Hardcoded path `~/.claude` | Use `packages/cli/src/platform/<adapter>.ts` resolver (handles `%USERPROFILE%` on Windows) |
| Adding a new top-level CLI command | First check if it belongs as a subcommand. CLI surface area is finite. |
