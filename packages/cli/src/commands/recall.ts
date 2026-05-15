import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult, writeJsonWarning } from '../output/json';
import { writeTextError, writeTextWarning } from '../output/table';
import { parseDuration } from '../parse/duration';
import type { CommandContext, CommandHandler } from './types';

// Stub for `omem recall <query>`. Implements the argument grammar and the
// "--source wins, warns if --all also passed" rule from devex-verdict D2.

export const recall: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const args = parseRecallArgs(ctx.argv);
  if (!args.ok) {
    if (ctx.flags.json) writeJsonError(ctx, args.error);
    else writeTextError(ctx, args.error);
    return 2;
  }

  // D2 / F2.2: --source overrides --all but we warn so scripts get told.
  if (args.value.source !== undefined && args.value.allExplicit) {
    const warning = {
      code: 'OMEM-W01-FLAG' as const,
      message: `'--source=${args.value.source}' overrides '--all'.`,
      hint: "Drop '--all' to silence this warning.",
    };
    if (ctx.flags.json) writeJsonWarning(ctx, warning);
    else writeTextWarning(ctx, warning);
  }

  const error = createOmemError({
    code: 'OMEM-E03-NO-SOURCES',
    message: "'omem recall' is stubbed in M1 Lane E1; Lane E2 wires real federation.",
  });
  if (ctx.flags.json) {
    writeJsonResult(ctx, { query: args.value.query, hits: [], stub: true });
    writeJsonError(ctx, error);
    return 1;
  }
  writeTextError(ctx, error);
  return 1;
};

interface RecallArgs {
  readonly query: string;
  readonly source?: string;
  readonly allExplicit: boolean;
  readonly limit?: number;
  readonly sinceMs?: number;
}

function parseRecallArgs(
  argv: readonly string[],
): { ok: true; value: RecallArgs } | { ok: false; error: ReturnType<typeof createOmemError> } {
  let query: string | undefined;
  let source: string | undefined;
  let allExplicit = false;
  let limit: number | undefined;
  let sinceMs: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;

    if (token === '--all') {
      allExplicit = true;
      continue;
    }
    if (token === '--source' || token.startsWith('--source=')) {
      const value = consumeValue(token, argv, i, '--source=');
      if (!value.ok) return { ok: false, error: value.error };
      source = value.value;
      i = value.advance;
      continue;
    }
    if (token === '--limit' || token.startsWith('--limit=')) {
      const value = consumeValue(token, argv, i, '--limit=');
      if (!value.ok) return { ok: false, error: value.error };
      const n = Number.parseInt(value.value, 10);
      if (!Number.isFinite(n) || n <= 0) {
        return {
          ok: false,
          error: createOmemError({
            code: 'OMEM-E01-USAGE',
            message: `'--limit' expects a positive integer; got '${value.value}'.`,
          }),
        };
      }
      limit = n;
      i = value.advance;
      continue;
    }
    if (token === '--since' || token.startsWith('--since=')) {
      const value = consumeValue(token, argv, i, '--since=');
      if (!value.ok) return { ok: false, error: value.error };
      const parsed = parseDuration(value.value);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      sinceMs = parsed.date.getTime();
      i = value.advance;
      continue;
    }
    if (token.startsWith('--')) {
      return {
        ok: false,
        error: createOmemError({
          code: 'OMEM-E01-USAGE',
          message: `Unrecognised flag: '${token}'.`,
        }),
      };
    }
    if (query === undefined) {
      query = token;
      continue;
    }
    return {
      ok: false,
      error: createOmemError({
        code: 'OMEM-E01-USAGE',
        message: `Unexpected positional argument: '${token}'.`,
      }),
    };
  }

  if (query === undefined) {
    return {
      ok: false,
      error: createOmemError({
        code: 'OMEM-E01-USAGE',
        message: "'omem recall' requires a <query> argument.",
      }),
    };
  }
  // exactOptionalPropertyTypes: build the result only with defined fields.
  const result: RecallArgs = { query, allExplicit };
  if (source !== undefined) (result as { source?: string }).source = source;
  if (limit !== undefined) (result as { limit?: number }).limit = limit;
  if (sinceMs !== undefined) (result as { sinceMs?: number }).sinceMs = sinceMs;
  return { ok: true, value: result };
}

function consumeValue(
  token: string,
  argv: readonly string[],
  i: number,
  prefix: string,
):
  | { ok: true; value: string; advance: number }
  | { ok: false; error: ReturnType<typeof createOmemError> } {
  if (token.startsWith(prefix)) {
    return { ok: true, value: token.slice(prefix.length), advance: i };
  }
  const next = argv[i + 1];
  if (next === undefined) {
    return {
      ok: false,
      error: createOmemError({
        code: 'OMEM-E01-USAGE',
        message: `Missing value for '${token}'.`,
      }),
    };
  }
  return { ok: true, value: next, advance: i + 1 };
}
