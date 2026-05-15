import { describe, expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCodeAdapter } from '../src/index';

describe('ClaudeCodeAdapter — identity surface', () => {
  it('declares stable id, category, displayName', () => {
    const a = new ClaudeCodeAdapter();
    expect(a.id).toBe('claude-code');
    expect(a.category).toBe('ide');
    expect(a.displayName).toBe('Claude Code');
  });
});

describe('ClaudeCodeAdapter.detect()', () => {
  it('returns present:false when storageRoot does not exist', async () => {
    const phantom = join(
      tmpdir(),
      `omem-phantom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const a = new ClaudeCodeAdapter({ storageRoot: phantom });
    const r = await a.detect();
    expect(r.present).toBe(false);
    expect(r.storageRoot).toBe(phantom);
  });

  it('returns present:true when storageRoot exists', async () => {
    const real = join(tmpdir(), `omem-detect-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(real, { recursive: true });
    try {
      const a = new ClaudeCodeAdapter({ storageRoot: real });
      const r = await a.detect();
      expect(r.present).toBe(true);
      expect(r.storageRoot).toBe(real);
    } finally {
      await rm(real, { recursive: true, force: true });
    }
  });
});
