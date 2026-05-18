import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { GeminiCliAdapter } from '../src/index';

let tmpRoot: string;
const fixtureDir = join(import.meta.dir, '..', '..', '..', '..', 'tests', 'fixtures', 'gemini-cli');

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'omem-gemini-scan-'));
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* non-fatal */ }
});

function placeFixture(fixtureName: string, projectHash = 'proj1'): void {
  const chatDir = join(tmpRoot, 'tmp', projectHash, 'chats');
  mkdirSync(chatDir, { recursive: true });
  const src = join(fixtureDir, fixtureName);
  writeFileSync(join(chatDir, fixtureName), readFileSync(src));
}

describe('GeminiCliAdapter.scan', () => {
  test('emits records from valid JSONL fixture', async () => {
    placeFixture('valid.jsonl');

    const adapter = new GeminiCliAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records.length).toBe(4);
    expect(records[0]!.role).toBe('user');
    expect(records[0]!.text).toContain('JWT refresh tokens');
    expect(records[0]!.source).toBe('gemini-cli');
    expect(records[0]!.sessionId).toBe('abc123');
    expect(records[1]!.role).toBe('assistant');
    expect(records[1]!.text).toContain('implement JWT refresh tokens');
  });

  test('returns empty when storage root missing', async () => {
    const adapter = new GeminiCliAdapter({ storageRoot: join(tmpRoot, 'gone') });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }
    expect(records).toHaveLength(0);
    expect(adapter.lastScanStats?.recordCount).toBe(0);
  });

  test('returns empty from empty fixture', async () => {
    placeFixture('empty.jsonl');

    const adapter = new GeminiCliAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }
    expect(records).toHaveLength(0);
  });

  test('emits GEMINI.md as a system record when present', async () => {
    writeFileSync(join(tmpRoot, 'GEMINI.md'), '# My Preferences\nI prefer TypeScript.');

    const adapter = new GeminiCliAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records.length).toBe(1);
    expect(records[0]!.role).toBe('system');
    expect(records[0]!.text).toContain('I prefer TypeScript');
    expect(records[0]!.id).toBe('gemini-global-memory');
  });

  test('scan stats are populated after scan', async () => {
    placeFixture('valid.jsonl');

    const adapter = new GeminiCliAdapter({ storageRoot: tmpRoot });
    for await (const _r of adapter.scan()) { /* drain */ }

    expect(adapter.lastScanStats).not.toBeNull();
    expect(adapter.lastScanStats!.recordCount).toBe(4);
    expect(adapter.lastScanStats!.corruptLines).toBe(0);
    expect(adapter.lastScanStats!.filesScanned).toBe(1);
  });
});
