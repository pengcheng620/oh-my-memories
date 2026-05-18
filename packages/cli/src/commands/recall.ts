import { recall as federatedRecall } from '@oh-my-memories/core';
import { createAdapterById, loadAdapterById, loadAllAdapters } from '../adapters';
import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult, writeJsonWarning } from '../output/json';
import { type TableColumn, renderTable, writeTextError, writeTextWarning } from '../output/table';
import { parseDuration } from '../parse/duration';
import { canonicalDbPath } from '../platform/paths';
import type { CommandContext, CommandHandler } from './types';

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

  // OMEM_HOME_OVERRIDE is a TEST-ONLY hatch (see migrate.ts §): it rebases
  // adapter storage roots so CLI integration tests can simulate having
  // ~/.cursor, ~/.codex, etc. inside a temp dir without touching the real
  // filesystem. In normal use it is undefined.
  const home = ctx.env.OMEM_HOME_OVERRIDE;
  const adapterOpts = home !== undefined ? { home } : undefined;

  const adapters = args.value.source
    ? (() => {
        const builtin = createAdapterById(args.value.source, adapterOpts);
        if (builtin) return Promise.resolve([builtin]);
        return loadAdapterById(args.value.source, { home: adapterOpts?.home, env: ctx.env }).then(
          (a) => (a ? [a] : []),
        );
      })()
    : loadAllAdapters({ home: adapterOpts?.home, env: ctx.env });

  const resolvedAdapters = await adapters;

  if (resolvedAdapters.length === 0 && args.value.source) {
    const error = createOmemError({
      code: 'OMEM-E03-NO-SOURCES',
      message: `Unknown source: '${args.value.source}'.`,
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }

  const recallOpts = {
    query: args.value.query,
    ...(args.value.source !== undefined ? { sources: [args.value.source] } : {}),
    ...(args.value.limit !== undefined ? { limit: args.value.limit } : {}),
    ...(args.value.sinceMs !== undefined ? { since: new Date(args.value.sinceMs) } : {}),
    // Always pass the canonical DB path; federation is cold-start safe and
    // skips the canonical arm when the file is missing. So this just enables
    // BM25 fusion *if* the user has run `omem remember` at least once.
    canonicalStorePath: canonicalDbPath({ env: ctx.env }),
  };
  const result = await federatedRecall(resolvedAdapters, recallOpts);

  // Partial success: some adapters failed, some returned hits.
  if (result.partial) {
    for (const failure of result.failures) {
      const error = createOmemError({
        code: 'OMEM-E11-IO',
        message: `Adapter '${failure.adapterId}' failed: ${failure.error}`,
      });
      if (ctx.flags.json) writeJsonError(ctx, error);
      else writeTextError(ctx, error);
    }
  }

  if (ctx.flags.json) {
    writeJsonResult(ctx, {
      query: args.value.query,
      hits: result.hits.map((h) => ({
        source: h.record.source,
        id: h.record.id,
        score: Math.round(h.score * 1000) / 1000,
        origin: h.origin,
        timestamp: h.record.timestamp.toISOString(),
        matchedTerms: h.matchedTerms,
        text: h.record.text,
        ...(h.record.sessionId !== undefined ? { sessionId: h.record.sessionId } : {}),
        ...(h.record.metadata !== undefined ? { metadata: h.record.metadata } : {}),
      })),
      ...(result.failures.length > 0 ? { failures: result.failures, partial: true } : {}),
    });
    return result.partial ? 5 : 0;
  }

  // Text output
  if (result.hits.length === 0) {
    ctx.stdout.write('No matches found.\n');
    return result.partial ? 5 : 0;
  }

  interface HitRow {
    source: string;
    score: string;
    age: string;
    preview: string;
  }

  const rows: HitRow[] = result.hits.map((h) => ({
    source: h.record.source,
    score: (Math.round(h.score * 100) / 100).toFixed(2),
    age: relativeAge(h.record.timestamp),
    preview: h.record.text.slice(0, 80).replace(/\n/g, ' '),
  }));

  const columns: TableColumn<HitRow>[] = [
    { header: 'SOURCE', accessor: (r) => r.source },
    { header: 'SCORE', accessor: (r) => r.score },
    { header: 'AGE', accessor: (r) => r.age },
    { header: 'PREVIEW', accessor: (r) => r.preview },
  ];

  ctx.stdout.write(`${renderTable(rows, columns)}\n`);
  return result.partial ? 5 : 0;
};

function relativeAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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
