import type { GlobalFlags } from '../parse/global-flags';

// Common shape every command handler accepts. The dispatcher constructs one
// `CommandContext` and passes it down so individual commands have a single
// stable input — and tests can build one without simulating process state.

export interface CommandContext {
  /** argv after the subcommand name, with global flags already removed. */
  readonly argv: readonly string[];
  /** Parsed global flags. */
  readonly flags: GlobalFlags;
  /** Where stdout writes go (process.stdout in real runs; buffer in tests). */
  readonly stdout: Pick<NodeJS.WritableStream, 'write'>;
  /** Where stderr writes go. */
  readonly stderr: Pick<NodeJS.WritableStream, 'write'>;
  /** Environment variables (process.env in real runs). */
  readonly env: NodeJS.ProcessEnv;
  /** True when stdin is a TTY (used to decide interactive prompts). */
  readonly stdinIsTty: boolean;
}

/** Each command resolves with the exit code the dispatcher should use. */
export type CommandHandler = (ctx: CommandContext) => Promise<number> | number;
