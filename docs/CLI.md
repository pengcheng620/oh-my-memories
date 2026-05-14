# CLI.md — `omem` command reference

> **Status**: this doc is the source of truth for command behavior. Keep `--help` text and JSON schemas in sync with this file.

## Global flags

| Flag | Effect |
|----|----|
| `--help`, `-h` | Show usage |
| `--version`, `-v` | Print version |
| `--json` | Machine-readable output (where applicable) |
| `--quiet`, `-q` | Suppress informational output |
| `--verbose` | More logging |

## Exit codes

| Code | Meaning |
|----|----|
| `0` | Success |
| `1` | Generic error |
| `2` | Bad CLI arguments |
| `3` | No memory sources detected |
| `4` | I/O error (permission, missing file) |
| `5` | Partial success (some adapters failed) |

## Commands (M1)

### `omem init`
First-time setup. Detects available memory sources, writes `~/.omem/config.json`, optionally installs skills for detected IDEs.

### `omem scan [--json]`
Inventory of detected memory sources. Default output: human table. With `--json`: structured.

### `omem recall <query> [options]`
Federated search. Default: current source only. With `--all`: all configured sources.

| Flag | Default | Effect |
|----|----|----|
| `--all` | off | Search every configured source |
| `--source <id>` | (current) | Limit to one source |
| `--limit <n>` | 50 | Max hits |
| `--since <duration>` | (none) | e.g. `7d`, `30d`, `2026-01-01` |
| `--json` | off | JSON output |

### `omem doctor`
Diagnose: adapter detection, file permissions, version drift, denied files in last scan.

### `omem config get|set <key> [<value>]`
Read/write `~/.omem/config.json`.

### `omem skills install --ide=<ide>`
Install thin SKILL.md into `<ide>`'s skills directory. Supports `claude-code`, `cursor`, `codex`, `gemini`.

## Commands (M1.1+)

### `omem mcp serve`
Start MCP server on stdio.

### `omem mcp install --ide=<ide>`
Add omem to `<ide>`'s `mcp.json` / equivalent.

## Commands (M2+)

### `omem migrate --from <src> --to <tgt> [options]`
See [`docs/MIGRATION.md`](./MIGRATION.md).

### `omem export --all` / `omem import <archive>`
Backup / restore.

### `omem remember <text>`
Write to L2 our-own engine. Requires M3+ canonical store.

### `omem upgrade`
Self-update.
