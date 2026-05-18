import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AiderAdapter } from '../src/index';

let tmpRoot: string;
const fixtureDir = join(import.meta.dir, '..', '..', '..', '..', 'tests', 'fixtures', 'aider');

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'omem-aider-scan-'));
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* non-fatal */ }
});

describe('AiderAdapter.scan', () => {
  test('parses chat history with multiple sessions', async () => {
    cpSync(
      join(fixtureDir, '.aider.chat.history.md'),
      join(tmpRoot, '.aider.chat.history.md'),
    );

    const adapter = new AiderAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records.length).toBeGreaterThanOrEqual(3);
    expect(records[0]?.source).toBe('aider');
    expect(records[0]?.text).toContain('error handling');
    expect(records[0]?.text).toContain('auth');
    expect(records[0]?.sessionId).toBe('2026-05-15 10:30:00');
  });

  test('skips bare /commands without assistant response', async () => {
    cpSync(
      join(fixtureDir, '.aider.chat.history.md'),
      join(tmpRoot, '.aider.chat.history.md'),
    );

    const adapter = new AiderAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    const exitRecords = records.filter((r) => r.text.includes('/exit'));
    expect(exitRecords).toHaveLength(0);
  });

  test('scans nested project directories', async () => {
    const subProject = join(tmpRoot, 'myproject');
    mkdirSync(subProject, { recursive: true });
    cpSync(
      join(fixtureDir, '.aider.chat.history.md'),
      join(subProject, '.aider.chat.history.md'),
    );

    const adapter = new AiderAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records.length).toBeGreaterThanOrEqual(3);
  });

  test('returns empty when no history files found', async () => {
    const adapter = new AiderAdapter({ storageRoot: join(tmpRoot, 'nonexistent') });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records).toHaveLength(0);
    expect(adapter.lastScanStats?.recordCount).toBe(0);
  });

  test('scan stats are populated after scan', async () => {
    cpSync(
      join(fixtureDir, '.aider.chat.history.md'),
      join(tmpRoot, '.aider.chat.history.md'),
    );

    const adapter = new AiderAdapter({ storageRoot: tmpRoot });
    for await (const _r of adapter.scan()) { /* drain */ }

    expect(adapter.lastScanStats).not.toBeNull();
    expect(adapter.lastScanStats!.recordCount).toBeGreaterThanOrEqual(3);
    expect(adapter.lastScanStats!.filesScanned).toBe(1);
  });

  test('second session records have correct timestamp', async () => {
    cpSync(
      join(fixtureDir, '.aider.chat.history.md'),
      join(tmpRoot, '.aider.chat.history.md'),
    );

    const adapter = new AiderAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    const session2Records = records.filter((r) => r.sessionId === '2026-05-16 14:00:00');
    expect(session2Records.length).toBeGreaterThanOrEqual(1);
    expect(session2Records[0]?.text).toContain('database connection pool');
  });
});
