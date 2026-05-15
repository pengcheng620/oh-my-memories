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

COMMANDS (M2+)
  migrate --from <src> --to <tgt>
  export --all
  import <archive>
  remember <text>
  upgrade

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
};

/**
 * Returns the help text for a known command, or the global help if no name
 * (or an unrecognised name) is supplied.
 */
export function helpFor(command: string | undefined): string {
  if (command === undefined) return GLOBAL_HELP;
  return HELP_TEXT[command] ?? GLOBAL_HELP;
}
