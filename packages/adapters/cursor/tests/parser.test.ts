import { afterEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import { CursorAdapter } from '../src';

const FIX = join(import.meta.dir, 'fixtures');

// Cursor stores transcripts at:
//   <storageRoot>/<project-id>/agent-transcripts/<session-uuid>/<session-uuid>.jsonl
// We replicate that nesting so the adapter's recursive scan + sessionId
// derivation are exercised end-to-end.
function withFixtureLayout(
  srcFixture: string,
  sessionId = 'sess-valid',
): {
  root: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), 'omem-cursor-parser-'));
  const dir = join(root, 'project-abc', 'agent-transcripts', sessionId);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(FIX, srcFixture), join(dir, `${sessionId}.jsonl`));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

async function collect(adapter: CursorAdapter): Promise<MemoryRecord[]> {
  const out: MemoryRecord[] = [];
  for await (const r of adapter.scan()) out.push(r);
  return out;
}

describe('CursorAdapter.scan() — valid.jsonl', () => {
  let cleanup = () => {};

  afterEach(() => cleanup());

  it('yields exactly the 4 user/assistant turns', async () => {
    const { root, cleanup: c } = withFixtureLayout('valid.jsonl');
    cleanup = c;
    const a = new CursorAdapter({ storageRoot: root });
    const records = await collect(a);
    expect(records).toHaveLength(4);
  });

  it('emits records with canonical MemoryRecord shape', async () => {
    const { root, cleanup: c } = withFixtureLayout('valid.jsonl', 'sess-shape');
    cleanup = c;
    const a = new CursorAdapter({ storageRoot: root });
    const records = await collect(a);
    const first = records[0];
    if (!first) throw new Error('expected at least one record');
    expect(typeof first.id).toBe('string');
    expect(first.id.length).toBeGreaterThan(0);
    expect(first.source).toBe('cursor');
    expect(first.timestamp).toBeInstanceOf(Date);
    if (typeof first.role !== 'string') {
      throw new Error('expected first.role to be set on cursor records');
    }
    expect(['user', 'assistant', 'system', 'tool']).toContain(first.role);
    expect(typeof first.text).toBe('string');
    expect(first.text.length).toBeGreaterThan(0);
    // sessionId is required for cursor (derived from filename / dirname)
    if (typeof first.sessionId !== 'string') {
      throw new Error('expected sessionId to be a string for cursor records');
    }
    expect(first.sessionId).toBe('sess-shape');
  });

  it('extracts text from content arrays, joining only text blocks (skipping tool_use)', async () => {
    const { root, cleanup: c } = withFixtureLayout('valid.jsonl');
    cleanup = c;
    const a = new CursorAdapter({ storageRoot: root });
    const records = await collect(a);
    // Last assistant turn has [text, tool_use, text] — the parser should
    // join the two text blocks and ignore the tool_use entirely.
    const last = records[records.length - 1];
    if (!last) throw new Error('expected last record');
    expect(last.role).toBe('assistant');
    expect(last.text).toContain("I'll edit the project file now.");
    expect(last.text).toContain('Done.');
    expect(last.text).not.toContain('tool_use');
    expect(last.text).not.toContain('vcxproj');
  });

  it('preserves chronological (file) order', async () => {
    const { root, cleanup: c } = withFixtureLayout('valid.jsonl');
    cleanup = c;
    const a = new CursorAdapter({ storageRoot: root });
    const records = await collect(a);
    expect(records[0]?.role).toBe('user');
    expect(records[1]?.role).toBe('assistant');
    expect(records[2]?.role).toBe('user');
    expect(records[3]?.role).toBe('assistant');
  });
});

describe('CursorAdapter.scan() — empty.jsonl', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('yields zero records and does not throw', async () => {
    const { root, cleanup: c } = withFixtureLayout('empty.jsonl');
    cleanup = c;
    const a = new CursorAdapter({ storageRoot: root });
    const records = await collect(a);
    expect(records).toHaveLength(0);
  });
});

describe('CursorAdapter.scan() — empty storageRoot', () => {
  it('yields zero records when no project subdirs exist', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'omem-cursor-empty-'));
    try {
      const a = new CursorAdapter({ storageRoot: tmp });
      const records = await collect(a);
      expect(records).toHaveLength(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
