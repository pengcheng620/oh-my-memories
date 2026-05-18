import { existsSync, watch as fsWatch, type FSWatcher } from 'node:fs';
import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import type { CommandContext, CommandHandler } from './types';

/**
 * `omem watch` — foreground file watcher that auto-rescans when adapter
 * source files change. Runs until killed (Ctrl-C).
 *
 * On each detected change we re-run the scan pipeline and report a summary
 * line to stdout (or a JSON event if `--json` is set). A debounce window
 * collapses rapid filesystem events (e.g. editor save + tmpfile churn).
 */

const DEBOUNCE_MS = 1500;

export const watch: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const { loadAllAdapters } = await import('../adapters');

  const adapters = await loadAllAdapters();
  const roots: string[] = [];

  for (const a of adapters) {
    try {
      const result = await a.detect();
      if (result.present && result.storageRoot && existsSync(result.storageRoot)) {
        roots.push(result.storageRoot);
      }
    } catch { /* skip undetectable adapters */ }
  }

  if (roots.length === 0) {
    const error = createOmemError({
      code: 'OMEM-E03-NO-SOURCES',
      message: 'No memory sources detected. Nothing to watch.',
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 3;
  }

  if (ctx.flags.json) {
    writeJsonResult(ctx, {
      command: 'watch',
      event: 'started',
      watching: roots,
    });
  } else {
    ctx.stdout.write(`Watching ${roots.length} source(s) for changes...\n`);
    for (const r of roots) ctx.stdout.write(`  ${r}\n`);
    ctx.stdout.write('\nPress Ctrl-C to stop.\n\n');
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchers: FSWatcher[] = [];

  const onChangeDetected = async () => {
    const ts = new Date().toISOString();
    try {
      const freshAdapters = await loadAllAdapters();
      let totalRecords = 0;
      let sourceCount = 0;

      for (const a of freshAdapters) {
        try {
          const det = await a.detect();
          if (!det.present) continue;
          sourceCount++;
          let count = 0;
          for await (const _ of a.scan()) count++;
          totalRecords += count;
        } catch { /* skip failing adapters */ }
      }

      if (ctx.flags.json) {
        writeJsonResult(ctx, {
          command: 'watch',
          event: 'rescan',
          timestamp: ts,
          sources: sourceCount,
          totalRecords,
        });
      } else {
        ctx.stdout.write(`[${ts}] Rescan: ${totalRecords} records across ${sourceCount} sources\n`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (ctx.flags.json) {
        writeJsonResult(ctx, { command: 'watch', event: 'error', timestamp: ts, message: msg });
      } else {
        ctx.stderr.write(`[${ts}] Rescan error: ${msg}\n`);
      }
    }
  };

  for (const root of roots) {
    try {
      const watcher = fsWatch(root, { recursive: true }, () => {
        if (debounceTimer !== null) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => void onChangeDetected(), DEBOUNCE_MS);
      });
      watchers.push(watcher);
    } catch {
      // fs.watch may fail on some platforms/paths; non-fatal
    }
  }

  if (watchers.length === 0) {
    const error = createOmemError({
      code: 'OMEM-E11-IO',
      message: 'Could not start any file watchers. Try running with elevated permissions.',
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }

  // Keep alive until SIGINT/SIGTERM
  return new Promise<number>((resolve) => {
    const cleanup = () => {
      for (const w of watchers) w.close();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      resolve(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
};
