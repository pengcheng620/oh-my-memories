import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { ImportError, runImport } from '@oh-my-memories/core';
import { type OmemError, createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import type { CommandContext, CommandHandler } from './types';

// `omem import <archive>` (M2.B): unpack a tar.gz produced by `omem export`
// back into the user's adapter storage. Defaults to dry-run; `--apply` plus
// non-interactive use requires `--i-approve-dest-writes`, mirroring migrate.

const VALID_CONFLICT = new Set(['skip', 'overwrite']);

export const importCmd: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const args = parseImportArgs(ctx.argv);
  if (!args.ok) return reject(ctx, args.error);

  const nonInteractive = isNonInteractive(ctx);
  const approved = args.value.approveDestWrites || asBool(ctx.env.OMEM_I_APPROVE_DEST_WRITES);
  if (args.value.apply && nonInteractive && !approved) {
    return reject(
      ctx,
      createOmemError({
        code: 'OMEM-E28-IMPORT-NO-APPROVE',
        message:
          "'omem import --apply' refused: pass '--i-approve-dest-writes' (or env OMEM_I_APPROVE_DEST_WRITES=1) for non-interactive use.",
      }),
    );
  }

  const destinationHomeRoot = args.value.home ?? ctx.env.OMEM_HOME_OVERRIDE ?? homedir();
  const onConflict = (args.value.onConflict ?? 'skip') as 'skip' | 'overwrite';

  try {
    const result = await runImport({
      archivePath: resolve(args.value.archive),
      destinationHomeRoot: resolve(destinationHomeRoot),
      mode: args.value.apply ? 'apply' : 'dry-run',
      onConflict,
    });
    if (ctx.flags.json) {
      writeJsonResult(ctx, result.manifest);
    } else {
      ctx.stdout.write(formatHumanSummary(result.manifest));
    }
    return result.manifest.summary.failed > 0 ? 5 : 0;
  } catch (err) {
    if (err instanceof ImportError) {
      return reject(ctx, createOmemError({ code: err.code, message: err.message }));
    }
    return reject(
      ctx,
      createOmemError({
        code: 'OMEM-E11-IO',
        message: `Import failed: ${(err as Error).message}`,
        cause: err,
      }),
    );
  }
};

interface ImportArgs {
  readonly archive: string;
  readonly apply: boolean;
  readonly approveDestWrites: boolean;
  readonly onConflict?: string;
  readonly home?: string;
}

function parseImportArgs(
  argv: readonly string[],
): { ok: true; value: ImportArgs } | { ok: false; error: OmemError } {
  let archive: string | undefined;
  let apply = false;
  let approveDestWrites = false;
  let onConflict: string | undefined;
  let home: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === '--apply') {
      apply = true;
      continue;
    }
    if (token === '--dry-run') {
      apply = false;
      continue;
    }
    if (token === '--i-approve-dest-writes') {
      approveDestWrites = true;
      continue;
    }
    if (token === '--on-conflict' || token.startsWith('--on-conflict=')) {
      const v = consumeValue(token, argv, i, '--on-conflict=');
      if (!v.ok) return v;
      if (!VALID_CONFLICT.has(v.value)) {
        return usage(`'--on-conflict' expects skip|overwrite; got '${v.value}'.`);
      }
      onConflict = v.value;
      i = v.advance;
      continue;
    }
    if (token === '--home' || token.startsWith('--home=')) {
      const v = consumeValue(token, argv, i, '--home=');
      if (!v.ok) return v;
      home = v.value;
      i = v.advance;
      continue;
    }
    if (token.startsWith('--')) {
      return usage(`Unrecognised flag: '${token}'.`);
    }
    if (archive !== undefined) {
      return usage(`Unexpected positional argument: '${token}'.`);
    }
    archive = token;
  }
  if (archive === undefined) {
    return usage("'omem import' requires a path to a .tar.gz archive.");
  }
  const value: ImportArgs = {
    archive,
    apply,
    approveDestWrites,
    ...(onConflict !== undefined ? { onConflict } : {}),
    ...(home !== undefined ? { home } : {}),
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

function isNonInteractive(ctx: CommandContext): boolean {
  if (ctx.flags.nonInteractive) return true;
  if (asBool(ctx.env.OMEM_NON_INTERACTIVE)) return true;
  return !ctx.stdinIsTty;
}

function asBool(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function formatHumanSummary(manifest: import('@oh-my-memories/core').ImportRunManifest): string {
  const verb = manifest.mode === 'dry-run' ? 'Would restore' : 'Restored';
  const lines: string[] = [];
  lines.push(
    `${verb} from ${manifest.archivePath} → ${manifest.destinationHomeRoot} (${manifest.onConflict})`,
  );
  lines.push(
    `  ${manifest.summary.restored} restored, ${manifest.summary.simulated} simulated, ${manifest.summary.skipped} skipped, ${manifest.summary.failed} failed`,
  );
  return `${lines.join('\n')}\n`;
}
