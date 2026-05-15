import { afterEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import { SerenaAdapter } from '../src';

const FIX = join(import.meta.dir, 'fixtures');

// Layout: <projectRoot>/.serena/memories/<file>.md
function withFixtureLayout(...fixtures: string[]): {
  projectRoot: string;
  cleanup: () => void;
} {
  const projectRoot = mkdtempSync(join(tmpdir(), 'omem-serena-parser-'));
  const memoriesDir = join(projectRoot, '.serena', 'memories');
  mkdirSync(memoriesDir, { recursive: true });
  for (const fix of fixtures) {
    copyFileSync(join(FIX, fix), join(memoriesDir, fix));
  }
  return { projectRoot, cleanup: () => rmSync(projectRoot, { recursive: true, force: true }) };
}

async function collect(adapter: SerenaAdapter): Promise<MemoryRecord[]> {
  const out: MemoryRecord[] = [];
  for await (const r of adapter.scan()) out.push(r);
  return out;
}

describe('SerenaAdapter.scan() — valid-with-frontmatter.md', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('yields exactly one record per .md file (no per-line streaming)', async () => {
    const { projectRoot, cleanup: c } = withFixtureLayout('valid-with-frontmatter.md');
    cleanup = c;
    const a = new SerenaAdapter({ projectRoot });
    const records = await collect(a);
    expect(records).toHaveLength(1);
  });

  it('emits a record with canonical MemoryRecord shape', async () => {
    const { projectRoot, cleanup: c } = withFixtureLayout('valid-with-frontmatter.md');
    cleanup = c;
    const a = new SerenaAdapter({ projectRoot });
    const records = await collect(a);
    const first = records[0];
    if (!first) throw new Error('expected at least one record');
    expect(typeof first.id).toBe('string');
    expect(first.id.length).toBeGreaterThan(0);
    expect(first.source).toBe('serena');
    expect(first.timestamp).toBeInstanceOf(Date);
    // Serena memories are user-authored notes, not chat turns. role is undefined.
    expect(first.role).toBeUndefined();
    // Serena memories are not session-bound.
    expect(first.sessionId).toBeUndefined();
    // text holds the body without the YAML frontmatter envelope.
    expect(typeof first.text).toBe('string');
    expect(first.text.length).toBeGreaterThan(0);
    expect(first.text.includes('# FMPanel API Error Handling Pattern')).toBe(true);
    expect(first.text).not.toContain('---');
    expect(first.text).not.toContain('title:');
  });

  it('exposes parsed frontmatter on metadata', async () => {
    const { projectRoot, cleanup: c } = withFixtureLayout('valid-with-frontmatter.md');
    cleanup = c;
    const a = new SerenaAdapter({ projectRoot });
    const records = await collect(a);
    const first = records[0];
    if (!first) throw new Error('expected at least one record');
    expect(first.metadata).toBeDefined();
    const md = first.metadata as Record<string, unknown>;
    expect(md.title).toBe('FMPanel API Error Handling Pattern');
    expect(Array.isArray(md.tags)).toBe(true);
    expect(md.tags).toEqual(['fmpanel', 'api', 'errors']);
  });

  it('uses filename (without .md) as the record id', async () => {
    const { projectRoot, cleanup: c } = withFixtureLayout('valid-with-frontmatter.md');
    cleanup = c;
    const a = new SerenaAdapter({ projectRoot });
    const records = await collect(a);
    expect(records[0]?.id).toBe('valid-with-frontmatter');
  });
});

describe('SerenaAdapter.scan() — valid-no-frontmatter.md', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('treats files with no frontmatter as plain markdown body', async () => {
    const { projectRoot, cleanup: c } = withFixtureLayout('valid-no-frontmatter.md');
    cleanup = c;
    const a = new SerenaAdapter({ projectRoot });
    const records = await collect(a);
    const first = records[0];
    if (!first) throw new Error('expected at least one record');
    // The whole file is the text. No metadata derived from frontmatter.
    expect(first.text.startsWith('# Quick-Test')).toBe(true);
    // Title must still be derivable from the first heading (per real Serena layout).
    const md = (first.metadata ?? {}) as Record<string, unknown>;
    expect(md.title).toBe('Quick-Test / Diagnostic Logging Conventions');
  });

  it('does NOT increment lastScanStats.corruptLines when frontmatter is simply absent', async () => {
    const { projectRoot, cleanup: c } = withFixtureLayout('valid-no-frontmatter.md');
    cleanup = c;
    const a = new SerenaAdapter({ projectRoot });
    for await (const _ of a.scan()) {
      // drain
    }
    expect(a.lastScanStats?.corruptLines).toBe(0);
  });
});

describe('SerenaAdapter.scan() — empty.md', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('yields zero records and does not throw', async () => {
    const { projectRoot, cleanup: c } = withFixtureLayout('empty.md');
    cleanup = c;
    const a = new SerenaAdapter({ projectRoot });
    const records = await collect(a);
    expect(records).toHaveLength(0);
  });
});

describe('SerenaAdapter.scan() — empty .serena/memories directory', () => {
  it('yields zero records when the memories dir exists but is empty', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'omem-serena-empty-'));
    try {
      mkdirSync(join(projectRoot, '.serena', 'memories'), { recursive: true });
      const a = new SerenaAdapter({ projectRoot });
      const records: MemoryRecord[] = [];
      for await (const r of a.scan()) records.push(r);
      expect(records).toHaveLength(0);
      expect(a.lastScanStats?.recordCount).toBe(0);
      expect(a.lastScanStats?.filesScanned).toBe(0);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('yields zero records when .serena does not exist at all', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'omem-serena-missing-'));
    try {
      const a = new SerenaAdapter({ projectRoot });
      const records: MemoryRecord[] = [];
      for await (const r of a.scan()) records.push(r);
      expect(records).toHaveLength(0);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('SerenaAdapter.scan() — multiple files', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('emits one record per .md file across the memories dir', async () => {
    const { projectRoot, cleanup: c } = withFixtureLayout(
      'valid-with-frontmatter.md',
      'valid-no-frontmatter.md',
    );
    cleanup = c;
    const a = new SerenaAdapter({ projectRoot });
    const records = await collect(a);
    expect(records).toHaveLength(2);
    const ids = records.map((r) => r.id).sort();
    expect(ids).toEqual(['valid-no-frontmatter', 'valid-with-frontmatter']);
  });
});
