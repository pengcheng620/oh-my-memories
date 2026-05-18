import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { BasicMemoryAdapter } from '../src/index';

let tmpRoot: string;
const fixtureDir = join(import.meta.dir, '..', '..', '..', '..', 'tests', 'fixtures', 'basic-memory');

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'omem-bm-scan-'));
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* non-fatal */ }
});

describe('BasicMemoryAdapter.scan', () => {
  test('parses markdown with frontmatter', async () => {
    cpSync(join(fixtureDir, 'with-frontmatter.md'), join(tmpRoot, 'auth.md'));

    const adapter = new BasicMemoryAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records).toHaveLength(1);
    expect(records[0]!.text).toContain('JWT Authentication Patterns');
    expect(records[0]!.text).toContain('short-lived access tokens');
    expect(records[0]!.role).toBe('system');
    expect(records[0]!.source).toBe('basic-memory');
    expect(records[0]!.metadata?.tags).toEqual(['security', 'jwt', 'auth']);
    expect(records[0]!.metadata?.noteType).toBe('decision');
    expect(records[0]!.metadata?.permalink).toBe('knowledge/jwt-auth-patterns');
    expect(records[0]!.timestamp).toEqual(new Date('2026-05-10T15:30:00Z'));
  });

  test('parses plain markdown without frontmatter', async () => {
    cpSync(join(fixtureDir, 'no-frontmatter.md'), join(tmpRoot, 'plain.md'));

    const adapter = new BasicMemoryAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records).toHaveLength(1);
    expect(records[0]!.text).toContain('plain markdown note');
  });

  test('skips empty files', async () => {
    cpSync(join(fixtureDir, 'empty.md'), join(tmpRoot, 'empty.md'));

    const adapter = new BasicMemoryAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records).toHaveLength(0);
  });

  test('returns empty when storage root missing', async () => {
    const adapter = new BasicMemoryAdapter({ storageRoot: join(tmpRoot, 'nope') });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records).toHaveLength(0);
    expect(adapter.lastScanStats?.recordCount).toBe(0);
  });

  test('scans nested subdirectories', async () => {
    const subDir = join(tmpRoot, 'project', 'notes');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, 'deep.md'), '# Deep Note\nSome content.');

    const adapter = new BasicMemoryAdapter({ storageRoot: tmpRoot });
    const records = [];
    for await (const r of adapter.scan()) {
      records.push(r);
    }

    expect(records).toHaveLength(1);
    expect(records[0]!.text).toContain('Deep Note');
  });

  test('scan stats are populated after scan', async () => {
    cpSync(join(fixtureDir, 'with-frontmatter.md'), join(tmpRoot, 'a.md'));
    cpSync(join(fixtureDir, 'no-frontmatter.md'), join(tmpRoot, 'b.md'));
    cpSync(join(fixtureDir, 'empty.md'), join(tmpRoot, 'c.md'));

    const adapter = new BasicMemoryAdapter({ storageRoot: tmpRoot });
    for await (const _r of adapter.scan()) { /* drain */ }

    expect(adapter.lastScanStats).not.toBeNull();
    expect(adapter.lastScanStats!.recordCount).toBe(2);
    expect(adapter.lastScanStats!.filesScanned).toBe(3);
  });
});
