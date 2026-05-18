import {
  type ConflictPolicy,
  type MigrateMode,
  type MigrateStrategy,
  isWritableAdapter,
} from '@oh-my-memories/adapter-sdk';
import { MigrationError, runMigration, writeManifest } from '@oh-my-memories/core';
import { ALL_ADAPTER_IDS, createAdapterById } from '../adapters';
import { type OmemError, createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import { parseDuration } from '../parse/duration';
import { resolveOmemHome } from '../platform/home';
import type { CommandContext, CommandHandler } from './types';

// `omem migrate` (M2.A): copy memories from one adapter to another.
//
// Spec: `specs/iwritable-adapter-mini-spec.md` §10. Defaults to dry-run.
// Apply requires explicit `--apply`, plus `--i-approve-dest-writes` (or env)
// when stdin/stdout aren't a TTY so scripts can't accidentally write.

const VALID_STRATEGIES = new Set<MigrateStrategy>(['copy', 'move', 'link']);
const VALID_POLICIES = new Set<ConflictPolicy>(['skip-on-conflict', 'overwrite', 'newest-wins']);

export const migrate: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const args = parseMigrateArgs(ctx.argv);
  if (!args.ok) return reject(ctx, args.error);

  if (args.value.strategy === 'link') {
    return reject(
      ctx,
      createOmemError({
        code: 'OMEM-E01-USAGE',
        message: "'--strategy=link' is not supported in M2.A.",
      }),
    );
  }

  const adapterOpts = adapterFactoryOptions(ctx);
  const source = createAdapterById(args.value.from, adapterOpts);
  if (source === undefined) {
    return reject(
      ctx,
      createOmemError({
        code: 'OMEM-E01-USAGE',
        message: `Unknown source adapter: '${args.value.from}'. Known: ${ALL_ADAPTER_IDS.join(', ')}.`,
      }),
    );
  }
  const destination = createAdapterById(args.value.to, adapterOpts);
  if (destination === undefined) {
    return reject(
      ctx,
      createOmemError({
        code: 'OMEM-E01-USAGE',
        message: `Unknown destination adapter: '${args.value.to}'. Known: ${ALL_ADAPTER_IDS.join(', ')}.`,
      }),
    );
  }
  if (!isWritableAdapter(destination)) {
    return reject(
      ctx,
      createOmemError({
        code: 'OMEM-E22-MIGRATE-NO-WRITER',
        message: `Destination '${args.value.to}' has no write support.`,
      }),
    );
  }

  const nonInteractive = isNonInteractive(ctx);
  const approved = args.value.approveDestWrites || asBool(ctx.env.OMEM_I_APPROVE_DEST_WRITES);
  const mode: MigrateMode = args.value.apply
    ? { kind: 'apply', approvedDestWrite: approved }
    : { kind: 'dry-run' };

  try {
    const { manifest } = await runMigration({
      source,
      destination,
      sourceSchema: schemaIdFor(args.value.from),
      destSchema: schemaIdFor(args.value.to),
      mode,
      strategy: args.value.strategy,
      conflictPolicy: args.value.conflictPolicy,
      filters: buildFilters(args.value),
      nonInteractive,
    });

    const omemHome = resolveOmemHome({ env: ctx.env });
    const manifestPath = await writeManifest(manifest, omemHome);

    if (ctx.flags.json) {
      writeJsonResult(ctx, { ...manifest, manifestPath });
    } else {
      ctx.stdout.write(formatHumanSummary(manifest, manifestPath));
    }
    return manifest.summary.failed > 0 ? 5 : 0;
  } catch (err) {
    if (err instanceof MigrationError) {
      return reject(ctx, createOmemError({ code: err.code, message: err.message }));
    }
    return reject(
      ctx,
      createOmemError({
        code: 'OMEM-E11-IO',
        message: `Migration aborted: ${(err as Error).message}`,
        cause: err,
      }),
    );
  }
};

function reject(ctx: CommandContext, error: OmemError): number {
  if (ctx.flags.json) writeJsonError(ctx, error);
  else writeTextError(ctx, error);
  if (error.code === 'OMEM-E01-USAGE' || error.code === 'OMEM-E02-UNKNOWN-COMMAND') return 2;
  return 1;
}

interface MigrateArgs {
  readonly from: string;
  readonly to: string;
  readonly strategy: MigrateStrategy;
  readonly conflictPolicy: ConflictPolicy;
  readonly apply: boolean;
  readonly approveDestWrites: boolean;
  readonly sinceMs?: number;
  readonly projectPath?: string;
  readonly sessionId?: string;
}

function parseMigrateArgs(
  argv: readonly string[],
): { ok: true; value: MigrateArgs } | { ok: false; error: OmemError } {
  let from: string | undefined;
  let to: string | undefined;
  let strategy: MigrateStrategy = 'copy';
  let conflictPolicy: ConflictPolicy = 'skip-on-conflict';
  let apply = false;
  let approveDestWrites = false;
  let sinceMs: number | undefined;
  let projectPath: string | undefined;
  let sessionId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === '--from' || token.startsWith('--from=')) {
      const v = consumeValue(token, argv, i, '--from=');
      if (!v.ok) return v;
      from = v.value;
      i = v.advance;
      continue;
    }
    if (token === '--to' || token.startsWith('--to=')) {
      const v = consumeValue(token, argv, i, '--to=');
      if (!v.ok) return v;
      to = v.value;
      i = v.advance;
      continue;
    }
    if (token === '--strategy' || token.startsWith('--strategy=')) {
      const v = consumeValue(token, argv, i, '--strategy=');
      if (!v.ok) return v;
      if (!VALID_STRATEGIES.has(v.value as MigrateStrategy)) {
        return usage(`'--strategy' expects copy|move|link; got '${v.value}'.`);
      }
      strategy = v.value as MigrateStrategy;
      i = v.advance;
      continue;
    }
    if (token === '--on-conflict' || token.startsWith('--on-conflict=')) {
      const v = consumeValue(token, argv, i, '--on-conflict=');
      if (!v.ok) return v;
      if (!VALID_POLICIES.has(v.value as ConflictPolicy)) {
        return usage(
          `'--on-conflict' expects skip-on-conflict|overwrite|newest-wins; got '${v.value}'.`,
        );
      }
      conflictPolicy = v.value as ConflictPolicy;
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
    if (token === '--project' || token.startsWith('--project=')) {
      const v = consumeValue(token, argv, i, '--project=');
      if (!v.ok) return v;
      projectPath = v.value;
      i = v.advance;
      continue;
    }
    if (token === '--session' || token.startsWith('--session=')) {
      const v = consumeValue(token, argv, i, '--session=');
      if (!v.ok) return v;
      sessionId = v.value;
      i = v.advance;
      continue;
    }
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
    if (token.startsWith('--')) {
      return usage(`Unrecognised flag: '${token}'.`);
    }
    return usage(`Unexpected positional argument: '${token}'.`);
  }
  if (from === undefined) return usage("'omem migrate' requires '--from <adapter>'.");
  if (to === undefined) return usage("'omem migrate' requires '--to <adapter>'.");
  const value: MigrateArgs = {
    from,
    to,
    strategy,
    conflictPolicy,
    apply,
    approveDestWrites,
    ...(sinceMs !== undefined ? { sinceMs } : {}),
    ...(projectPath !== undefined ? { projectPath } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
  };
  return { ok: true, value };
}

function buildFilters(args: MigrateArgs): {
  since?: Date;
  projectPath?: string;
  sessionId?: string;
} {
  const out: { since?: Date; projectPath?: string; sessionId?: string } = {};
  if (args.sinceMs !== undefined) out.since = new Date(args.sinceMs);
  if (args.projectPath !== undefined) out.projectPath = args.projectPath;
  if (args.sessionId !== undefined) out.sessionId = args.sessionId;
  return out;
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

function adapterFactoryOptions(ctx: CommandContext): { home?: string } {
  // OMEM_HOME_OVERRIDE is a TEST-ONLY hatch: it lets CLI integration tests
  // build a hermetic fake user home so they don't read or write into the
  // developer's real ~/.codex / ~/.cursor / ~/.claude directories.
  const home = ctx.env.OMEM_HOME_OVERRIDE;
  if (typeof home === 'string' && home.length > 0) return { home };
  return {};
}

function asBool(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
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
  manifest: import('@oh-my-memories/core').MigrationManifest,
  manifestPath: string,
): string {
  const verb = manifest.dryRun ? 'Would migrate' : 'Migrated';
  const lines: string[] = [];
  lines.push(`${verb} ${manifest.from} → ${manifest.to} (${manifest.conflictPolicy})`);
  lines.push(
    `  ${manifest.summary.written} written, ${manifest.summary.simulated} simulated, ${manifest.summary.skipped} skipped, ${manifest.summary.failed} failed`,
  );
  lines.push(`Manifest: ${manifestPath}`);
  if (manifest.warnings.length > 0) {
    lines.push('Warnings:');
    for (const w of manifest.warnings) lines.push(`  - ${w}`);
  }
  return `${lines.join('\n')}\n`;
}
