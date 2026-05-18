// Per-subcommand help text.
//
// devex-verdict F3.3: bad CLI args MUST drop the user into the relevant
// subcommand's --help, not the global one. So the help text for each
// subcommand lives in this module and is shared between:
//   • intentional `omem <cmd> --help`
//   • the OMEM-E01-USAGE error path
//   • the help-drift contract test that diffs this against docs/CLI.md

const GLOBAL_HELP = `omem - manage AI memories across all your tools

USAGE
  omem <command> [options]

COMMANDS (M1)
  init                          First-time setup; detect sources and configure
  scan [--json]                 List every detected memory source
  recall <query> [--all]        Federated search across all sources (default --all)
  doctor                        Diagnose installation and adapter health
  config get|set|list           Read/write ~/.omem/config.json
  skills install --ide=<ide>    Install thin SKILL.md for an IDE

COMMANDS (M1.1+)
  mcp serve                     Run as MCP server (stdio)
  mcp install --ide=<ide>       Wire omem into an IDE's mcp.json

COMMANDS (M2)
  migrate --from <src> --to <tgt>   Copy memories between adapters
  export --output <archive>         Pack adapter storage into a tar.gz
  import <archive>                  Restore an archive produced by 'omem export'
  upgrade [--check | --apply]       Check for and install the latest omem

COMMANDS (M3)
  remember <text>                   Store a memory in omem's own canonical store

COMMANDS (M4)
  adapter list                      List all adapters (built-ins + installed plugins)
  adapter install <pkg>             Install a third-party adapter plugin from npm
  adapter uninstall <id>            Remove an installed adapter plugin

GLOBAL OPTIONS
  --json                        Emit JSON to stdout, NDJSON warnings on stderr
  --verbose                     Log each adapter scan + include cause in errors
  --non-interactive             Fail rather than prompt; same as OMEM_NON_INTERACTIVE=1
  --no-color                    Disable ANSI colour; same as NO_COLOR=1
  -h, --help                    Show this help (or per-command help if shown after a command)
  -v, --version                 Show version

ENVIRONMENT
  OMEM_HOME              Override the default ~/.omem location
  OMEM_NON_INTERACTIVE   Same as --non-interactive when set to 1/true/yes
  NO_COLOR               Disable ANSI colour when set to a non-empty string

DOCS
  docs/CLI.md (in this repo) - per-command schema and examples
`;

const INIT_HELP = `omem init - first-time setup

USAGE
  omem init [--non-interactive] [--json]

DESCRIPTION
  Detects every supported memory source on this machine (Claude Code, Cursor,
  Codex, Serena), writes ~/.omem/config.json, and (interactively only) prompts
  whether to install thin skills for the IDEs it found.

OPTIONS
  --non-interactive  Skip prompts; fail with OMEM-E21 if any are mandatory.
  --json             Emit a structured result instead of human prose.
`;

const SCAN_HELP = `omem scan - list detected memory sources

USAGE
  omem scan [--json] [--source=<name>] [--since=<duration>]

OPTIONS
  --json              Emit a JSON array; see docs/CLI.md schema.
  --source=<name>     Restrict to one adapter: claude-code | cursor | codex | serena
  --since=<duration>  Only count records newer than this duration; e.g. 7d, 2026-01-01

EXAMPLES
  omem scan
  omem scan --json
  omem scan --source=cursor --since=7d
`;

const RECALL_HELP = `omem recall - federated search

USAGE
  omem recall <query> [--all] [--source=<name>] [--limit=<n>] [--json]

DESCRIPTION
  Searches every detected source by default (devex-verdict D1). The query is
  passed verbatim; matching is BM25 in M1 (no embeddings).

OPTIONS
  --all               Default; explicit form for clarity in scripts.
  --source=<name>     Search ONLY this adapter; overrides --all (OMEM-W01-FLAG).
  --limit=<n>         Cap the result count; default 50.
  --since=<duration>  Filter by recency; same syntax as 'omem scan'.
  --json              Emit JSON results.

EXAMPLES
  omem recall "ai memory"
  omem recall "react hooks" --source=cursor --limit=20
`;

const DOCTOR_HELP = `omem doctor - diagnose installation

USAGE
  omem doctor [--json]

DESCRIPTION
  Reports adapter health (present? readable? schema version?), denylisted-file
  count from the last scan, omem version, runtime version, and per-adapter
  schema versions. Exits 0 if every adapter is healthy, 5 if any is partial.
`;

const CONFIG_HELP = `omem config - read or write ~/.omem/config.json

USAGE
  omem config get <key>
  omem config set <key> <value>
  omem config list [--json]

EXAMPLES
  omem config get default.limit
  omem config set default.limit 100
  omem config list --json
`;

const SKILLS_HELP = `omem skills install - drop a thin SKILL.md into an IDE

USAGE
  omem skills install --ide=<ide>

OPTIONS
  --ide=<ide>     One of: claude-code | cursor | codex (case-insensitive)
                  Both --ide=NAME and --ide NAME are accepted (F2.2).
`;

const MIGRATE_HELP = `omem migrate - copy memories between tools

USAGE
  omem migrate --from <src> --to <tgt>
              [--strategy copy|move|link]
              [--on-conflict skip-on-conflict|overwrite|newest-wins]
              [--since <duration>] [--project <absPath>] [--session <id>]
              [--dry-run | --apply]
              [--i-approve-dest-writes]
              [--json]

DESCRIPTION
  Default is dry-run. Pass '--apply' to actually write into the destination
  adapter. When stdin is not a TTY (or '--non-interactive' / OMEM_NON_INTERACTIVE=1
  is set), '--apply' additionally requires '--i-approve-dest-writes' (or
  OMEM_I_APPROVE_DEST_WRITES=1) so scripts can never accidentally overwrite
  memory transcripts.

  Supported destinations: claude-code, cursor, codex.
  'serena' is read-only in M2.A.

OPTIONS
  --from <id>             Source adapter id (required).
  --to <id>               Destination adapter id (required, must be writable).
  --strategy <s>          copy (default) | move | link (link is M2.B+).
  --on-conflict <p>       skip-on-conflict (default) | overwrite | newest-wins.
                          Adapters declare which policies they support; a
                          mismatch errors with OMEM-E24-MIGRATE-POLICY.
  --since <duration>      Only migrate records newer than this; same syntax as
                          'omem scan' (e.g. 7d, 2026-01-01).
  --project <absPath>     Adapter-specific project filter.
  --session <id>          Restrict to one session id.
  --dry-run               Default. Compute the plan without writing.
  --apply                 Actually write to the destination.
  --i-approve-dest-writes Required with --apply when running non-interactively.
  --json                  Emit the manifest as JSON instead of a summary line.

EXAMPLES
  omem migrate --from claude-code --to cursor                      # dry-run
  omem migrate --from cursor --to codex --apply --i-approve-dest-writes
`;

const EXPORT_HELP = `omem export - pack adapter storage into a portable archive

USAGE
  omem export --output <archive.tar.gz> [--all | --from <id>] [--since <duration>]
              [--json]

DESCRIPTION
  Walks each detected adapter's storage root and produces a single .tar.gz
  containing the raw on-disk files plus a top-level 'manifest.json' for
  provenance. The archive is byte-for-byte restorable with 'omem import'.

  Adapters whose storage roots are missing on disk are skipped silently —
  reported under 'summary.skippedSources' in the manifest.

OPTIONS
  --output <path>, -o     Output file path (required).
  --all                   Default. Export every adapter present on disk.
  --from <id>             Export a single adapter only.
  --since <duration>      Only include files modified since this point;
                          accepts the same syntax as 'omem scan --since'.
  --json                  Emit the manifest as JSON instead of a summary line.

EXAMPLES
  omem export --output backup.tar.gz                # back up everything
  omem export --from cursor -o cursor.tar.gz        # one adapter only
  omem export -o weekly.tar.gz --since 7d           # last 7 days
`;

const IMPORT_HELP = `omem import - restore an archive produced by 'omem export'

USAGE
  omem import <archive.tar.gz>
              [--dry-run | --apply]
              [--i-approve-dest-writes]
              [--on-conflict skip|overwrite]
              [--home <path>]
              [--json]

DESCRIPTION
  Default is dry-run. '--apply' writes the archive's files back into your
  user home (or the path passed to '--home'). Files already present on disk
  are skipped unless '--on-conflict overwrite' is given. When stdin is not
  a TTY (or '--non-interactive' / OMEM_NON_INTERACTIVE=1 is set), '--apply'
  additionally requires '--i-approve-dest-writes' (or
  OMEM_I_APPROVE_DEST_WRITES=1) so scripts can never accidentally overwrite
  memory transcripts.

OPTIONS
  --dry-run               Default. Show what would be restored without writing.
  --apply                 Actually write files into the destination home.
  --i-approve-dest-writes Required with --apply when non-interactive.
  --on-conflict <p>       skip (default) | overwrite.
  --home <path>           Destination home root. Default: \$HOME / %USERPROFILE%.
  --json                  Emit the run manifest as JSON.

EXAMPLES
  omem import backup.tar.gz                         # dry-run
  omem import backup.tar.gz --apply --i-approve-dest-writes
`;

const REMEMBER_HELP = `omem remember <text> - store a memory in the L2 canonical store

USAGE
  omem remember <text>
                [--source <id>]
                [--session <id>]
                [--role user|assistant|system|tool]
                [--metadata '<json>']
                [--timestamp <iso>]
                [--json]

DESCRIPTION
  Writes a record into omem's own SQLite + FTS5 store at
  \${OMEM_HOME:-~/.omem}/canonical.db. The store is created on first use
  and migrated automatically on subsequent versions.

  Records are deduplicated by content fingerprint (text + timestamp +
  role + sessionId), so re-running the same command is a no-op.

  After 'remember', 'omem recall <query>' returns canonical hits ranked by
  BM25 alongside the federated adapter results.

OPTIONS
  --source <id>           Logical source name. Default: 'omem'.
  --session <id>          Optional session id (for grouping related memories).
  --role <r>              user | assistant | system | tool.
  --metadata <json>       Single JSON object string of extra key/value pairs.
  --timestamp <iso>       Override the record's timestamp (any Date-parseable string).
  --json                  Emit the result as JSON.

EXAMPLES
  omem remember 'always run tests before push'
  omem remember 'use Bun for new TS projects' --metadata '{"tag":"convention"}'
  omem remember 'meeting notes …' --session weekly-2026-05-15 --role user
`;

const UPGRADE_HELP = `omem upgrade - check for and install the latest omem release

USAGE
  omem upgrade [--check] [--apply] [--json]

DESCRIPTION
  Looks up the latest published version on the npm registry and reports
  whether your installation is up to date.

  Without flags: print the comparison + the recommended action for both
  install paths (npm/bun and prebuilt binary). Exits 0 even if a newer
  version is available, so this is safe to run from doctor / CI.

  '--check' is the same as the default but never prompts and always exits
  0 unless the registry lookup fails.

  '--apply' attempts the npm/bun install path automatically. Prebuilt
  binary users still need to download from the GitHub releases page.

OPTIONS
  --check     Just check; do not attempt any install. Mutually exclusive
              with --apply.
  --apply     Run 'bun install -g oh-my-memories@<latest>' if a newer
              version is found. Mutually exclusive with --check.
  --json      Emit the comparison as JSON.

EXAMPLES
  omem upgrade                # check + print recommended actions
  omem upgrade --check --json # CI-friendly probe
  omem upgrade --apply        # bun install -g oh-my-memories@latest
`;

const ADAPTER_HELP = `omem adapter - manage third-party adapter plugins

USAGE
  omem adapter list
  omem adapter install <package-spec>
  omem adapter uninstall <adapter-id | package-name>

SUBCOMMANDS
  list                      List all loaded adapters (built-ins + installed plugins).
                            Warnings about failed or colliding plugins are shown on stderr.

  install <spec>            Install a plugin adapter.
                            <spec> can be:
                              @omem-adapter/my-adapter          (latest from npm)
                              @omem-adapter/my-adapter@1.2.3    (pinned version)
                              ./my-adapter                      (local path)
                            Requires bun or npm to be on PATH.

  uninstall <id-or-pkg>     Remove an installed plugin.
                            Accepts either the adapter ID (e.g. 'my-adapter')
                            or the full package name (@omem-adapter/my-adapter).

OPTIONS
  --json     Emit structured output for all subcommands.

EXAMPLES
  omem adapter list
  omem adapter install @omem-adapter/serena-cloud
  omem adapter install ./path/to/my-local-adapter
  omem adapter uninstall my-adapter
  omem adapter uninstall @omem-adapter/serena-cloud
`;

const MCP_HELP = `omem mcp - run as MCP server, or wire into an IDE

USAGE
  omem mcp serve
  omem mcp install --ide=<ide>
  omem mcp uninstall --ide=<ide>

DESCRIPTION
  'serve' starts the MCP server over stdio and exposes two tools:
    omem_recall  Federated search across detected sources (read-only)
    omem_scan    List detected memory sources with health info (read-only)

  'install' writes the omem stanza to your IDE's MCP config so the IDE will
  spawn 'omem mcp serve' on demand. Idempotent — re-running is safe.

OPTIONS
  --ide=<ide>     One of: claude-code | cursor | codex (case-insensitive)

EXAMPLES
  omem mcp install --ide=cursor
  omem mcp serve
`;

export const HELP_TEXT: Readonly<Record<string, string>> = {
  __global__: GLOBAL_HELP,
  init: INIT_HELP,
  scan: SCAN_HELP,
  recall: RECALL_HELP,
  doctor: DOCTOR_HELP,
  config: CONFIG_HELP,
  skills: SKILLS_HELP,
  mcp: MCP_HELP,
  migrate: MIGRATE_HELP,
  export: EXPORT_HELP,
  import: IMPORT_HELP,
  upgrade: UPGRADE_HELP,
  remember: REMEMBER_HELP,
  adapter: ADAPTER_HELP,
};

/**
 * Returns the help text for a known command, or the global help if no name
 * (or an unrecognised name) is supplied.
 */
export function helpFor(command: string | undefined): string {
  if (command === undefined) return GLOBAL_HELP;
  return HELP_TEXT[command] ?? GLOBAL_HELP;
}
