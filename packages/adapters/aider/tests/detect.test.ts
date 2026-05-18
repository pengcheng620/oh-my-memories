import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AiderAdapter } from '../src/index';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'omem-aider-detect-'));
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* non-fatal */ }
});

describe('AiderAdapter.detect', () => {
  test('returns present=true when .aider.chat.history.md exists', async () => {
    writeFileSync(join(tmpRoot, '.aider.chat.history.md'), '# aider chat started at 2026-05-15 10:00:00\n');
    const adapter = new AiderAdapter({ storageRoot: tmpRoot });
    const result = await adapter.detect();
    expect(result.present).toBe(true);
  });

  test('returns present=false when no history file exists', async () => {
    const adapter = new AiderAdapter({ storageRoot: tmpRoot });
    const result = await adapter.detect();
    expect(result.present).toBe(false);
  });
});
