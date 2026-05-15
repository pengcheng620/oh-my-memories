// Parses the global flags shared across every subcommand.
//
// Per devex-verdict F2.4: `--json` is a global flag, not per-command. So are
// `--verbose`, `--non-interactive`, and `--no-color`. The dispatcher peels
// these off before handing the residual argv to the subcommand.
//
// Returning the residual argv (with globals removed) lets each command parse
// its own flags without re-implementing global handling.

export interface GlobalFlags {
  readonly json: boolean;
  readonly verbose: boolean;
  readonly nonInteractive: boolean;
  readonly noColor: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

export interface ParsedGlobalFlags {
  readonly flags: GlobalFlags;
  /** argv with all global flag tokens removed, preserving order. */
  readonly rest: readonly string[];
}

/**
 * Walk argv left-to-right, separating global flag tokens from everything
 * else. We accept both `--flag` and `-x` short forms where defined; we do NOT
 * accept `--flag=value` for booleans (per F2.2: only value-bearing flags use
 * `=`, and global flags here are all booleans).
 */
export function parseGlobalFlags(argv: readonly string[]): ParsedGlobalFlags {
  let json = false;
  let verbose = false;
  let nonInteractive = false;
  let noColor = false;
  let help = false;
  let version = false;
  const rest: string[] = [];

  for (const token of argv) {
    switch (token) {
      case '--json':
        json = true;
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--non-interactive':
        nonInteractive = true;
        break;
      case '--no-color':
        noColor = true;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      case '--version':
      case '-v':
        version = true;
        break;
      default:
        rest.push(token);
    }
  }

  return {
    flags: { json, verbose, nonInteractive, noColor, help, version },
    rest,
  };
}
