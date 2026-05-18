import { loadAllAdapters } from '../adapters';
import { writeJsonResult } from '../output/json';
import { type TableColumn, renderTable } from '../output/table';
import type { CommandContext, CommandHandler } from './types';

export const stats: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const adapters = await loadAllAdapters();

  interface SourceStats {
    id: string;
    displayName: string;
    present: boolean;
    recordCount: number;
    corruptLines: number;
  }

  const results: SourceStats[] = [];

  for (const adapter of adapters) {
    let present = false;
    try {
      const detect = await adapter.detect();
      present = detect.present;
    } catch {
      /* non-fatal */
    }

    let recordCount = 0;
    let corruptLines = 0;

    if (present) {
      try {
        for await (const _record of adapter.scan()) {
          /* drain to populate stats */
        }
        const lastStats = (
          adapter as { lastScanStats?: { recordCount: number; corruptLines: number } | null }
        ).lastScanStats;
        if (lastStats) {
          recordCount = lastStats.recordCount;
          corruptLines = lastStats.corruptLines;
        }
      } catch {
        /* scan error */
      }
    }

    results.push({
      id: adapter.id,
      displayName: adapter.displayName,
      present,
      recordCount,
      corruptLines,
    });
  }

  const totalRecords = results.reduce((sum, r) => sum + r.recordCount, 0);
  const totalCorrupt = results.reduce((sum, r) => sum + r.corruptLines, 0);
  const presentCount = results.filter((r) => r.present).length;

  if (ctx.flags.json) {
    writeJsonResult(ctx, {
      command: 'stats',
      totalRecords,
      totalCorruptLines: totalCorrupt,
      sourcesPresent: presentCount,
      sourcesTotal: results.length,
      sources: results,
    });
  } else {
    const columns: TableColumn<SourceStats>[] = [
      { header: 'SOURCE', accessor: (r) => r.id },
      { header: 'NAME', accessor: (r) => r.displayName },
      { header: 'PRESENT', accessor: (r) => (r.present ? 'yes' : 'no') },
      { header: 'RECORDS', accessor: (r) => String(r.recordCount) },
      { header: 'CORRUPT', accessor: (r) => String(r.corruptLines) },
    ];

    ctx.stdout.write(`${renderTable(results, columns)}\n`);
    ctx.stdout.write(
      `Total: ${totalRecords} records across ${presentCount}/${results.length} sources`,
    );
    if (totalCorrupt > 0) ctx.stdout.write(` (${totalCorrupt} corrupt lines)`);
    ctx.stdout.write('\n');
  }

  return 0;
};
