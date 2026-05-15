import { afterEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import { CodexAdapter } from '../src';

const FIX = join(import.meta.dir, 'fixtures');

// Codex CLI stores rollouts at:
//   <storageRoot>/<YYYY>/<MM>/<DD>/rollout-<iso-ts>-<thread-uuid>.jsonl
// We replicate the date-partitioned nesting so the recursive walker is
// exercised end-to-end; sessionId is derived from the filename basename.
function withFixtureLayout(
  srcFixture: string,
  filename = 'rollout-2026-04-02T10-00-00-019d2900-0001-7000-aaaa-000000000001.jsonl',
): {
  root: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), 'omem-codex-parser-'));
  const dir = join(root, '2026', '04', '02');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(FIX, srcFixture), join(dir, filename));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

async function collect(adapter: CodexAdapter): Promise<MemoryRecord[]> {
  const out: MemoryRecord[] = [];
  for await (const r of adapter.scan()) out.push(r);
  return out;
}

describe('CodexAdapter.scan() — valid.jsonl', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('yields exactly the 4 user/assistant turns (skipping developer + non-message payloads)', async () => {
    // valid.jsonl has 11 lines: session_meta, event_msg, dev message
    // (skip — developer role is system instructions), turn_context,
    // user, reasoning (skip — non-message payload), assistant,
    // function_call (skip), user, assistant, event_msg. Four
    // user/assistant message lines emit.
    const { root, cleanup: c } = withFixtureLayout('valid.jsonl');
    cleanup = c;
    const a = new CodexAdapter({ storageRoot: root });
    const records = await collect(a);
    expect(records).toHaveLength(4);
  });

  it('emits records with canonical MemoryRecord shape', async () => {
    const { root, cleanup: c } = withFixtureLayout('valid.jsonl');
    cleanup = c;
    const a = new CodexAdapter({ storageRoot: root });
    const records = await collect(a);
    const first = records[0];
    if (!first) throw new Error('expected at least one record');
    expect(typeof first.id).toBe('string');
    expect(first.id.length).toBeGreaterThan(0);
    expect(first.source).toBe('codex');
    expect(first.timestamp).toBeInstanceOf(Date);
    if (typeof first.role !== 'string') {
      throw new Error('expected first.role to be set on codex records');
    }
    expect(['user', 'assistant', 'system', 'tool']).toContain(first.role);
    expect(typeof first.text).toBe('string');
    expect(first.text.length).toBeGreaterThan(0);
    if (typeof first.sessionId !== 'string') {
      throw new Error('expected sessionId to be a string for codex records');
    }
    expect(first.sessionId.length).toBeGreaterThan(0);
  });

  it('uses the per-line timestamp from the JSONL (not file mtime)', async () => {
    const { root, cleanup: c } = withFixtureLayout('valid.jsonl');
    cleanup = c;
    const a = new CodexAdapter({ storageRoot: root });
    const records = await collect(a);
    // First user message's `timestamp` field is "2026-04-02T10:00:04.000Z".
    expect(records[0]?.timestamp.toISOString()).toBe('2026-04-02T10:00:04.000Z');
    // Last assistant message's `timestamp` field is "2026-04-02T10:00:09.000Z".
    expect(records[records.length - 1]?.timestamp.toISOString()).toBe('2026-04-02T10:00:09.000Z');
  });

  it('joins multiple text blocks (input_text + output_text) and skips images', async () => {
    const { root, cleanup: c } = withFixtureLayout('valid.jsonl');
    cleanup = c;
    const a = new CodexAdapter({ storageRoot: root });
    const records = await collect(a);
    // The first assistant turn has two output_text blocks: "hello! " + "how can I help?"
    const firstAssistant = records.find((r) => r.role === 'assistant');
    if (!firstAssistant) throw new Error('expected an assistant record');
    expect(firstAssistant.text).toBe('hello! how can I help?');
    // The second user turn has input_text + input_image; image must be dropped.
    const secondUser = records.filter((r) => r.role === 'user')[1];
    if (!secondUser) throw new Error('expected a second user record');
    expect(secondUser.text).toBe('please edit the project file');
    expect(secondUser.text).not.toContain('image');
    expect(secondUser.text).not.toContain('base64');
  });

  it('preserves chronological (file) order', async () => {
    const { root, cleanup: c } = withFixtureLayout('valid.jsonl');
    cleanup = c;
    const a = new CodexAdapter({ storageRoot: root });
    const records = await collect(a);
    expect(records[0]?.role).toBe('user');
    expect(records[1]?.role).toBe('assistant');
    expect(records[2]?.role).toBe('user');
    expect(records[3]?.role).toBe('assistant');
  });

  it('drops developer-role messages (system instructions are not memories)', async () => {
    const { root, cleanup: c } = withFixtureLayout('valid.jsonl');
    cleanup = c;
    const a = new CodexAdapter({ storageRoot: root });
    const records = await collect(a);
    expect(records.every((r) => r.role !== 'system' || !r.text.startsWith('<permissions'))).toBe(
      true,
    );
    // None of the surfaced records should match the dev instruction text.
    expect(records.some((r) => r.text.includes('<permissions instructions>'))).toBe(false);
  });
});

describe('CodexAdapter.scan() — empty.jsonl', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('yields zero records and does not throw', async () => {
    const { root, cleanup: c } = withFixtureLayout('empty.jsonl');
    cleanup = c;
    const a = new CodexAdapter({ storageRoot: root });
    const records = await collect(a);
    expect(records).toHaveLength(0);
  });
});

describe('CodexAdapter.scan() — empty storageRoot', () => {
  it('yields zero records when no nested date dirs exist', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'omem-codex-empty-'));
    try {
      const a = new CodexAdapter({ storageRoot: tmp });
      const records = await collect(a);
      expect(records).toHaveLength(0);
      expect(a.lastScanStats?.recordCount).toBe(0);
      expect(a.lastScanStats?.filesScanned).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
