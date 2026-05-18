import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { GeminiCliAdapter } from '../src/index';

let tmpRoot: string;
const fixtureDir = join(import.meta.dir, '..', '..', '..', '..', 'tests', 'fixtures', 'gemini-cli');

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'omem-gemini-corrupt-'));
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* non-fatal */ }
});

describe('GeminiCliAdapter corrupt-line tolerance', () => {
  test('skips corrupt line without throwing, still emits valid records', async () => {
    const chatDir = join(tmpRoot, 'tmp', 'proj1', 'chats');
    mkdirSync(chatDir, { recursive: true });
    writeFileSync(
      join(chatDir, 'corrupt-line.jsonl'),
      readFileSync(join(fixtureDir, 'corrupt-line.jsonl')),
    );

    const adapter = new GeminiCliAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records.length).toBe(2);
    expect(records[0]!.text).toContain('Valid line before corrupt');
    expect(records[1]!.text).toContain('Valid line after corrupt');

    expect(adapter.lastScanStats).not.toBeNull();
    expect(adapter.lastScanStats!.corruptLines).toBe(1);
  });
});
