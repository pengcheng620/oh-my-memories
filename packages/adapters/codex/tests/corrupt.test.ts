import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import { CodexAdapter } from '../src';

const FIX = join(import.meta.dir, 'fixtures');

describe('CodexAdapter — corrupt-line tolerance (spec §7.2)', () => {
  let root: string;
  let adapter: CodexAdapter;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'omem-codex-corrupt-'));
    const dir = join(root, '2026', '04', '02');
    mkdirSync(dir, { recursive: true });
    copyFileSync(
      join(FIX, 'corrupt-line.jsonl'),
      join(dir, 'rollout-2026-04-02T11-00-00-019d2900-c0c0-7000-aaaa-000000000002.jsonl'),
    );
    adapter = new CodexAdapter({ storageRoot: root });
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
