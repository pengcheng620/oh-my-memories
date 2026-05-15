import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import { CursorAdapter } from '../src';

const FIX = join(import.meta.dir, 'fixtures');

describe('CursorAdapter — corrupt-line tolerance (spec §7.2)', () => {
  let root: string;
  let adapter: CursorAdapter;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'omem-cursor-corrupt-'));
    const dir = join(root, 'project-x', 'agent-transcripts', 'sess-corrupt');
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(FIX, 'corrupt-line.jsonl'), join(dir, 'sess-corrupt.jsonl'));
    adapter = new CursorAdapter({ storageRoot: root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('does NOT throw when iterator hits a malformed JSON line', async () => {
    const records: MemoryRecord[] = [];
    let threw = false;
    try {
      for await (const r of adapter.scan()) records.push(r);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it('still yields the valid records around the corrupt line', async () => {
    const records: MemoryRecord[] = [];
    for await (const r of adapter.scan()) records.push(r);
    expect(records.length).toBeGreaterThanOrEqual(2);
    const texts = records.map((r) => r.text);
    expect(texts.some((t) => t.includes('first valid turn'))).toBe(true);
    expect(texts.some((t) => t.includes('third valid turn'))).toBe(true);
  });

  it('exposes corrupt-line count via lastScanStats', async () => {
    for await (const _ of adapter.scan()) {
      // drain
    }
    expect(adapter.lastScanStats).not.toBeNull();
    expect(adapter.lastScanStats?.corruptLines).toBe(1);
    expect(adapter.lastScanStats?.recordCount).toBeGreaterThanOrEqual(2);
  });
});
