import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord, MigrateContext, WriteInstruction } from '@oh-my-memories/adapter-sdk';
import { CodexAdapter } from '../src';

function makeRecord(id: string, text: string, role: MemoryRecord['role'] = 'user'): MemoryRecord {
  return {
    id,
    source: 'fake',
    timestamp: new Date('2026-05-15T17:00:00.000Z'),
    role,
    text,
  };
}

function makeInstruction(record: MemoryRecord, opId: string): WriteInstruction {
  return {
    operationId: opId,
    record,
    sourceAdapterId: 'fake',
    sourceFingerprint: 'deadbeef',
  };
}

const dryRunCtx: MigrateContext = {
  filters: {},
  strategy: 'copy',
  conflictPolicy: 'skip-on-conflict',
  mode: { kind: 'dry-run' },
};
const applyCtx: MigrateContext = {
  filters: {},
  strategy: 'copy',
  conflictPolicy: 'skip-on-conflict',
  mode: { kind: 'apply', approvedDestWrite: true },
};

const fixedClock = (): Date => new Date('2026-05-15T12:00:00.000Z');

describe('CodexAdapter writer surface', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omem-codex-writer-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('declares writeCapability with codex schema id', () => {
    const a = new CodexAdapter({ storageRoot: tmp, clock: fixedClock, importId: 'abcd' });
    expect(a.writeCapability.writeSchemaId).toBe('codex/2026-04');
  });

  it('dry-run writeBatch yields skipped/dry-run items and creates no file', async () => {
    const a = new CodexAdapter({ storageRoot: tmp, clock: fixedClock, importId: 'abcd' });
    const inst = makeInstruction(makeRecord('a', 'hi'), 'op-1');
    const receipt = await a.writeBatch({ instructions: [inst] }, dryRunCtx);
    expect(receipt.items[0]?.status).toBe('skipped');
  });

  it('apply mode writes records that the reader parses back round-trip', async () => {
    const a = new CodexAdapter({ storageRoot: tmp, clock: fixedClock, importId: 'abcd' });
    const insts = [
      makeInstruction(makeRecord('a', 'user says hi', 'user'), 'op-1'),
      makeInstruction(makeRecord('b', 'assistant replies', 'assistant'), 'op-2'),
    ];
    await a.writeBatch({ instructions: insts }, applyCtx);
    const seen: MemoryRecord[] = [];
    for await (const r of a.scan()) seen.push(r);
    expect(seen).toHaveLength(2);
    expect(seen.map((r) => r.text)).toEqual(['user says hi', 'assistant replies']);
    expect(seen.map((r) => r.role)).toEqual(['user', 'assistant']);
  });

  it('uses date-partitioned dir + omem-import filename', async () => {
    const a = new CodexAdapter({ storageRoot: tmp, clock: fixedClock, importId: 'abcd' });
    const inst = makeInstruction(makeRecord('a', 'hi'), 'op-1');
    const receipt = await a.writeBatch({ instructions: [inst] }, applyCtx);
    const dest = receipt.items[0]?.destPath ?? '';
    expect(dest).toContain(join('2026', '05', '15'));
    expect(dest).toContain('omem-import-abcd.jsonl');
  });
});
