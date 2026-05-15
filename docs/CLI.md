# CLI.md - `omem` command reference

> **Status**: this doc is the source of truth for command behaviour, exit codes, and error catalog.
> A help-drift contract test (`packages/cli/tests/contract/help.test.ts`) and an error-catalog contract test
> (`packages/cli/tests/contract/error-catalog.test.ts`) gate every change here against the implementation.
> Keep this file in sync; the contract tests will reject drift on the next CI run.

## Conventions

- Every command supports `--json` (global flag). In `--json` mode, **stdout** is one JSON document per
  command and **stderr** is newline-delimited JSON (NDJSON) for warnings and errors.
- Flags accept either `--flag=value` OR `--flag value` (per devex-verdict F2.2).
- Durations accept `<n>{s,m,h,d,w,M,y}` (e.g. `7d`, `30m`) or full ISO-8601 (`2026-01-01`).
  Anything else fails with `OMEM-E20-DURATION`.
- Unknown commands fall through to the global help with `OMEM-E02-UNKNOWN-COMMAND` and exit code 2.
- Bad arguments to a known command fall through to **that command's** `--help` with `OMEM-E01-USAGE`
  and exit code 2 (devex-verdict F3.3).

## Global flags

| Flag | Effect |
|---|---|
| `--help`, `-h` | Show this command's help (global if no command supplied) |
| `--version`, `-v` | Print the omem version |
| `--json` | Emit JSON to stdout, NDJSON warnings/errors on stderr |
| `--verbose` | Log each adapter scan; include `cause` field in errors |
| `--non-interactive` | Fail rather than prompt; same as `OMEM_NON_INTERACTIVE=1` |
| `--no-color` | Disable ANSI colour; same as `NO_COLOR=1` |

## Environment

| Variable | Effect |
|---|---|
| `OMEM_HOME` | Override `~/.omem` for everything (config, index, logs) |
| `OMEM_NON_INTERACTIVE` | Truthy values (`1`, `true`, `yes`, `y`, `on`) disable prompts |
| `NO_COLOR` | Any non-empty value disables ANSI colour (per <https://no-color.org>) |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Generic error (failed adapter, IO problem) |
| `2` | Bad CLI arguments |
| `3` | No memory sources detected (reserved for `init` / `scan` no-source paths) |
| `4` | I/O error not surfaced as a more specific code |
| `5` | Partial success (some adapters failed but the overall command produced useful output) |

## Error catalog

Every code is **append-only** — never reorder or reuse a number.

| Code | Kind | Meaning |
|---|---|---|
| `OMEM-E01-USAGE` | error | Bad CLI arguments — usage error. |
| `OMEM-E02-UNKNOWN-COMMAND` | error | The subcommand name is not recognised. |
| `OMEM-E03-NO-SOURCES` | error | No memory sources detected on disk. |
| `OMEM-E04-PERM` | error | Permission denied while reading or writing a path. |
| `OMEM-E11-IO` | error | A filesystem operation failed (missing file, busy, etc.). |
| `OMEM-E12-CONFIG-INVALID` | error | `~/.omem/config.json` is missing or not valid JSON. |
| `OMEM-E20-DURATION` | error | A duration argument did not match the accepted formats. |
| `OMEM-E21-NON-INTERACTIVE` | error | A mandatory interactive prompt fired while non-interactive mode was active. |
| `OMEM-W01-FLAG` | warning | A flag was overridden by a more specific flag on the same command. |

## Commands (M1)

### `omem init`

**SYNOPSIS** &nbsp; `omem init [--non-interactive] [--json]`

**DESCRIPTION**
First-time setup. Detects every supported memory source (Claude Code, Cursor, Codex, Serena),
writes `~/.omem/config.json`, and prompts whether to install thin skills for any IDEs it found.
The non-interactive path skips prompts and never installs skills.

**OPTIONS**

| Flag | Effect |
|---|---|
| `--non-interactive` | Skip prompts; fail with `OMEM-E21` if any are mandatory. |
| `--json` | Emit a structured `{ ok, command, detected }` document instead of human prose. |

**EXAMPLES**
```bash
omem init                       # interactive (default on a TTY)
omem init --non-interactive     # CI-safe; equivalent to OMEM_NON_INTERACTIVE=1
```

**EXIT CODES**: `0` success · `1` adapter detection failure · `2` bad args.

---

### `omem scan`

**SYNOPSIS** &nbsp; `omem scan [--json] [--source=<name>] [--since=<duration>]`

**DESCRIPTION**
Lists every detected memory source with `present?`, `itemCount`, `lastModified`, and
`denylistedFileCount`. The `--json` form matches the schema below and is the contract surface
for agents.

**OPTIONS**

| Flag | Effect |
|---|---|
| `--json` | Emit the JSON schema below. |
| `--source=<name>` | Restrict to one adapter: `claude-code`, `cursor`, `codex`, `serena`. |
| `--since=<duration>` | Only count records newer than this; e.g. `7d`, `2026-01-01`. |

**JSON schema (success)**
```json
{
  "sources": [
    {
      "name": "claude-code",
      "present": true,
      "storageRoot": "/home/u/.claude",
      "itemCount": 1234,
      "lastModified": "2026-05-10T18:24:00Z",
      "denylistedFileCount": 0,
      "schemaVersion": "claude-code/2026-04"
    }
  ]
}
```

**EXAMPLES**
```bash
omem scan
omem scan --json
omem scan --source=cursor --since=7d
```

**EXIT CODES**: `0` all sources scanned · `3` no sources detected · `5` partial scan.

---

### `omem recall`

**SYNOPSIS** &nbsp; `omem recall <query> [--all] [--source=<name>] [--limit=<n>] [--since=<duration>] [--json]`

**DESCRIPTION**
Federated search. Searches **all** detected sources by default (devex-verdict D1).
Matching is BM25 in M1; embeddings arrive in M3+.

**OPTIONS**

| Flag | Default | Effect |
|---|---|---|
| `--all` | on | Explicit form of the default; useful in scripts for clarity. |
| `--source=<name>` | (none) | Search ONLY this adapter; **overrides** `--all` and emits `OMEM-W01-FLAG`. |
| `--limit=<n>` | 50 | Cap the result count. |
| `--since=<duration>` | (none) | Filter by recency; same syntax as `omem scan`. |
| `--json` | off | Emit JSON results. |

**JSON schema (success)**
```json
{
  "query": "ai memory",
  "hits": [
    {
      "source": "cursor",
      "id": "cursor:8a3b...",
      "score": 0.81,
      "timestamp": "2026-05-09T11:02:00Z",
      "snippet": "...the omem CLI ships a federated...",
      "path": "/home/u/.cursor/sessions/8a3b.../msg-12.jsonl"
    }
  ]
}
```

**EXAMPLES**
```bash
omem recall "ai memory"                                # default: all sources
omem recall "react hooks" --source=cursor --limit=20
omem recall "deploy" --since=7d --json
```

**EXIT CODES**: `0` results returned (zero hits is success) · `2` bad args · `5` partial scan.

---

### `omem doctor`

**SYNOPSIS** &nbsp; `omem doctor [--json]`

**DESCRIPTION**
Reports adapter health: present?, readable?, schema version, denylisted-file count from the
last scan. Also surfaces the omem version and the runtime version. Exits `0` if every
adapter is healthy; `5` if any adapter is partial (e.g. some files unreadable).

**EXAMPLES**
```bash
omem doctor
omem doctor --json
```

**EXIT CODES**: `0` all healthy · `5` partial · `4` IO error before any adapter could be probed.

---

### `omem config`

**SYNOPSIS**
```text
omem config get <key>
omem config set <key> <value>
omem config list [--json]
```

**DESCRIPTION**
Round-trips `~/.omem/config.json`. `set` rejects writes that would produce invalid JSON
(`OMEM-E12-CONFIG-INVALID`). `list` prints every key with its current value, default, and
the source (`config.json` / `default`).

**EXAMPLES**
```bash
omem config get default.limit
omem config set default.limit 100
omem config list --json
```

**EXIT CODES**: `0` success · `1` write failed · `2` bad args.

---

### `omem skills install`

**SYNOPSIS** &nbsp; `omem skills install --ide=<ide>`

**DESCRIPTION**
Drops a thin `SKILL.md` into `<ide>`'s skills directory. The thin skill defers to `omem`
for actual logic so updates flow through `omem upgrade` (M2+) without re-installing skills.

**OPTIONS**

| Flag | Effect |
|---|---|
| `--ide=<ide>` | Required. One of: `claude-code`, `cursor`, `codex`. Both `--ide=NAME` and `--ide NAME` accepted. |

**EXAMPLES**
```bash
omem skills install --ide=cursor
omem skills install --ide claude-code
```

**EXIT CODES**: `0` installed · `2` bad args · `4` could not write the skill file.

## Commands (M1.1+)

### `omem mcp serve` / `omem mcp install --ide=<ide>`
M1.1 — start an MCP server on stdio, or wire `omem` into an IDE's `mcp.json`.

## Commands (M2+)

### `omem migrate --from <src> --to <tgt>`
M2+ — see [`docs/MIGRATION.md`](./MIGRATION.md).

### `omem export --all` / `omem import <archive>`
M2+ — backup / restore.

### `omem remember <text>`
M3+ — write into omem's own canonical store. Requires the L2 engine.

### `omem upgrade`
M2+ — self-update.
