import { inventory, schemaVersionFor } from '@oh-my-memories/core';
import { createAdapterById, loadAdapterById, loadAllAdapters } from '../adapters';
import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { type TableColumn, renderTable, writeTextError } from '../output/table';
import { parseDuration } from '../parse/duration';
import type { CommandContext, CommandHandler } from './types';

export const scan: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const args = parseScanArgs(ctx.argv);
  if (!args.ok) {
    if (ctx.flags.json) writeJsonError(ctx, args.error);
    else writeTextError(ctx, args.error);
    return 2;
  }

  const adapters = args.value.source
    ? (() => {
        // Fast-path: try builtin first, then async plugin search.
        const builtin = createAdapterById(args.value.source);
        if (builtin) return Promise.resolve([builtin]);
        return loadAdapterById(args.value.source, { env: ctx.env }).then((a) => (a ? [a] : []));
      })()
    : loadAllAdapters({ env: ctx.env });

  const resolvedAdapters = await adapters;
  if (resolvedAdapters.length === 0) {
    const error = createOmemError({
      code: 'OMEM-E03-NO-SOURCES',
      message: args.value.source
        ? `Unknown source: '${args.value.source}'.`
        : 'No memory sources available.',
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }

  const entries = await inventory(resolvedAdapters);

  // Drain each adapter's scan to populate lastScanStats.
  for (const adapter of resolvedAdapters) {
    try {
      for await (const _record of adapter.scan()) {
        /* drain */
      }
    } catch {
      /* scan errors handled below via lastScanStats */
    }
  }

  interface ScanRow {
    id: string;
    name: string;
    present: string;
    records: string;
    corrupt: string;
    schema: string;
    healthy: string;
  }

  const rows: ScanRow[] = entries.map((entry) => {
    const adapterEntry = resolvedAdapters.find((a) => a.id === entry.adapterId);
    const stats = (
      adapterEntry as { lastScanStats?: { recordCount: number; corruptLines: number } | null }
    )?.lastScanStats;
    return {
      id: entry.adapterId,
      name: entry.displayName,
      present: entry.detected.present ? 'yes' : 'no',
      records: stats ? String(stats.recordCount) : '-',
      corrupt: stats ? String(stats.corruptLines) : '-',
      schema: schemaVersionFor(entry.adapterId),
      healthy: entry.detected.present && stats && stats.corruptLines === 0 ? 'yes' : 'no',
    };
  });

  if (ctx.flags.json) {
    writeJsonResult(ctx, {
      sources: rows.map((r) => ({
        id: r.id,
        displayName: r.name,
        present: r.present === 'yes',
        recordCount: r.records === '-' ? null : Number.parseInt(r.records, 10),
        corruptLines: r.corrupt === '-' ? null : Number.parseInt(r.corrupt, 10),
        schemaVersion: r.schema,
        healthy: r.healthy === 'yes',
      })),
    });
    return 0;
  }

  const columns: TableColumn<ScanRow>[] = [
    { header: 'SOURCE', accessor: (r) => r.id },
    { header: 'NAME', accessor: (r) => r.name },
    { header: 'PRESENT', accessor: (r) => r.present },
    { header: 'RECORDS', accessor: (r) => r.records },
    { header: 'CORRUPT', accessor: (r) => r.corrupt },
    { header: 'SCHEMA', accessor: (r) => r.schema },
    { header: 'HEALTHY', accessor: (r) => r.healthy },
  ];

  ctx.stdout.write(`${renderTable(rows, columns)}\n`);
  return 0;
};

interface ScanArgs {
  readonly source?: string;
  readonly sinceMs?: number;
}

function parseScanArgs(
  argv: readonly string[],
): { ok: true; value: ScanArgs } | { ok: false; error: ReturnType<typeof createOmemError> } {
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
  return { ok: true, value: args };
}

function usageError(message: string): ReturnType<typeof createOmemError> {
  return createOmemError({ code: 'OMEM-E01-USAGE', message });
}
