import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import type { CommandContext, CommandHandler } from './types';

// Stub for `omem config`. Argument grammar (get/set/list) is real so callers
// can wire scripts; the round-trip to ~/.omem/config.json lands in Lane E2.

export const config: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const sub = ctx.argv[0];
  if (sub !== 'get' && sub !== 'set' && sub !== 'list') {
    const err = createOmemError({
      code: 'OMEM-E01-USAGE',
      message: 'Usage: omem config get|set|list',
    });
    if (ctx.flags.json) writeJsonError(ctx, err);
    else writeTextError(ctx, err);
    return 2;
  }

  // Each subcommand has its own minimum-arity validation; real round-tripping
  // arrives in Lane E2 with config.json schema lock.
  if (sub === 'get' && ctx.argv.length < 2) {
    return missing(ctx, "'omem config get' requires <key>");
  }
  if (sub === 'set' && ctx.argv.length < 3) {
    return missing(ctx, "'omem config set' requires <key> <value>");
  }

  const stub = createOmemError({
    code: 'OMEM-E12-CONFIG-INVALID',
    message: `'omem config ${sub}' is stubbed in M1 Lane E1; Lane E2 wires the round-trip.`,
  });
  if (ctx.flags.json) {
    writeJsonResult(ctx, { command: 'config', subcommand: sub, stub: true });
    writeJsonError(ctx, stub);
    return 1;
  }
  writeTextError(ctx, stub);
  return 1;
};

function missing(ctx: CommandContext, message: string): number {
  const err = createOmemError({ code: 'OMEM-E01-USAGE', message });
  if (ctx.flags.json) writeJsonError(ctx, err);
  else writeTextError(ctx, err);
  return 2;
}
