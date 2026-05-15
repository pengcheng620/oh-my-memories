import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createParseStats, isMemoryRole, streamJsonl } from '../src';

const FIXTURES = join(fileURLToPath(new URL('./fixtures/', import.meta.url)));

describe('streamJsonl', () => {
  it('yields { ok: true, value } for every well-formed line', async () => {
    const lines: unknown[] = [];
    for await (const line of streamJsonl(join(FIXTURES, 'valid.jsonl'))) {
      if (line.ok) lines.push(line.value);
    }
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ kind: 'hello', value: 1 });
    expect(lines[2]).toEqual({ kind: 'goodbye', value: 3 });
  });

  it('yields { ok: false, error } for malformed lines without throwing', async () => {
    const okCount = { value: 0 };
    const errCount = { value: 0 };
    for await (const line of streamJsonl(join(FIXTURES, 'corrupt.jsonl'))) {
      if (line.ok) okCount.value++;
      else {
        errCount.value++;
        expect(typeof line.error).toBe('string');
        expect(line.error.length).toBeGreaterThan(0);
      }
    }
    // 3 valid lines (ok:1, ok:2, ok:4) + 2 corrupt lines
    expect(okCount.value).toBe(3);
    expect(errCount.value).toBe(2);
  });

  it('emits nothing for an empty file', async () => {
    let any = false;
    for await (const _line of streamJsonl(join(FIXTURES, 'empty.jsonl'))) {
      any = true;
    }
    expect(any).toBe(false);
  });

  it('skips blank lines silently (not corrupt)', async () => {
    let okCount = 0;
    let errCount = 0;
    for await (const line of streamJsonl(join(FIXTURES, 'blank-lines.jsonl'))) {
      if (line.ok) okCount++;
      else errCount++;
    }
    expect(okCount).toBe(3);
    expect(errCount).toBe(0);
  });

  it('handles CRLF line endings without producing corrupt lines', async () => {
    let okCount = 0;
    let errCount = 0;
    for await (const line of streamJsonl(join(FIXTURES, 'crlf.jsonl'))) {
      if (line.ok) okCount++;
      else errCount++;
    }
    expect(okCount).toBe(3);
    expect(errCount).toBe(0);
  });
});

describe('createParseStats', () => {
  it('returns zeroed counters', () => {
    const stats = createParseStats();
    expect(stats).toEqual({ recordCount: 0, corruptLines: 0 });
  });

  it('produces a fresh object on each call (no shared state)', () => {
    const a = createParseStats();
    const b = createParseStats();
    a.recordCount = 5;
    expect(b.recordCount).toBe(0);
  });
});

describe('isMemoryRole', () => {
  it('accepts the four canonical roles', () => {
    expect(isMemoryRole('user')).toBe(true);
    expect(isMemoryRole('assistant')).toBe(true);
    expect(isMemoryRole('system')).toBe(true);
    expect(isMemoryRole('tool')).toBe(true);
  });

  it('rejects every other value (including null, undefined, numbers, objects)', () => {
    expect(isMemoryRole('developer')).toBe(false);
    expect(isMemoryRole('USER')).toBe(false);
    expect(isMemoryRole('')).toBe(false);
    expect(isMemoryRole(null)).toBe(false);
    expect(isMemoryRole(undefined)).toBe(false);
    expect(isMemoryRole(0)).toBe(false);
    expect(isMemoryRole({})).toBe(false);
    expect(isMemoryRole([])).toBe(false);
  });
});
