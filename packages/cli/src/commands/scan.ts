import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import { parseDuration } from '../parse/duration';
import type { CommandContext, CommandHandler } from './types';

// Stub for `omem scan`. Argument parsing + Tier 2 error contract are real;
// the actual adapter dispatch lands in Lane E2.

export const scan: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const args = parseScanArgs(ctx.argv);

  if (!args.ok) {
    if (ctx.flags.json) writeJsonError(ctx, args.error);
    else writeTextError(ctx, args.error);
    return 2;
  }

  // Real implementation will live in core/inventory in Lane E2.
  const error = createOmemError({
    code: 'OMEM-E03-NO-SOURCES',
    message: "'omem scan' is stubbed in M1 Lane E1; Lane E2 wires real adapter dispatch.",
  });
  if (ctx.flags.json) {
    writeJsonResult(ctx, { sources: [], stub: true });
    writeJsonError(ctx, error);
    return 1;
  }
  writeTextError(ctx, error);
  return 1;
};

interface ScanArgs {
  readonly source?: string;
  readonly sinceMs?: number;
}

function parseScanArgs(
  argv: readonly string[],
): { ok: true; args: ScanArgs } | { ok: false; error: ReturnType<typeof createOmemError> } {
  const args: { source?: string; sinceMs?: number } = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === '--source' || token === '--source=') {
      const next = argv[i + 1];
      if (next === undefined) {
        return { ok: false, error: usageError("Missing value for '--source'.") };
      }
      args.source = next;
      i += 1;
      continue;
    }
    if (token.startsWith('--source=')) {
      args.source = token.slice('--source='.length);
      continue;
    }
    if (token === '--since') {
      const next = argv[i + 1];
      if (next === undefined) {
        return { ok: false, error: usageError("Missing value for '--since'.") };
      }
      const result = parseDuration(next);
      if (!result.ok) return { ok: false, error: result.error };
      args.sinceMs = result.date.getTime();
      i += 1;
      continue;
    }
    if (token.startsWith('--since=')) {
      const result = parseDuration(token.slice('--since='.length));
      if (!result.ok) return { ok: false, error: result.error };
      args.sinceMs = result.date.getTime();
      continue;
    }
    return { ok: false, error: usageError(`Unrecognised flag: '${token}'.`) };
  }
  return { ok: true, args };
}

function usageError(message: string): ReturnType<typeof createOmemError> {
  return createOmemError({ code: 'OMEM-E01-USAGE', message });
}
