import { resolve } from 'node:path';
import { runExport } from '@oh-my-memories/core';
import { ALL_ADAPTER_IDS, createAdapterById, createAllAdapters } from '../adapters';
import { type OmemError, createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import { parseDuration } from '../parse/duration';
import type { CommandContext, CommandHandler } from './types';

// `omem export` (M2.B): pack each present adapter's raw on-disk files into a
// tar.gz with a top-level manifest.json. Defaults to all known adapters
// when --from is omitted, mirroring the spirit of `--all`.
//
// Spec: design doc M2.B + spec.md §9 ("offline backup/restore").

const OMEM_VERSION = '0.1.0-alpha.1';

export const exportCmd: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const args = parseExportArgs(ctx.argv);
  if (!args.ok) return reject(ctx, args.error);

  const adapterOpts = adapterFactoryOptions(ctx);
  let sources: ReturnType<typeof createAllAdapters>;
  if (args.value.from === undefined) {
    sources = createAllAdapters(adapterOpts);
  } else {
    const single = createAdapterById(args.value.from, adapterOpts);
    if (single === undefined) {
      return reject(
        ctx,
        createOmemError({
          code: 'OMEM-E01-USAGE',
          message: `Unknown source adapter: '${args.value.from}'. Known: ${ALL_ADAPTER_IDS.join(', ')}.`,
        }),
      );
    }
    sources = [single];
  }

  try {
    const result = await runExport({
      sources: sources.map((adapter) => ({
        id: adapter.id,
        schemaId: schemaIdFor(adapter.id),
        storageRoot: () => storageRootOf(adapter),
      })),
      outputPath: resolve(args.value.output),
      ...(args.value.sinceMs !== undefined ? { since: new Date(args.value.sinceMs) } : {}),
      omemVersion: OMEM_VERSION,
    });
    if (ctx.flags.json) {
      writeJsonResult(ctx, { ...result.manifest, outputPath: result.outputPath });
    } else {
      ctx.stdout.write(formatHumanSummary(result.manifest, result.outputPath));
    }
    return 0;
  } catch (err) {
    return reject(
      ctx,
      createOmemError({
        code: 'OMEM-E11-IO',
        message: `Export failed: ${(err as Error).message}`,
        cause: err,
      }),
    );
  }
};

interface ExportArgs {
  readonly from?: string;
  readonly output: string;
  readonly sinceMs?: number;
}

function parseExportArgs(
  argv: readonly string[],
): { ok: true; value: ExportArgs } | { ok: false; error: OmemError } {
  let from: string | undefined;
  let output: string | undefined;
  let sinceMs: number | undefined;
  let allSeen = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === '--all') {
      allSeen = true;
      continue;
    }
    if (token === '--from' || token.startsWith('--from=')) {
      const v = consumeValue(token, argv, i, '--from=');
      if (!v.ok) return v;
      from = v.value;
      i = v.advance;
      continue;
    }
    if (token === '--output' || token === '-o' || token.startsWith('--output=')) {
      const v = consumeValue(token, argv, i, '--output=');
      if (!v.ok) return v;
      output = v.value;
      i = v.advance;
      continue;
    }
    if (token === '--since' || token.startsWith('--since=')) {
      const v = consumeValue(token, argv, i, '--since=');
      if (!v.ok) return v;
      const parsed = parseDuration(v.value);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      sinceMs = parsed.date.getTime();
      i = v.advance;
      continue;
    }
    if (token.startsWith('--')) {
      return usage(`Unrecognised flag: '${token}'.`);
    }
    return usage(`Unexpected positional argument: '${token}'.`);
  }
  if (output === undefined) {
    return usage("'omem export' requires '--output <file.tar.gz>'.");
  }
  if (allSeen && from !== undefined) {
    return usage("Use either '--all' or '--from <adapter>', not both.");
  }
  const value: ExportArgs = {
    output,
    ...(from !== undefined ? { from } : {}),
    ...(sinceMs !== undefined ? { sinceMs } : {}),
  };
  return { ok: true, value };
}

function reject(ctx: CommandContext, error: OmemError): number {
  if (ctx.flags.json) writeJsonError(ctx, error);
  else writeTextError(ctx, error);
  if (error.code === 'OMEM-E01-USAGE' || error.code === 'OMEM-E02-UNKNOWN-COMMAND') return 2;
  return 1;
}

function consumeValue(
  token: string,
  argv: readonly string[],
  i: number,
  prefix: string,
): { ok: true; value: string; advance: number } | { ok: false; error: OmemError } {
  if (token.startsWith(prefix)) {
    return { ok: true, value: token.slice(prefix.length), advance: i };
  }
  const next = argv[i + 1];
  if (next === undefined) return usage(`Missing value for '${token}'.`);
  return { ok: true, value: next, advance: i + 1 };
}

function usage(message: string): { ok: false; error: OmemError } {
  return { ok: false, error: createOmemError({ code: 'OMEM-E01-USAGE', message }) };
}

function adapterFactoryOptions(ctx: CommandContext): { home?: string } {
  const home = ctx.env.OMEM_HOME_OVERRIDE;
  if (typeof home === 'string' && home.length > 0) return { home };
  return {};
}

function storageRootOf(adapter: { id: string; storageRoot?: () => string }): string {
  if (typeof adapter.storageRoot === 'function') return adapter.storageRoot();
  return '';
}

function schemaIdFor(adapterId: string): string {
  switch (adapterId) {
    case 'claude-code':
      return 'claude-code/2026-05';
    case 'cursor':
      return 'cursor/2026-05';
    case 'codex':
      return 'codex/2026-04';
    case 'serena':
      return 'serena/2026-05';
    default:
      return `${adapterId}/unknown`;
  }
}

function formatHumanSummary(
  manifest: import('@oh-my-memories/core').ExportManifest,
  outputPath: string,
): string {
  const lines: string[] = [];
  lines.push(`Exported ${manifest.summary.sourceCount} source(s) → ${outputPath}`);
  for (const s of manifest.sources) {
    lines.push(`  ${s.id}: ${s.fileCount} file(s), ${s.totalBytes} bytes`);
  }
  if (manifest.summary.skippedSources.length > 0) {
    lines.push(`  skipped (no storage on disk): ${manifest.summary.skippedSources.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}
