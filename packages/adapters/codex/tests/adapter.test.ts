import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAdapter } from '../src';

describe('CodexAdapter — identity surface', () => {
  it('declares stable id, category, displayName', () => {
    const a = new CodexAdapter();
    expect(a.id).toBe('codex');
    expect(a.category).toBe('ide');
    expect(a.displayName).toBe('OpenAI Codex');
  });
});

describe('CodexAdapter.detect()', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omem-codex-detect-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns present:false when storageRoot does not exist', async () => {
    const a = new CodexAdapter({ storageRoot: join(tmp, 'no-such-dir') });
    const r = await a.detect();
    expect(r.present).toBe(false);
    expect(r.storageRoot).toContain('no-such-dir');
  });

  it('returns present:true when storageRoot exists', async () => {
    expect(existsSync(tmp)).toBe(true);
    const a = new CodexAdapter({ storageRoot: tmp });
    const r = await a.detect();
    expect(r.present).toBe(true);
    expect(r.storageRoot).toBe(tmp);
  });
});
