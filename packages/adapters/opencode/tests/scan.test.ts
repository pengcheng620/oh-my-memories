import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenCodeAdapter } from '../src/index';

let tmpRoot: string;
const fixtureDir = join(import.meta.dir, '..', '..', '..', '..', 'tests', 'fixtures', 'opencode');

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'omem-oc-scan-'));
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* non-fatal */
  }
});

function placeGlobalFixtures(): void {
  const globalStorage = join(tmpRoot, 'global', 'storage');
  cpSync(join(fixtureDir, 'storage'), globalStorage, { recursive: true });
}

function placeProjectFixtures(projectHash = 'proj-abc'): void {
  const projStorage = join(tmpRoot, 'project', projectHash, 'storage');
  cpSync(join(fixtureDir, 'storage'), projStorage, { recursive: true });
}

describe('OpenCodeAdapter.scan', () => {
  test('emits records from global storage', async () => {
    placeGlobalFixtures();

    const adapter = new OpenCodeAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records.length).toBe(2);
    expect(records[0]?.role).toBe('user');
    expect(records[0]?.text).toContain('configure OpenCode');
    expect(records[0]?.source).toBe('opencode');
    expect(records[0]?.sessionId).toBe('sess-1');

    expect(records[1]?.role).toBe('assistant');
    expect(records[1]?.text).toContain('Anthropic API key');
  });

  test('skips reasoning parts (only emits text parts)', async () => {
    placeGlobalFixtures();

    const adapter = new OpenCodeAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    const assistantRecord = records.find((r) => r.role === 'assistant');
    expect(assistantRecord).toBeDefined();
    expect(assistantRecord?.text).not.toContain('Internal reasoning text');
  });

  test('scans project-specific storage', async () => {
    placeProjectFixtures();

    const adapter = new OpenCodeAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records.length).toBe(2);
  });

  test('returns empty when storage root missing', async () => {
    const adapter = new OpenCodeAdapter({ storageRoot: join(tmpRoot, 'gone') });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }
    expect(records).toHaveLength(0);
    expect(adapter.lastScanStats?.recordCount).toBe(0);
  });

  test('scan stats are populated after scan', async () => {
    placeGlobalFixtures();

    const adapter = new OpenCodeAdapter({ storageRoot: tmpRoot });
    for await (const _r of adapter.scan()) {
      /* drain */
    }

    expect(adapter.lastScanStats).not.toBeNull();
    expect(adapter.lastScanStats?.recordCount).toBe(2);
  });
});
