import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { OpenCodeAdapter } from '../src/index';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'omem-oc-detect-'));
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* non-fatal */ }
});

describe('OpenCodeAdapter.detect', () => {
  test('returns present=true when storage root exists', async () => {
    const adapter = new OpenCodeAdapter({ storageRoot: tmpRoot });
    const result = await adapter.detect();
    expect(result.present).toBe(true);
    expect(result.storageRoot).toBe(tmpRoot);
  });

  test('returns present=false when storage root does not exist', async () => {
    const adapter = new OpenCodeAdapter({ storageRoot: join(tmpRoot, 'nonexistent') });
    const result = await adapter.detect();
    expect(result.present).toBe(false);
  });
});
