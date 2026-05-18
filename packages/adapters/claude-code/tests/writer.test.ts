import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord, MigrateContext, WriteInstruction } from '@oh-my-memories/adapter-sdk';
import { CC_IMPORT_PROJECT_DIR, ClaudeCodeAdapter } from '../src';

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
let uuidCounter = 0;
const uuidFactory = (): string => {
  uuidCounter += 1;
  return `c0ffee00-0000-4000-8000-${uuidCounter.toString().padStart(12, '0')}`;
};

describe('ClaudeCodeAdapter writer surface', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omem-cc-writer-'));
    uuidCounter = 0;
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('declares writeCapability with claude-code schema id and refuses overwrite', () => {
    const a = new ClaudeCodeAdapter({ storageRoot: tmp });
    expect(a.writeCapability.writeSchemaId).toBe('claude-code/2026-05');
    expect(a.writeCapability.supportedPolicies).toContain('skip-on-conflict');
    expect(a.writeCapability.supportedPolicies).not.toContain('overwrite');
  });

  it('dry-run writeBatch yields skipped/dry-run items', async () => {
    const a = new ClaudeCodeAdapter({
      storageRoot: tmp,
      clock: fixedClock,
      importId: 'abcd',
      uuidFactory,
    });
    const inst = makeInstruction(makeRecord('a', 'hi'), 'op-1');
    const receipt = await a.writeBatch({ instructions: [inst] }, dryRunCtx);
    expect(receipt.items[0]?.status).toBe('skipped');
  });

  it('apply mode writes records that the reader parses back round-trip', async () => {
    const a = new ClaudeCodeAdapter({
      storageRoot: tmp,
      clock: fixedClock,
      importId: 'abcd',
      uuidFactory,
    });
    const insts = [
      makeInstruction(makeRecord('a', 'user input', 'user'), 'op-1'),
      makeInstruction(makeRecord('b', 'assistant output', 'assistant'), 'op-2'),
    ];
    await a.writeBatch({ instructions: insts }, applyCtx);
    const seen: MemoryRecord[] = [];
    for await (const r of a.scan()) seen.push(r);
    expect(seen.map((r) => r.text)).toEqual(['user input', 'assistant output']);
    expect(seen.map((r) => r.role)).toEqual(['user', 'assistant']);
  });

  it('writes into the dedicated import project dir, never the original projects', async () => {
    const a = new ClaudeCodeAdapter({
      storageRoot: tmp,
      clock: fixedClock,
      importId: 'abcd',
      uuidFactory,
    });
    const inst = makeInstruction(makeRecord('a', 'hi'), 'op-1');
    const receipt = await a.writeBatch({ instructions: [inst] }, applyCtx);
    expect(receipt.items[0]?.destPath).toContain(CC_IMPORT_PROJECT_DIR);
    expect(receipt.items[0]?.destPath).toContain('omem-import-20260515-abcd.jsonl');
  });
});
