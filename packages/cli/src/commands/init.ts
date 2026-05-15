import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import { isInteractive } from '../platform/interactive';
import type { CommandContext, CommandHandler } from './types';

// Stub for `omem init`. Lane E2 will wire real adapter detection + config
// writing; for now we honour the interactive contract (F2.6) and the JSON
// contract (F2.4) so contract tests + downstream commands can be authored
// against a stable shape.

export const init: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const interactive = isInteractive({
    env: ctx.env,
    stdinIsTty: ctx.stdinIsTty,
    nonInteractiveFlag: ctx.flags.nonInteractive,
  });

  // The non-interactive path is the only one the stub supports today: it
  // would need real adapter wiring to complete the interactive flow. For now
  // both paths emit the same OMEM-E21-NON-INTERACTIVE error in --json mode
  // so consumers know the command exists but isn't yet implemented.
  const error = createOmemError({
    code: 'OMEM-E21-NON-INTERACTIVE',
    message: interactive
      ? "'omem init' is stubbed in M1 Lane E1; Lane E2 wires the interactive flow."
      : "'omem init' is stubbed in M1 Lane E1; the non-interactive flow lands in Lane E2.",
  });

  if (ctx.flags.json) {
    writeJsonError(ctx, error);
    writeJsonResult(ctx, { ok: false, command: 'init' });
    return 1;
  }
  writeTextError(ctx, error);
  return 1;
};
