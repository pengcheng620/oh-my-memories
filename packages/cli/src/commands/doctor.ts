import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import type { CommandContext, CommandHandler } from './types';

// Stub for `omem doctor`. Lane E2 will gather real adapter health.

export const doctor: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const error = createOmemError({
    code: 'OMEM-E03-NO-SOURCES',
    message: "'omem doctor' is stubbed in M1 Lane E1; Lane E2 wires real health probes.",
  });

  if (ctx.flags.json) {
    writeJsonResult(ctx, {
      omemVersion: '0.0.0',
      runtime: process.version,
      adapters: [],
      stub: true,
    });
    writeJsonError(ctx, error);
    return 1;
  }
  writeTextError(ctx, error);
  return 1;
};
