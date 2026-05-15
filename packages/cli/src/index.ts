import { config } from './commands/config';
import { doctor } from './commands/doctor';
import { helpFor } from './commands/help';
import { init } from './commands/init';
import { recall } from './commands/recall';
import { scan } from './commands/scan';
import { skills } from './commands/skills';
import type { CommandContext, CommandHandler } from './commands/types';
import { createOmemError } from './output/error';
import { writeJsonError, writeJsonResult } from './output/json';
import { writeTextError } from './output/table';
import { parseGlobalFlags } from './parse/global-flags';

// CLI entrypoint and dispatcher.
//
// Responsibilities (devex-verdict §3, §4, §15):
//   1. Parse global flags out of argv (--json, --verbose, --non-interactive, --no-color)
//   2. Print help / version when those flags are present
//   3. Route to the appropriate subcommand handler
//   4. On unknown command or bad args, fall through to OMEM-E02 / OMEM-E01
//      and the SUBCOMMAND-specific --help (F3.3), not the global one
//   5. Translate the handler's exit code into process.exit (in real runs)
//
// Why this lives in a single file rather than several: the dispatcher is
// short, and centralising the routing table makes the help-drift contract
// test trivial — every command name has exactly one declaration site.

const COMMANDS: Readonly<Record<string, CommandHandler>> = {
  init,
  scan,
  recall,
  doctor,
  config,
  skills,
};

const M2_COMMANDS: ReadonlySet<string> = new Set(['migrate', 'export', 'import', 'remember']);

const M1_1_COMMANDS: ReadonlySet<string> = new Set(['mcp', 'upgrade']);

export interface MainOptions {
  /** Defaults to process.stdout / .stderr / .env / process.stdin.isTTY. */
  readonly stdout?: Pick<NodeJS.WritableStream, 'write'>;
  readonly stderr?: Pick<NodeJS.WritableStream, 'write'>;
  readonly env?: NodeJS.ProcessEnv;
  readonly stdinIsTty?: boolean;
}

const VERSION = '0.0.0';

/**
 * Run the CLI.
 *
 * Returns the exit code rather than calling `process.exit` so callers (tests
 * + the bin/omem entrypoint) decide what to do with it. The bin script wraps
 * this and forwards to `process.exit`.
 */
export async function main(argv: readonly string[], options: MainOptions = {}): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const env = options.env ?? process.env;
  const stdinIsTty = options.stdinIsTty ?? Boolean(process.stdin.isTTY);

  const { flags, rest } = parseGlobalFlags(argv);

  // --version takes precedence over everything else.
  if (flags.version) {
    if (flags.json) {
      writeJsonResult({ stdout, stderr }, { version: VERSION });
    } else {
      stdout.write(`${VERSION}\n`);
    }
    return 0;
  }

  const [command, ...subArgv] = rest;

  // Bare `omem` or `omem --help` → global help.
  if (command === undefined) {
    if (flags.json) writeJsonResult({ stdout, stderr }, { help: helpFor(undefined) });
    else stdout.write(helpFor(undefined));
    return flags.help || rest.length === 0 ? 0 : 0;
  }

  // `omem <known-command> --help` → that command's help text.
  if (flags.help && Object.hasOwn(COMMANDS, command)) {
    stdout.write(helpFor(command));
    return 0;
  }

  // Unknown command — emit OMEM-E02 with the global help suggestion.
  if (!Object.hasOwn(COMMANDS, command)) {
    if (M2_COMMANDS.has(command)) {
      return reject(
        { stdout, stderr },
        flags.json,
        'OMEM-E02-UNKNOWN-COMMAND',
        `'${command}' is an M2+ command and is not yet implemented.`,
      );
    }
    if (M1_1_COMMANDS.has(command)) {
      return reject(
        { stdout, stderr },
        flags.json,
        'OMEM-E02-UNKNOWN-COMMAND',
        `'${command}' is an M1.1+ command and is not yet implemented.`,
      );
    }
    return reject(
      { stdout, stderr },
      flags.json,
      'OMEM-E02-UNKNOWN-COMMAND',
      `Unknown command: '${command}'.`,
    );
  }

  const handler = COMMANDS[command] as CommandHandler;
  const ctx: CommandContext = {
    argv: subArgv,
    flags,
    stdout,
    stderr,
    env,
    stdinIsTty,
  };
  return handler(ctx);
}

function reject(
  streams: {
    stdout: Pick<NodeJS.WritableStream, 'write'>;
    stderr: Pick<NodeJS.WritableStream, 'write'>;
  },
  asJson: boolean,
  code: 'OMEM-E01-USAGE' | 'OMEM-E02-UNKNOWN-COMMAND',
  message: string,
): number {
  const err = createOmemError({ code, message });
  if (asJson) writeJsonError(streams, err);
  else writeTextError({ ...streams, env: process.env }, err);
  return 2;
}
