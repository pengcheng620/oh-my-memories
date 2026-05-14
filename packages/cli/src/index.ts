export async function main(argv: readonly string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case undefined:
    case '--help':
    case '-h':
      printHelp();
      return;
    case '--version':
    case '-v':
      console.log('0.0.0');
      return;
    case 'init':
    case 'scan':
    case 'recall':
    case 'doctor':
    case 'config':
    case 'skills':
      console.error(`omem: '${cmd}' is not implemented yet (M1 in progress)`);
      process.exit(1);
      return;
    case 'migrate':
    case 'export':
    case 'import':
    case 'remember':
      console.error(`omem: '${cmd}' is M2 — not implemented yet`);
      process.exit(1);
      return;
    case 'mcp':
    case 'upgrade':
      console.error(`omem: '${cmd}' is M1.1 / M2 — not implemented yet`);
      process.exit(1);
      return;
    default:
      console.error(`omem: unknown command '${cmd}'. Try 'omem --help'.`);
      process.exit(2);
  }

  void rest;
}

function printHelp(): void {
  console.log(`omem — manage AI memories across all your tools

USAGE
  omem <command> [options]

COMMANDS (M1)
  init                          First-time setup
  scan [--json]                 List all detected memory sources
  recall <query> [--all]        Federated search across sources
  doctor                        Diagnose installation
  config get|set <key>          Read/write ~/.omem/config.json
  skills install --ide=<ide>    Install thin SKILL.md for an IDE

COMMANDS (M1.1+)
  mcp serve                     Run as MCP server (stdio)
  mcp install --ide=<ide>       Wire omem into IDE's mcp.json

COMMANDS (M2+)
  migrate --from <src> --to <tgt>
  export --all
  import <archive>
  remember <text>
  upgrade

OPTIONS
  -h, --help                    Show this help
  -v, --version                 Show version

DOCS
  https://github.com/pengcheng620/oh-my-memories
`);
}
