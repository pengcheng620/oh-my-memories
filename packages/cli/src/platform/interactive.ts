// Detects whether the current invocation is allowed to prompt the user.
//
// Per devex-verdict F2.6 + spec.md §6.4:
//   • If --non-interactive is on the CLI, OR
//   • OMEM_NON_INTERACTIVE is set to a truthy value (1, true, yes), OR
//   • stdin is not a TTY,
// then we are in "non-interactive mode" and any code path that requires a
// prompt MUST instead emit OMEM-E21-NON-INTERACTIVE.
//
// As with the other platform helpers, this is pure — callers inject env and
// `isTty` so the dispatcher contract test can pin both.

export interface InteractiveOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** True if stdin is a TTY. Tests pass false for piped invocations. */
  readonly stdinIsTty?: boolean;
  /** Set true when the user passed `--non-interactive`. */
  readonly nonInteractiveFlag?: boolean;
}

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'y', 'on']);

export function isInteractive(options: InteractiveOptions = {}): boolean {
  if (options.nonInteractiveFlag === true) return false;

  const env = options.env ?? process.env;
  const envValue = env.OMEM_NON_INTERACTIVE;
  if (envValue !== undefined && TRUTHY_VALUES.has(envValue.toLowerCase())) {
    return false;
  }

  const isTty = options.stdinIsTty ?? Boolean(process.stdin.isTTY);
  return isTty;
}

/** Honour NO_COLOR (https://no-color.org). */
export function colorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR.length > 0) return false;
  return true;
}
