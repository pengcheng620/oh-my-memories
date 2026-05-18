import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type {
  AnyAdapter,
  ConflictPolicy,
  IWritableAdapter,
  MemoryRecord,
  MigrateContext,
  MigrateFilters,
  MigrateMode,
  MigrateStrategy,
  WriteBatchReceipt,
  WriteBatchResultItem,
  WriteInstruction,
  WriteProbeResult,
} from '@oh-my-memories/adapter-sdk';
import { isWritableAdapter } from '@oh-my-memories/adapter-sdk';
import { createFingerprint, stableKey } from './fingerprint';

// Migration orchestrator. CLI calls `runMigration` with two adapters and
// a `MigrateContext`; we drive `scan(src) → fingerprint → conflict resolve →
// writeBatch(dst)` in bounded batches and produce a persistable manifest.
//
// See `specs/iwritable-adapter-mini-spec.md` §11 for the algorithm.

/** Default batch size for writes. Spec §11. */
export const DEFAULT_BATCH_SIZE = 500;

export interface MigrationManifest {
  readonly manifestVersion: 1;
  readonly ts: string;
  readonly manifestId: string;
  readonly from: string;
  readonly to: string;
  readonly dryRun: boolean;
  readonly strategy: MigrateStrategy;
  readonly conflictPolicy: ConflictPolicy;
  readonly filters: SerializedFilters;
  readonly sourceSchema: string;
  readonly destSchema: string;
  readonly destEmitterVersion: string;
  readonly environment: ManifestEnvironment;
  readonly probe: WriteProbeResult;
  readonly backups: readonly BackupEntry[];
  readonly operations: readonly ManifestOperation[];
  readonly summary: ManifestSummary;
  readonly warnings: readonly string[];
}

export interface SerializedFilters {
  readonly since?: string;
  readonly projectPath?: string;
  readonly sessionId?: string;
}

export interface ManifestEnvironment {
  readonly platform: NodeJS.Platform;
  readonly node: string;
  readonly nonInteractive: boolean;
}

export interface BackupEntry {
  readonly from: string;
  readonly to: string;
}

export interface ManifestOperation {
  readonly operationId: string;
  readonly op: 'write' | 'simulate-write' | 'skip' | 'fail';
  readonly stableKey: string;
  readonly fingerprint: string;
  readonly destPath?: string;
  readonly applied: boolean;
  readonly reason: string | null;
}

export interface ManifestSummary {
  readonly written: number;
  readonly simulated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly corruptSources: number;
}

export interface RunMigrationInput {
  readonly source: AnyAdapter;
  readonly destination: AnyAdapter;
  readonly sourceSchema: string;
  readonly destSchema: string;
  readonly mode: MigrateMode;
  readonly strategy: MigrateStrategy;
  readonly conflictPolicy: ConflictPolicy;
  readonly filters?: MigrateFilters;
  readonly batchSize?: number;
  readonly nonInteractive?: boolean;
  readonly signal?: AbortSignal;
  /** Override `randomUUID()` for deterministic tests. */
  readonly idFactory?: () => string;
  /** Override `new Date()` for deterministic tests. */
  readonly clock?: () => Date;
}

export interface RunMigrationResult {
  readonly manifest: MigrationManifest;
}

export class MigrationError extends Error {
  constructor(
    public readonly code:
      | 'OMEM-E22-MIGRATE-NO-WRITER'
      | 'OMEM-E23-MIGRATE-FORMAT'
      | 'OMEM-E24-MIGRATE-POLICY'
      | 'OMEM-E25-MIGRATE-NO-APPROVE',
    message: string,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

export async function runMigration(input: RunMigrationInput): Promise<RunMigrationResult> {
  const dst = input.destination;
  if (!isWritableAdapter(dst)) {
    throw new MigrationError(
      'OMEM-E22-MIGRATE-NO-WRITER',
      `Destination adapter '${dst.id}' has no write support.`,
    );
  }
  const writer = dst as AnyAdapter & IWritableAdapter;

  if (!writer.writeCapability.supportedPolicies.includes(input.conflictPolicy)) {
    throw new MigrationError(
      'OMEM-E24-MIGRATE-POLICY',
      `Destination '${dst.id}' does not support --on-conflict=${input.conflictPolicy}.`,
    );
  }

  if (
    input.mode.kind === 'apply' &&
    (input.nonInteractive ?? false) &&
    !input.mode.approvedDestWrite
  ) {
    throw new MigrationError(
      'OMEM-E25-MIGRATE-NO-APPROVE',
      '--apply requires --i-approve-dest-writes (or OMEM_I_APPROVE_DEST_WRITES=1) when running non-interactively.',
    );
  }

  const ctx: MigrateContext = {
    filters: input.filters ?? {},
    strategy: input.strategy,
    conflictPolicy: input.conflictPolicy,
    mode: input.mode,
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
  };

  const idFactory = input.idFactory ?? defaultIdFactory;
  const clock = input.clock ?? (() => new Date());
  const startedAt = clock();
  const manifestId = idFactory().slice(0, 8);

  const probe = await writer.probeWrite(ctx);
  if (input.mode.kind === 'apply' && !probe.canWrite) {
    throw new MigrationError(
      'OMEM-E23-MIGRATE-FORMAT',
      probe.reason ?? 'Destination probe refused write access.',
    );
  }

  if (writer.validateWritableFormat) {
    const vf = await writer.validateWritableFormat(ctx);
    if (input.mode.kind === 'apply' && !vf.ok) {
      throw new MigrationError(
        'OMEM-E23-MIGRATE-FORMAT',
        vf.reason ?? 'Destination format validation failed.',
      );
    }
  }

  const operations: ManifestOperation[] = [];
  const warnings: string[] = [];
  const seenFingerprints = new Set<string>();
  const batch: WriteInstruction[] = [];
  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    if (input.mode.kind === 'dry-run') {
      for (const inst of batch) {
        operations.push({
          operationId: inst.operationId,
          op: 'simulate-write',
          stableKey: stableKey(inst.record),
          fingerprint: inst.sourceFingerprint,
          applied: false,
          reason: 'dry-run',
        });
      }
    } else {
      const receipt = await writer.writeBatch({ instructions: batch }, ctx);
      mergeReceipt(receipt, batch, operations);
    }
    batch.length = 0;
  };

  for await (const record of input.source.scan(filterToScanOpts(ctx.filters))) {
    if (ctx.signal?.aborted) break;
    if (!matchesFilters(record, ctx.filters)) continue;

    const fp = createFingerprint(record);
    if (seenFingerprints.has(fp)) {
      operations.push({
        operationId: idFactory(),
        op: 'skip',
        stableKey: stableKey(record),
        fingerprint: fp,
        applied: false,
        reason: 'conflict-fingerprint',
      });
      continue;
    }
    seenFingerprints.add(fp);

    batch.push({
      operationId: idFactory(),
      record,
      sourceAdapterId: input.source.id,
      sourceFingerprint: fp,
    });
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  const summary = summarize(operations);
  const finishedAt = clock();

  const manifest: MigrationManifest = {
    manifestVersion: 1,
    ts: finishedAt.toISOString(),
    manifestId,
    from: input.source.id,
    to: dst.id,
    dryRun: input.mode.kind === 'dry-run',
    strategy: input.strategy,
    conflictPolicy: input.conflictPolicy,
    filters: serializeFilters(ctx.filters),
    sourceSchema: input.sourceSchema,
    destSchema: input.destSchema,
    destEmitterVersion: writer.writeCapability.emitterVersion,
    environment: {
      platform: process.platform,
      node: process.versions.node,
      nonInteractive: input.nonInteractive ?? false,
    },
    probe,
    backups: [],
    operations,
    summary,
    warnings,
  };

  if (startedAt.getTime() > finishedAt.getTime()) {
    warnings.push('Clock anomaly: startedAt > finishedAt — check system clock.');
  }

  return { manifest };
}

/**
 * Persist a manifest under `${homeOrOmemHome}/migrations/<UTC-ts>_<id>.json`.
 * Returns the absolute path written.
 */
export async function writeManifest(
  manifest: MigrationManifest,
  omemHome: string,
): Promise<string> {
  const dir = resolve(omemHome, 'migrations');
  await mkdir(dir, { recursive: true });
  const tsCompact = manifest.ts.replace(/[:.]/g, '-');
  const path = join(dir, `${tsCompact}_${manifest.manifestId}.json`);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return path;
}

/** Used by writers that need to back up an existing file before mutating it. */
export async function backupFile(
  srcPath: string,
  omemHome: string,
  manifestId: string,
): Promise<BackupEntry> {
  const dest = resolve(omemHome, 'migrations', 'backup', manifestId, encodePathForBackup(srcPath));
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(srcPath, dest);
  return { from: srcPath, to: dest };
}

function encodePathForBackup(p: string): string {
  return p.replace(/[\\/:]/g, '_');
}

function filterToScanOpts(filters: MigrateFilters): { since?: Date } {
  return filters.since !== undefined ? { since: filters.since } : {};
}

function matchesFilters(record: MemoryRecord, filters: MigrateFilters): boolean {
  if (filters.sessionId !== undefined && record.sessionId !== filters.sessionId) return false;
  if (filters.since !== undefined && record.timestamp.getTime() < filters.since.getTime())
    return false;
  return true;
}

function serializeFilters(filters: MigrateFilters): SerializedFilters {
  const out: { since?: string; projectPath?: string; sessionId?: string } = {};
  if (filters.since !== undefined) out.since = filters.since.toISOString();
  if (filters.projectPath !== undefined) out.projectPath = filters.projectPath;
  if (filters.sessionId !== undefined) out.sessionId = filters.sessionId;
  return out;
}

function mergeReceipt(
  receipt: WriteBatchReceipt,
  batch: readonly WriteInstruction[],
  operations: ManifestOperation[],
): void {
  const byOpId = new Map<string, WriteBatchResultItem>();
  for (const item of receipt.items) byOpId.set(item.operationId, item);

  for (const inst of batch) {
    const item = byOpId.get(inst.operationId);
    const op: ManifestOperation['op'] =
      item?.status === 'written' ? 'write' : item?.status === 'failed' ? 'fail' : 'skip';
    operations.push({
      operationId: inst.operationId,
      op,
      stableKey: stableKey(inst.record),
      fingerprint: inst.sourceFingerprint,
      ...(item?.destPath !== undefined ? { destPath: item.destPath } : {}),
      applied: item?.status === 'written',
      reason: item?.reason ?? null,
    });
  }
}

function summarize(ops: readonly ManifestOperation[]): ManifestSummary {
  let written = 0;
  let simulated = 0;
  let skipped = 0;
  let failed = 0;
  for (const o of ops) {
    if (o.op === 'write') written += 1;
    else if (o.op === 'simulate-write') simulated += 1;
    else if (o.op === 'skip') skipped += 1;
    else if (o.op === 'fail') failed += 1;
  }
  return { written, simulated, skipped, failed, corruptSources: 0 };
}

function defaultIdFactory(): string {
  // We don't pull node:crypto.randomUUID directly so that environments without
  // it (older Node) still get a unique-enough id. The `crypto` module is
  // already loaded for fingerprinting, so adding a small import isn't free
  // money — keep it lightweight here.
  const crypto = require('node:crypto') as typeof import('node:crypto');
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}
