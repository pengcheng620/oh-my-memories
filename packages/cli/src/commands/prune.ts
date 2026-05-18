import { CanonicalStore } from '@oh-my-memories/core';
import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import { parseDuration } from '../parse/duration';
import { canonicalDbPath } from '../platform/paths';
import type { CommandContext, CommandHandler } from './types';

export const prune: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const args = parsePruneArgs(ctx.argv);
  if (!args.ok) {
    if (ctx.flags.json) writeJsonError(ctx, args.error);
    else writeTextError(ctx, args.error);
    return 2;
  }

  if (!args.value.olderThan && !args.value.deduplicate) {
    const err = createOmemError({
      code: 'OMEM-E01-USAGE',
      message: "Provide at least one of '--older-than <duration>' or '--deduplicate'.",
    });
    if (ctx.flags.json) writeJsonError(ctx, err);
    else writeTextError(ctx, err);
    return 2;
  }

  const dbPath = canonicalDbPath({ env: ctx.env });

  try {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      const result = store.prune({
        ...(args.value.olderThan ? { olderThan: args.value.olderThan } : {}),
        ...(args.value.deduplicate ? { deduplicate: args.value.deduplicate } : {}),
      });

      if (ctx.flags.json) {
        writeJsonResult(ctx, {
          command: 'prune',
          deleted: result.deleted,
          remaining: result.remaining,
        });
      } else {
        ctx.stdout.write(`Pruned ${result.deleted} records. ${result.remaining} remaining.\n`);
      }
      return 0;
    } finally {
      store.close();
    }
  } catch (err) {
    const isRuntime = (err as { code?: string }).code === 'OMEM-E34-CANONICAL-RUNTIME';
    const error = createOmemError({
      code: isRuntime ? 'OMEM-E34-CANONICAL-RUNTIME' : 'OMEM-E01-USAGE',
      message: err instanceof Error ? err.message : String(err),
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }
};

interface PruneArgs {
  olderThan?: Date;
  deduplicate?: boolean;
}

function parsePruneArgs(
  argv: readonly string[],
): { ok: true; value: PruneArgs } | { ok: false; error: ReturnType<typeof createOmemError> } {
  const args: PruneArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === '--older-than') {
      const next = argv[i + 1];
      if (next === undefined) {
        return { ok: false, error: usageError("Missing value for '--older-than'.") };
      }
      const result = parseDuration(next);
      if (!result.ok) return { ok: false, error: result.error };
      args.olderThan = result.date;
      i += 1;
    } else if (token.startsWith('--older-than=')) {
      const result = parseDuration(token.slice('--older-than='.length));
      if (!result.ok) return { ok: false, error: result.error };
      args.olderThan = result.date;
    } else if (token === '--deduplicate') {
      args.deduplicate = true;
    } else {
      return { ok: false, error: usageError(`Unrecognised flag: '${token}'.`) };
    }
  }
  return { ok: true, value: args };
}

function usageError(message: string): ReturnType<typeof createOmemError> {
  return createOmemError({ code: 'OMEM-E01-USAGE', message });
}
