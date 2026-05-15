import { describe, expect, it } from 'bun:test';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import { ClaudeCodeAdapter } from '../src/index';

const FIXTURES = join(import.meta.dir, 'fixtures');

async function setupFixture(fixtureFile: string): Promise<string> {
  const root = join(tmpdir(), `omem-corrupt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const project = join(root, 'C--Users-fixture');
  await mkdir(project, { recursive: true });
  await copyFile(join(FIXTURES, fixtureFile), join(project, 'session.jsonl'));
  return root;
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe('ClaudeCodeAdapter — corrupt-line tolerance (spec §7.2)', () => {
  it('does NOT throw when iterator hits a malformed JSON line', async () => {
    const root = await setupFixture('corrupt-line.jsonl');
    try {
      const a = new ClaudeCodeAdapter({ storageRoot: root });
      let threw = false;
      try {
        await collect<MemoryRecord>(a.scan());
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('still yields the valid records around the corrupt line', async () => {
    const root = await setupFixture('corrupt-line.jsonl');
    try {
      const a = new ClaudeCodeAdapter({ storageRoot: root });
      const records = await collect<MemoryRecord>(a.scan());
      expect(records.map((r) => r.id)).toEqual(['c-001', 'c-002', 'c-003']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('exposes corrupt-line count via lastScanStats', async () => {
    const root = await setupFixture('corrupt-line.jsonl');
    try {
      const a = new ClaudeCodeAdapter({ storageRoot: root });
      await collect<MemoryRecord>(a.scan());
      const stats = a.lastScanStats;
      expect(stats).not.toBeNull();
      expect(stats?.corruptLines).toBe(1);
      expect(stats?.recordCount).toBe(3);
      expect(stats?.filesScanned).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
