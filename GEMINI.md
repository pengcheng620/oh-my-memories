# GEMINI.md — Gemini CLI Project Rules

> **Read `AGENTS.md` first.** This file adds Gemini CLI–specific rules on top.

Gemini CLI's mental model differs from Claude Code / Cursor in two ways:
1. It treats **MCP servers** and **Extensions** as the primary extension surface (not "skills" as a first-class concept).
2. It has its own settings location (`~/.gemini/settings.json`) and command structure.

This means:

- **For end users**, our published `skills/gemini/SKILL.md` is treated as **prompt + workflow doc** that the user pastes into a slash-command or system prompt context. We do not assume Gemini auto-loads it the way Cursor does.
- **For the omem CLI itself**, Gemini users invoke it identically: `omem scan`, `omem recall --all "query"`. The CLI is the actual interface; the skill text just teaches Gemini's model when to call it.
- **For the M1.1 MCP server**, `omem mcp install --ide=gemini` will write to `~/.gemini/settings.json` under `mcpServers.omem`.

---

## Workflow rules (Gemini CLI as the agent)

The same rules in `CLAUDE.md` (workflow / DRY / KISS / TDD / verification) apply. Re-read those.

Two Gemini-specific notes:

- Gemini's `bash` tool exists; use it for `bun test`, `bunx biome check`, etc. — same as Claude Code.
- Gemini's `read_file` returns line numbers like `LINE_NUMBER|content`. Strip the prefix when copying code.

---

## Skills the agent has (Gemini-specific)

If you're a Gemini agent reading this, you have **fewer auto-loaded skills** than Claude Code. The most relevant disciplines to apply manually:

- **TDD**: write a failing test first, then implement.
- **Systematic debugging**: investigate → analyze → hypothesize → fix. No "let me try this" without a hypothesis.
- **Verification before completion**: never claim "fixed" without running the test.

---

## What's the same as `CLAUDE.md`

Everything else. The repo doesn't change behavior based on which agent is editing it. Conventions, anti-patterns, M1 definition of done, communication rules — all identical.
