import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord, MigrateContext, WriteInstruction } from '@oh-my-memories/adapter-sdk';
import { CursorAdapter } from '../src';

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

describe('CursorAdapter writer surface', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omem-cursor-writer-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('declares writeCapability with cursor schema id and skip-on-conflict policy', () => {
    const a = new CursorAdapter({ storageRoot: tmp });
    expect(a.writeCapability.writeSchemaId).toBe('cursor/2026-05');
    expect(a.writeCapability.supportedPolicies).toContain('skip-on-conflict');
  });

  it('probeWrite returns canWrite:true when storage root is creatable', async () => {
    const a = new CursorAdapter({ storageRoot: join(tmp, 'fresh') });
    const r = await a.probeWrite(applyCtx);
    expect(r.canWrite).toBe(true);
  });

  it('dry-run writeBatch yields skipped/dry-run items and writes nothing', async () => {
    const a = new CursorAdapter({ storageRoot: tmp, importSessionId: 'session-1' });
    const inst = makeInstruction(makeRecord('a', 'hello'), 'op-1');
    const receipt = await a.writeBatch({ instructions: [inst] }, dryRunCtx);
    expect(receipt.items[0]?.status).toBe('skipped');
    expect(receipt.items[0]?.reason).toBe('dry-run');
    const present = await a.detect();
    expect(present.present).toBe(true);
  });

  it('apply mode writes a JSONL line that the reader can parse back', async () => {
    const a = new CursorAdapter({ storageRoot: tmp, importSessionId: 'session-1' });
    const inst = makeInstruction(makeRecord('a', 'hello world'), 'op-1');
    const receipt = await a.writeBatch({ instructions: [inst] }, applyCtx);
    expect(receipt.items[0]?.status).toBe('written');
    expect(receipt.items[0]?.destPath).toContain('session-1.jsonl');

    const seen: MemoryRecord[] = [];
    for await (const r of a.scan()) seen.push(r);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.text).toBe('hello world');
    expect(seen[0]?.role).toBe('user');
  });

  it('apply mode appends multiple records into the same session file', async () => {
    const a = new CursorAdapter({ storageRoot: tmp, importSessionId: 'multi' });
    const insts = [
      makeInstruction(makeRecord('a', 'first', 'user'), 'op-1'),
      makeInstruction(makeRecord('b', 'second', 'assistant'), 'op-2'),
    ];
    const receipt = await a.writeBatch({ instructions: insts }, applyCtx);
    expect(receipt.items.every((i) => i.status === 'written')).toBe(true);

    const seen: MemoryRecord[] = [];
    for await (const r of a.scan()) seen.push(r);
    expect(seen.map((r) => r.text)).toEqual(['first', 'second']);
    expect(seen.map((r) => r.role)).toEqual(['user', 'assistant']);
  });
});
