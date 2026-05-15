import { describe, expect, it } from 'bun:test';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import { ClaudeCodeAdapter } from '../src/index';

const FIXTURES = join(import.meta.dir, 'fixtures');

async function withFixtureRoot(fixtureFile: string, runner: (root: string) => Promise<void>) {
  const root = join(tmpdir(), `omem-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const project = join(root, 'C--Users-fixture');
  await mkdir(project, { recursive: true });
  await copyFile(join(FIXTURES, fixtureFile), join(project, 'session.jsonl'));
  try {
    await runner(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe('ClaudeCodeAdapter.scan() — valid.jsonl', () => {
  it('yields exactly the user/assistant turns (skips control lines)', async () => {
    await withFixtureRoot('valid.jsonl', async (root) => {
      const a = new ClaudeCodeAdapter({ storageRoot: root });
      const records = await collect<MemoryRecord>(a.scan());
      expect(records).toHaveLength(3);
    });
  });

  it('emits records with canonical MemoryRecord shape', async () => {
    await withFixtureRoot('valid.jsonl', async (root) => {
      const a = new ClaudeCodeAdapter({ storageRoot: root });
      const records = await collect<MemoryRecord>(a.scan());
      const first = records[0];
      if (!first) throw new Error('expected at least one record');
      expect(first.id).toBe('u-001');
      expect(first.source).toBe('claude-code');
      expect(first.role).toBe('user');
      expect(first.text).toContain('refactor');
      expect(first.timestamp).toBeInstanceOf(Date);
      expect(first.timestamp.toISOString()).toBe('2026-05-14T09:36:34.126Z');
      expect(first.sessionId).toBe('sess-fixture-valid');
    });
  });

  it('preserves chronological order', async () => {
    await withFixtureRoot('valid.jsonl', async (root) => {
      const a = new ClaudeCodeAdapter({ storageRoot: root });
      const records = await collect<MemoryRecord>(a.scan());
      expect(records.map((r) => r.id)).toEqual(['u-001', 'u-002', 'u-003']);
    });
  });
});

describe('ClaudeCodeAdapter.scan() — empty.jsonl', () => {
  it('yields zero records and does not throw', async () => {
    await withFixtureRoot('empty.jsonl', async (root) => {
      const a = new ClaudeCodeAdapter({ storageRoot: root });
      const records = await collect<MemoryRecord>(a.scan());
      expect(records).toHaveLength(0);
    });
  });
});

describe('ClaudeCodeAdapter.scan() — empty storageRoot', () => {
  it('yields zero records when no project subdirs exist', async () => {
    const root = join(
      tmpdir(),
      `omem-scan-empty-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(root, { recursive: true });
    try {
      const a = new ClaudeCodeAdapter({ storageRoot: root });
      const records = await collect<MemoryRecord>(a.scan());
      expect(records).toHaveLength(0);
      const stillThere = await readdir(root);
      expect(stillThere).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
