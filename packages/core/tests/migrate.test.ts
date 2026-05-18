import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AnyAdapter,
  ConflictPolicy,
  DetectResult,
  IIdeAdapter,
  IWritableAdapter,
  MemoryRecord,
  MigrateContext,
  PreparedWritePlan,
  ScanOptions,
  WriteBatch,
  WriteBatchReceipt,
  WriteProbeResult,
} from '@oh-my-memories/adapter-sdk';
import { MigrationError, runMigration, writeManifest } from '../src/migrate';

class FakeReader implements IIdeAdapter {
  readonly id = 'fake-reader';
  readonly category = 'ide' as const;
  readonly displayName = 'Fake Reader';

  constructor(private readonly records: MemoryRecord[]) {}
  storageRoot(): string {
    return '/fake/reader';
  }
  async detect(): Promise<DetectResult> {
    return { present: true, storageRoot: this.storageRoot() };
  }
  async *scan(_opts?: ScanOptions): AsyncIterable<MemoryRecord> {
    for (const r of this.records) yield r;
  }
}

interface FakeWriterOptions {
  canWrite?: boolean;
  refusePolicy?: ConflictPolicy;
  failOpIds?: ReadonlySet<string>;
}

class FakeWriter implements IIdeAdapter, IWritableAdapter {
  readonly id = 'fake-writer';
  readonly category = 'ide' as const;
  readonly displayName = 'Fake Writer';
  readonly writeCapability = {
    writeSchemaId: 'fake/2026-05',
    emitterVersion: '0.1.0' as `${number}.${number}.${number}`,
    supportedPolicies: ['skip-on-conflict', 'overwrite', 'newest-wins'] as const,
  };
  readonly written: Array<{ operationId: string; record: MemoryRecord }> = [];

  constructor(private readonly opts: FakeWriterOptions = {}) {}
  storageRoot(): string {
    return '/fake/writer';
  }
  async detect(): Promise<DetectResult> {
    return { present: true, storageRoot: this.storageRoot() };
  }
  // biome-ignore lint/correctness/useYield: this fake never produces records; it's only the writer side under test.
  async *scan(_opts?: ScanOptions): AsyncIterable<MemoryRecord> {
    return;
  }
  async probeWrite(_ctx: MigrateContext): Promise<WriteProbeResult> {
    if (this.opts.canWrite === false) return { canWrite: false, reason: 'simulated' };
    return { canWrite: true };
  }
  async planWrites(batch: WriteBatch, _ctx: MigrateContext): Promise<PreparedWritePlan> {
    return { targetPaths: [`/fake/writer/${batch.instructions.length}.jsonl`] };
  }
  async writeBatch(batch: WriteBatch, _ctx: MigrateContext): Promise<WriteBatchReceipt> {
    const items = batch.instructions.map((inst) => {
      if (this.opts.failOpIds?.has(inst.operationId)) {
        return {
          operationId: inst.operationId,
          status: 'failed' as const,
          reason: 'io-error' as const,
        };
      }
      this.written.push({ operationId: inst.operationId, record: inst.record });
      return {
        operationId: inst.operationId,
        status: 'written' as const,
        destPath: '/fake/writer/out.jsonl',
      };
    });
    return { items };
  }
}

class ReadOnlyAdapter implements IIdeAdapter {
  readonly id = 'read-only';
  readonly category = 'ide' as const;
  readonly displayName = 'Read Only';
  storageRoot(): string {
    return '/fake/ro';
  }
  async detect(): Promise<DetectResult> {
    return { present: true };
  }
  // biome-ignore lint/correctness/useYield: read-only stub adapter; intentionally yields nothing.
  async *scan(_opts?: ScanOptions): AsyncIterable<MemoryRecord> {
    return;
  }
}

function makeRecord(partial: Partial<MemoryRecord> & { id: string }): MemoryRecord {
  return {
    source: 'fake-reader',
    timestamp: new Date('2026-05-15T17:00:00.000Z'),
    text: `text-${partial.id}`,
    ...partial,
  };
}

let counter = 0;
function deterministicIdFactory(): string {
  counter += 1;
  return `op-${counter.toString().padStart(8, '0')}`;
}

describe('runMigration', () => {
  beforeEach(() => {
    counter = 0;
  });

  it('refuses when destination has no write support', async () => {
    const promise = runMigration({
      source: new FakeReader([]) as AnyAdapter,
      destination: new ReadOnlyAdapter() as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'dry-run' },
      strategy: 'copy',
      conflictPolicy: 'skip-on-conflict',
    });
    await expect(promise).rejects.toBeInstanceOf(MigrationError);
    await expect(promise).rejects.toMatchObject({ code: 'OMEM-E22-MIGRATE-NO-WRITER' });
  });

  it('refuses unsupported conflict policy', async () => {
    class PolicyPickyWriter extends FakeWriter {
      // The override deliberately narrows supportedPolicies (only skip-on-conflict)
      // to drive runMigration into the OMEM-E24-MIGRATE-POLICY branch. The cast
      // satisfies the structural-subtyping check on the base class field.
      override readonly writeCapability = {
        writeSchemaId: 'fake/2026-05',
        emitterVersion: '0.1.0' as `${number}.${number}.${number}`,
        supportedPolicies: ['skip-on-conflict'] as const,
      } as unknown as FakeWriter['writeCapability'];
    }
    const promise = runMigration({
      source: new FakeReader([]) as AnyAdapter,
      destination: new PolicyPickyWriter() as unknown as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'dry-run' },
      strategy: 'copy',
      conflictPolicy: 'overwrite',
    });
    await expect(promise).rejects.toMatchObject({ code: 'OMEM-E24-MIGRATE-POLICY' });
  });

  it('requires --i-approve-dest-writes when non-interactive and applying', async () => {
    const promise = runMigration({
      source: new FakeReader([]) as AnyAdapter,
      destination: new FakeWriter() as unknown as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'apply', approvedDestWrite: false },
      strategy: 'copy',
      conflictPolicy: 'skip-on-conflict',
      nonInteractive: true,
    });
    await expect(promise).rejects.toMatchObject({ code: 'OMEM-E25-MIGRATE-NO-APPROVE' });
  });

  it('produces a dry-run manifest with simulate-write ops and writes nothing', async () => {
    const writer = new FakeWriter();
    const reader = new FakeReader([
      makeRecord({ id: 'a' }),
      makeRecord({ id: 'b', text: 'second' }),
    ]);
    const { manifest } = await runMigration({
      source: reader as AnyAdapter,
      destination: writer as unknown as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'dry-run' },
      strategy: 'copy',
      conflictPolicy: 'skip-on-conflict',
      idFactory: deterministicIdFactory,
      clock: () => new Date('2026-05-15T18:00:00.000Z'),
    });
    expect(writer.written).toHaveLength(0);
    expect(manifest.dryRun).toBe(true);
    expect(manifest.summary.simulated).toBe(2);
    expect(manifest.summary.written).toBe(0);
    for (const op of manifest.operations) {
      expect(op.op).toBe('simulate-write');
      expect(op.applied).toBe(false);
      expect(op.reason).toBe('dry-run');
    }
  });

  it('apply mode writes records and reports written ops', async () => {
    const writer = new FakeWriter();
    const reader = new FakeReader([
      makeRecord({ id: 'a' }),
      makeRecord({ id: 'b', text: 'second' }),
    ]);
    const { manifest } = await runMigration({
      source: reader as AnyAdapter,
      destination: writer as unknown as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'apply', approvedDestWrite: true },
      strategy: 'copy',
      conflictPolicy: 'skip-on-conflict',
      idFactory: deterministicIdFactory,
      clock: () => new Date('2026-05-15T18:00:00.000Z'),
    });
    expect(writer.written).toHaveLength(2);
    expect(manifest.summary.written).toBe(2);
    expect(manifest.summary.skipped).toBe(0);
    expect(manifest.dryRun).toBe(false);
  });

  it('skips duplicate fingerprints across the source stream', async () => {
    const dup = makeRecord({ id: 'dup', text: 'shared' });
    const reader = new FakeReader([
      dup,
      { ...dup, id: 'dup-renamed' },
      makeRecord({ id: 'unique', text: 'distinct' }),
    ]);
    const writer = new FakeWriter();
    const { manifest } = await runMigration({
      source: reader as AnyAdapter,
      destination: writer as unknown as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'apply', approvedDestWrite: true },
      strategy: 'copy',
      conflictPolicy: 'skip-on-conflict',
      idFactory: deterministicIdFactory,
    });
    expect(writer.written).toHaveLength(2);
    expect(manifest.summary.written).toBe(2);
    expect(manifest.summary.skipped).toBe(1);
    const skipped = manifest.operations.find((o) => o.op === 'skip');
    expect(skipped?.reason).toBe('conflict-fingerprint');
  });

  it('records failure ops when writer reports them', async () => {
    // The orchestrator mints one id up-front for the manifestId, so the first
    // instruction id is op-00000002 (not op-00000001).
    const failOpIds = new Set(['op-00000002']);
    const writer = new FakeWriter({ failOpIds });
    const reader = new FakeReader([
      makeRecord({ id: 'a' }),
      makeRecord({ id: 'b', text: 'second' }),
    ]);
    const { manifest } = await runMigration({
      source: reader as AnyAdapter,
      destination: writer as unknown as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'apply', approvedDestWrite: true },
      strategy: 'copy',
      conflictPolicy: 'skip-on-conflict',
      idFactory: deterministicIdFactory,
    });
    expect(manifest.summary.failed).toBe(1);
    expect(manifest.summary.written).toBe(1);
  });

  it('refuses --apply when probe declines', async () => {
    const writer = new FakeWriter({ canWrite: false });
    const reader = new FakeReader([makeRecord({ id: 'a' })]);
    const promise = runMigration({
      source: reader as AnyAdapter,
      destination: writer as unknown as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'apply', approvedDestWrite: true },
      strategy: 'copy',
      conflictPolicy: 'skip-on-conflict',
    });
    await expect(promise).rejects.toMatchObject({ code: 'OMEM-E23-MIGRATE-FORMAT' });
  });

  it('still produces a dry-run manifest when probe declines (no writes attempted)', async () => {
    const writer = new FakeWriter({ canWrite: false });
    const reader = new FakeReader([makeRecord({ id: 'a' })]);
    const { manifest } = await runMigration({
      source: reader as AnyAdapter,
      destination: writer as unknown as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'dry-run' },
      strategy: 'copy',
      conflictPolicy: 'skip-on-conflict',
      idFactory: deterministicIdFactory,
    });
    expect(manifest.probe.canWrite).toBe(false);
    expect(manifest.dryRun).toBe(true);
    expect(manifest.summary.simulated).toBe(1);
  });

  it('respects sessionId filter', async () => {
    const reader = new FakeReader([
      makeRecord({ id: 'a', sessionId: 'keep' }),
      makeRecord({ id: 'b', text: 'second', sessionId: 'drop' }),
    ]);
    const writer = new FakeWriter();
    const { manifest } = await runMigration({
      source: reader as AnyAdapter,
      destination: writer as unknown as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'apply', approvedDestWrite: true },
      strategy: 'copy',
      conflictPolicy: 'skip-on-conflict',
      filters: { sessionId: 'keep' },
      idFactory: deterministicIdFactory,
    });
    expect(manifest.summary.written).toBe(1);
    expect(writer.written[0]?.record.sessionId).toBe('keep');
  });
});

describe('writeManifest', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'omem-manifest-'));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('writes a JSON manifest under <home>/migrations/<ts>_<id>.json', async () => {
    const writer = new FakeWriter();
    const reader = new FakeReader([makeRecord({ id: 'a' })]);
    const { manifest } = await runMigration({
      source: reader as AnyAdapter,
      destination: writer as unknown as AnyAdapter,
      sourceSchema: 'fake/2026-05',
      destSchema: 'fake/2026-05',
      mode: { kind: 'dry-run' },
      strategy: 'copy',
      conflictPolicy: 'skip-on-conflict',
      idFactory: deterministicIdFactory,
      clock: () => new Date('2026-05-15T18:00:00.000Z'),
    });
    const path = await writeManifest(manifest, tmp);
    expect(path).toContain(join(tmp, 'migrations'));
    const parsed = JSON.parse(await readFile(path, 'utf8')) as {
      manifestVersion: number;
      from: string;
    };
    expect(parsed.manifestVersion).toBe(1);
    expect(parsed.from).toBe('fake-reader');
  });
});
