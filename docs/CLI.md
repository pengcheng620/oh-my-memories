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
| `OMEM-E22-MIGRATE-NO-WRITER` | error | The destination adapter passed to `omem migrate --to` has no write support. |
| `OMEM-E23-MIGRATE-FORMAT` | error | Destination format validation refused the migration. |
| `OMEM-E24-MIGRATE-POLICY` | error | The chosen `--on-conflict` policy is not supported by the destination adapter. |
| `OMEM-E25-MIGRATE-NO-APPROVE` | error | `omem migrate --apply` refused to write because the run is non-interactive and no explicit approval was given. |
| `OMEM-E26-IMPORT-ARCHIVE` | error | `omem import` could not read or extract the supplied archive. |
| `OMEM-E27-IMPORT-MANIFEST` | error | `omem import` archive is missing or has an invalid `manifest.json`. |
| `OMEM-E28-IMPORT-NO-APPROVE` | error | `omem import --apply` refused to write because the run is non-interactive and no explicit approval was given. |
| `OMEM-E29-REMEMBER-EMPTY` | error | `omem remember` was called with empty or whitespace-only text. |
| `OMEM-E30-REMEMBER-METADATA` | error | `omem remember --metadata` was not a valid JSON object. |
| `OMEM-E31-CANONICAL-STORE` | error | A SQLite operation against the canonical store failed. |
| `OMEM-E32-CANONICAL-SCHEMA` | error | Canonical store migration sequence is broken or a step is missing. |
| `OMEM-E33-CANONICAL-DB-NEWER` | error | Canonical store schema_version is newer than this omem build understands. |
| `OMEM-E34-CANONICAL-RUNTIME` | error | Canonical store features (omem remember / canonical recall) require the Bun runtime or a Bun-compiled binary. |
| `OMEM-W01-FLAG` | warning | A flag was overridden by a more specific flag on the same command. |
| `OMEM-E40-NO-PACKAGE-MANAGER` | error | Neither bun nor npm could be found in PATH to install the adapter plugin. |
| `OMEM-E41-PLUGIN-INSTALL-FAILED` | error | The package manager command to install the adapter plugin returned a non-zero exit. |
| `OMEM-E42-PLUGIN-LOAD-FAILED` | error | An installed adapter plugin could not be loaded (bad export or import error). |
| `OMEM-E43-PLUGIN-NOT-FOUND` | error | No installed plugin with the given adapter ID was found. |
| `OMEM-E44-PLUGIN-UNINSTALL-FAILED` | error | Removing the installed adapter plugin directory failed. |
| `OMEM-E45-SEARCH-FAILED` | error | Searching the npm registry for adapter packages failed. |
| `OMEM-W02-PLUGIN-ID-COLLISION` | warning | Two installed plugins advertise the same adapter ID; the first one wins. |

## Commands (M1)

### `omem init`

**SYNOPSIS** &nbsp; `omem init [--non-interactive] [--json]`

**DESCRIPTION**
First-time setup. Detects every supported memory source (Claude Code, Cursor, Codex, Serena, Gemini CLI, Basic Memory, OpenCode, Aider),
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
| `--source=<name>` | Restrict to one adapter: `claude-code`, `cursor`, `codex`, `serena`, `gemini-cli`, `basic-memory`, `opencode`, `aider`, `copilot-chat`. |
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

**SYNOPSIS**
```text
omem mcp serve
omem mcp install --ide=<ide>
omem mcp uninstall --ide=<ide>
```

**DESCRIPTION**
`serve` starts an MCP server on stdio (tools: `omem_recall`, `omem_scan`).
`install` registers `omem mcp serve` in the IDE's config file. `uninstall` reverses it.

Supported IDEs: `claude-code` (`~/.claude.json`), `cursor` (`~/.cursor/mcp.json`),
`codex` (`~/.codex/config.toml`), `gemini` (`~/.gemini/settings.json`).

**EXAMPLES**
```bash
omem mcp install --ide=cursor
omem mcp install --ide=gemini
omem mcp uninstall --ide=claude-code
```

**EXIT CODES**: `0` success · `1` IO error · `2` bad args.

## Commands (M2)

### `omem migrate`

**SYNOPSIS**
```text
omem migrate --from <src> --to <tgt>
            [--strategy copy|move|link]
            [--on-conflict skip-on-conflict|overwrite|newest-wins]
            [--since <duration>] [--project <absPath>] [--session <id>]
            [--dry-run | --apply]
            [--i-approve-dest-writes]
            [--json]
```

**DESCRIPTION**
Copies memories from one adapter to another. Defaults to **dry-run**: nothing is
written, the run produces a manifest under `${OMEM_HOME:-~/.omem}/migrations/`.
Pass `--apply` to actually write into the destination adapter.

When stdin is not a TTY (or `--non-interactive` / `OMEM_NON_INTERACTIVE=1` is
set), `--apply` additionally requires `--i-approve-dest-writes` (or
`OMEM_I_APPROVE_DEST_WRITES=1`). This double consent prevents scripts from
silently overwriting transcripts.

Supported destinations (M2.A): `claude-code`, `cursor`, `codex`. `serena` is
read-only in M2.A.

**OPTIONS**

| Flag | Default | Effect |
|---|---|---|
| `--from <id>` | (required) | Source adapter id. |
| `--to <id>` | (required) | Destination adapter id. Must be writable. |
| `--strategy <s>` | `copy` | `copy` (default) \| `move` \| `link` (link is M2.B+). |
| `--on-conflict <p>` | `skip-on-conflict` | `skip-on-conflict` \| `overwrite` \| `newest-wins`. Adapters declare which they support. |
| `--since <duration>` | (none) | Only migrate records newer than this; same syntax as `omem scan`. |
| `--project <absPath>` | (none) | Adapter-specific project filter. |
| `--session <id>` | (none) | Restrict to one session id. |
| `--dry-run` | on | Compute the plan without writing. |
| `--apply` | off | Actually write to the destination. |
| `--i-approve-dest-writes` | off | Required with `--apply` when running non-interactively. |
| `--json` | off | Emit the manifest as a JSON document instead of a summary line. |

**ENVIRONMENT**

| Variable | Effect |
|---|---|
| `OMEM_I_APPROVE_DEST_WRITES` | When truthy, satisfies the consent requirement under `--apply` in CI. |

**MANIFEST**
Every run writes a JSON manifest at
`${OMEM_HOME:-~/.omem}/migrations/<UTC-ts>_<manifestId>.json`. Dry-run manifests
are valid but flagged with `dryRun: true` and contain `simulate-write` ops.

**EXAMPLES**
```bash
omem migrate --from claude-code --to cursor                      # dry-run
omem migrate --from cursor --to codex --apply --i-approve-dest-writes
omem migrate --from claude-code --to cursor --since 7d --apply
```

**EXIT CODES**: `0` success · `1` migration error · `2` bad args · `5` apply with some failed ops.

### `omem export`

**SYNOPSIS**
```text
omem export --output <archive.tar.gz> [--all | --from <id>] [--since <duration>]
            [--json]
```

**DESCRIPTION**
Walks each detected adapter's storage root and produces a single `.tar.gz`
containing the raw on-disk files plus a top-level `manifest.json` for
provenance. The archive is byte-for-byte restorable with `omem import`.

`--all` (default) exports every adapter present on disk; supply `--from <id>`
to export a single adapter only. Adapters whose storage roots are missing on
disk are skipped silently and reported under `summary.skippedSources` in the
manifest.

**OPTIONS**

| Flag | Default | Effect |
|---|---|---|
| `--output <path>` / `-o` | (required) | Output file path. |
| `--all` | on | Export every adapter present on disk. |
| `--from <id>` | (none) | Export a single adapter only. Mutually exclusive with `--all`. |
| `--since <duration>` | (none) | Only include files modified since this point; accepts the same syntax as `omem scan --since`. |
| `--json` | off | Emit the manifest as JSON to stdout. |

**ARCHIVE LAYOUT**
```
manifest.json                    # provenance: ts, sources, file counts, totals
claude-code/projects/...         # raw on-disk files per adapter
cursor/projects/...
codex/<YYYY>/<MM>/<DD>/...
serena/...
```

**EXAMPLES**
```bash
omem export --output backup.tar.gz                # back up everything
omem export --from cursor -o cursor.tar.gz        # one adapter only
omem export -o weekly.tar.gz --since 7d           # last 7 days
```

**EXIT CODES**: `0` success · `1` I/O error · `2` bad args.

### `omem import <archive>`

**SYNOPSIS**
```text
omem import <archive.tar.gz>
            [--dry-run | --apply]
            [--i-approve-dest-writes]
            [--on-conflict skip|overwrite]
            [--home <path>]
            [--json]
```

**DESCRIPTION**
Reverse of `omem export`: extract the archive and write each source's files
back into the user's home so `~/.cursor/projects/...`, `~/.codex/sessions/...`,
etc. are repopulated. Defaults to **dry-run**: nothing is written, the run
manifest reports what *would* happen.

When stdin is not a TTY (or `--non-interactive` / `OMEM_NON_INTERACTIVE=1` is
set), `--apply` additionally requires `--i-approve-dest-writes` (or
`OMEM_I_APPROVE_DEST_WRITES=1`). This double consent prevents scripts from
silently overwriting transcripts.

**OPTIONS**

| Flag | Default | Effect |
|---|---|---|
| `<archive>` | (required) | Path to the `.tar.gz` produced by `omem export`. |
| `--dry-run` | on | Show what would be restored without writing. |
| `--apply` | off | Actually write files back into the destination home. |
| `--i-approve-dest-writes` | off | Required with `--apply` when running non-interactively. |
| `--on-conflict <p>` | `skip` | `skip` (default) \| `overwrite` for files already on disk. |
| `--home <path>` | `$HOME` / `%USERPROFILE%` | Destination home root. |
| `--json` | off | Emit the run manifest as JSON. |

**ENVIRONMENT**

| Variable | Effect |
|---|---|
| `OMEM_I_APPROVE_DEST_WRITES` | When truthy, satisfies the consent requirement under `--apply` in CI. |
| `OMEM_HOME_OVERRIDE` | Used as the destination home when `--home` is not supplied (test/CI hatch). |

**EXAMPLES**
```bash
omem import backup.tar.gz                                              # dry-run
omem import backup.tar.gz --apply --i-approve-dest-writes              # restore
omem import backup.tar.gz --apply --i-approve-dest-writes --on-conflict overwrite
```

**EXIT CODES**: `0` success · `1` import error · `2` bad args · `5` apply with some failed ops.

### `omem upgrade`

**SYNOPSIS**
```text
omem upgrade [--check] [--apply] [--json]
```

**DESCRIPTION**
Looks up the latest published version of `oh-my-memories` on the npm registry
and reports whether the local install is up to date. Works for both install
shapes (npm/bun global install and prebuilt binary) — for the binary path it
prints the GitHub releases URL; for the npm path it prints (or runs) the
`bun install -g` command.

`--check` is the default behaviour without prompting. `--apply` automates the
npm/bun install path; binary users still download from the releases page
manually.

**OPTIONS**

| Flag | Default | Effect |
|---|---|---|
| `--check` | on | Print the comparison and recommended actions; never install. |
| `--apply` | off | Run `bun install -g oh-my-memories@<latest>` if a newer version is found. |
| `--json` | off | Emit the comparison + chosen action as JSON. |

**EXAMPLES**
```bash
omem upgrade                # check + print recommended actions
omem upgrade --check --json # CI-friendly probe
omem upgrade --apply        # bun install -g oh-my-memories@latest
```

**EXIT CODES**: `0` success (including when up to date) · `1` registry/network error or apply failed · `2` bad args.

## Commands (M3)

### `omem remember <text>`

**SYNOPSIS**
```text
omem remember <text>
              [--source <id>]
              [--session <id>]
              [--role user|assistant|system|tool]
              [--metadata '<json>']
              [--timestamp <iso>]
              [--json]
```

**DESCRIPTION**
Writes a single memory record into omem's own SQLite + FTS5 store at
`${OMEM_HOME:-~/.omem}/canonical.db`. The DB is created on first use and
migrated automatically on subsequent versions.

Records are deduplicated by content fingerprint (text + ISO timestamp +
role + sessionId), so re-running the same command with identical input is a
no-op (`created: false` in JSON output).

After `remember`, `omem recall <query>` returns canonical hits ranked by
BM25 fused with the federated adapter results (Reciprocal Rank Fusion,
k=60).

**OPTIONS**

| Flag | Default | Effect |
|---|---|---|
| `<text>` | (required) | Positional. The memory body. Whitespace-only is rejected with `OMEM-E29-REMEMBER-EMPTY`. |
| `--source <id>` | `omem` | Logical source name. |
| `--session <id>` | (none) | Optional session id (for grouping related memories). |
| `--role <r>` | (none) | `user` \| `assistant` \| `system` \| `tool`. |
| `--metadata '<json>'` | `{}` | Single JSON object string of extra key/value pairs. Validated as JSON object — strings, arrays, scalars are rejected with `OMEM-E30-REMEMBER-METADATA`. |
| `--timestamp <iso>` | now | Override the record's timestamp; any `Date`-parseable string. |
| `--json` | off | Emit the result (`{id, fingerprint, created, dbPath}`) as JSON. |

**EXAMPLES**
```bash
omem remember 'always run tests before push'
omem remember 'use Bun for new TS projects' --metadata '{"tag":"convention"}'
omem remember 'meeting notes …' --session weekly-2026-05-15 --role user
```

**EXIT CODES**: `0` success · `1` store I/O / SQLite error · `2` bad args / empty text.

## Commands (M4)

### `omem adapter`

Manages third-party adapter plugins installed at `~/.omem/node_modules/@omem-adapter/`.

#### `omem adapter list`

**SYNOPSIS**
```text
omem adapter list [--json]
```

**DESCRIPTION**
Lists all loaded adapters: the nine built-in adapters (claude-code, cursor, codex, serena,
gemini-cli, basic-memory, opencode, aider, copilot-chat) plus any plugins installed via `omem adapter install`. Plugin warnings and load errors are
printed to stderr.

**JSON SCHEMA**
```json
{
  "command": "adapter list",
  "adapters": [
    {
      "id": "string",
      "category": "ide | mcp | saas",
      "displayName": "string",
      "version": "string",
      "builtin": true
    }
  ]
}
```

**EXIT CODES**: `0` success.

#### `omem adapter install`

**SYNOPSIS**
```text
omem adapter install <package-spec> [--json]
```

**DESCRIPTION**
Installs a plugin adapter package into `~/.omem/node_modules/`. Requires `bun` or `npm`
to be on `PATH`. Accepts npm package names, `name@version`, or local paths.

**ERROR CODES**: `OMEM-E40-NO-PACKAGE-MANAGER`, `OMEM-E41-PLUGIN-INSTALL-FAILED`.

**EXIT CODES**: `0` success · `1` install failed · `2` bad args.

#### `omem adapter uninstall`

**SYNOPSIS**
```text
omem adapter uninstall <adapter-id | @omem-adapter/package-name> [--json]
```

**DESCRIPTION**
Removes an installed plugin by adapter ID or full package name.

**ERROR CODES**: `OMEM-E43-PLUGIN-NOT-FOUND`, `OMEM-E44-PLUGIN-UNINSTALL-FAILED`.

**EXIT CODES**: `0` success · `1` uninstall failed · `2` bad args.

#### `omem adapter search`

**SYNOPSIS**
```text
omem adapter search [query] [--json]
```

**DESCRIPTION**
Searches the npm registry for `@omem-adapter/*` packages. If no query is given,
lists all published packages.

**ERROR CODES**: `OMEM-E45-SEARCH-FAILED` (if npm registry is unreachable).

**EXIT CODES**: `0` success · `1` search failed.

---

### `omem stats`

**SYNOPSIS**
```text
omem stats [--json]
```

**DESCRIPTION**
Scans all detected adapters and reports aggregate statistics: total record count,
per-source counts, corrupt lines, and presence status.

**EXIT CODES**: `0` success.

---

### `omem prune`

**SYNOPSIS**
```text
omem prune [--older-than <duration>] [--deduplicate] [--json]
```

**DESCRIPTION**
Removes records from the canonical SQLite store. At least one of `--older-than`
or `--deduplicate` must be provided.

| Flag | Purpose |
|------|---------|
| `--older-than <duration>` | Remove records older than this (e.g. `90d`, `2025-01-01`). |
| `--deduplicate` | Remove duplicate records, keeping the newest per fingerprint. |
| `--json` | Emit structured result as JSON. |

**ERROR CODES**: `OMEM-E34-CANONICAL-RUNTIME` (if Bun runtime not available).

**EXIT CODES**: `0` success · `1` runtime error · `2` bad args.

## Commands (M6)

### `omem watch`

**SYNOPSIS**
```text
omem watch [--json]
```

**DESCRIPTION**
Foreground file watcher. Detects all adapter storage roots, starts watching
them for changes (recursive `fs.watch`), and auto-rescans when files change.
A 1.5s debounce collapses rapid filesystem events. Runs until Ctrl-C (SIGINT).

In `--json` mode, emits structured events: `started` (with watched paths),
`rescan` (with record counts), and `error`.

**EXAMPLES**
```bash
omem watch                # watch all sources, human-friendly output
omem watch --json         # watch with structured JSON events on stdout
```

**EXIT CODES**: `0` clean shutdown · `1` watcher setup failed · `3` no sources detected.
