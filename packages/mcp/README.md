# @oh-my-memories/mcp

MCP server for oh-my-memories. **M1.1** — placeholder; not implemented in M1.

## Why deferred from M1

See [`research/G-skill-vs-mcp.md`](../../research/G-skill-vs-mcp.md). TL;DR: ship CLI + Skill first to nail the IDE-agent integration story without paying double breaking-change cost while the CLI's JSON output / exit codes / config paths are still in flux. Wrap as MCP tools once that contract freezes.

## Planned tools (M1.1)

- `recall_across_sources(query, sources?, limit?)` — federated recall
- `scan_sources()` — inventory
- `migrate(from, to, strategy?, dryRun?)` — M2

Wired via `omem mcp serve` (stdio) and installed via `omem mcp install --ide=<ide>`.
