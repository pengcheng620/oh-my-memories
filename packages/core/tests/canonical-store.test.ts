import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CanonicalStore } from '../src/canonical-store';
import {
  CanonicalSchemaError,
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  runMigrations,
} from '../src/migrations';

let workdir: string;
let dbPath: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'omem-canonical-'));
  dbPath = join(workdir, 'canonical.db');
});

afterEach(() => {
  // Best-effort: on Windows SQLite-side handles are sometimes still being
  // released when the test ends; treat lingering file locks as non-fatal.
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('migrations', () => {
  test('LATEST_SCHEMA_VERSION matches the highest declared migration', () => {
    const max = Math.max(...MIGRATIONS.map((m) => m.version));
    expect(LATEST_SCHEMA_VERSION).toBe(max);
  });

  test('runMigrations brings a fresh DB up to LATEST_SCHEMA_VERSION', () => {
    const db = new Database(dbPath);
    const result = runMigrations(db);
    expect(result.from).toBe(0);
    expect(result.to).toBe(LATEST_SCHEMA_VERSION);
    expect(result.applied).toBe(LATEST_SCHEMA_VERSION);
    const row = db.query('SELECT schema_version FROM schema_meta').get() as {
      schema_version: number;
    };
    expect(row.schema_version).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });

  test('runMigrations is idempotent', () => {
    const db = new Database(dbPath);
    runMigrations(db);
    const second = runMigrations(db);
    expect(second.applied).toBe(0);
    expect(second.from).toBe(LATEST_SCHEMA_VERSION);
    expect(second.to).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });

  test('throws OMEM-E33 when DB is at a newer schema version than the binary', () => {
    const db = new Database(dbPath);
    runMigrations(db);
    db.run('UPDATE schema_meta SET schema_version = ?', [LATEST_SCHEMA_VERSION + 99]);
    expect(() => runMigrations(db)).toThrow(CanonicalSchemaError);
    try {
      runMigrations(db);
    } catch (err) {
      expect((err as CanonicalSchemaError).code).toBe('OMEM-E33-CANONICAL-DB-NEWER');
    }
    db.close();
  });

  test('inline SQL parity with .sql review file', () => {
    // Guard against drift: the inlined string and the .sql file must stay
    // in sync (the .sql file is what reviewers eyeball).
    const inlinePath = require.resolve('../src/migrations/001-canonical-init.sql.inline');
    const sqlPath = inlinePath.replace(/\.inline\.ts$/, '');
    const onDisk = readFileSync(sqlPath, 'utf8');
    // biome-ignore lint/style/noNonNullAssertion: tests guard MIGRATIONS.length > 0 above by construction.
    const inline = MIGRATIONS[0]!.sql;
    // Strip leading/trailing whitespace + collapse blank-line counts, then compare.
    const normalize = (s: string) =>
      s
        .trim()
        .replace(/\r\n/g, '\n')
        .replace(/\n{2,}/g, '\n');
    expect(normalize(inline)).toEqual(normalize(stripSqlComments(onDisk)));
  });
});

describe('CanonicalStore.remember', () => {
  test('static open creates the DB file and parent dir', () => {
    const nestedPath = join(workdir, 'nested', 'dir', 'canonical.db');
    const store = CanonicalStore.open({ path: nestedPath });
    try {
      expect(existsSync(nestedPath)).toBe(true);
      expect(store.count()).toBe(0);
    } finally {
      store.close();
    }
  });

  test('remember stores a row and returns created:true', () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      const result = store.remember({ text: 'always use TypeScript strict mode' });
      expect(result.created).toBe(true);
      expect(result.id).toMatch(/^[0-9a-f]{8}-/);
      expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(store.count()).toBe(1);
    } finally {
      store.close();
    }
  });

  test('remember dedups identical content via fingerprint', () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      const ts = new Date('2026-05-15T10:00:00Z');
      const first = store.remember({ text: 'use websockets for real-time', timestamp: ts });
      const second = store.remember({ text: 'use websockets for real-time', timestamp: ts });
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.id).toBe(first.id);
      expect(second.fingerprint).toBe(first.fingerprint);
      expect(store.count()).toBe(1);
    } finally {
      store.close();
    }
  });

  test('remember refuses empty text', () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      expect(() => store.remember({ text: '   ' })).toThrow(/non-empty/);
    } finally {
      store.close();
    }
  });

  test('readonly store rejects writes', () => {
    {
      const writer = CanonicalStore.open({ path: dbPath });
      writer.remember({ text: 'seed' });
      writer.close();
    }
    const ro = CanonicalStore.open({ path: dbPath, readonly: true });
    try {
      expect(() => ro.remember({ text: 'fail' })).toThrow(/readonly/);
    } finally {
      ro.close();
    }
  });
});

describe('CanonicalStore.recall', () => {
  test('returns hits ranked by BM25, with snippets', () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      store.remember({ text: 'always use TypeScript strict mode' });
      store.remember({ text: 'prefer Bun over Node for new projects' });
      store.remember({ text: 'TypeScript is good but JavaScript is fine too' });
      const hits = store.recall({ query: 'typescript' });
      expect(hits.length).toBeGreaterThanOrEqual(2);
      // biome-ignore lint/style/noNonNullAssertion: previous expect guards length >= 2.
      // biome-ignore lint/style/noNonNullAssertion: previous expect guards length >= 2.
      expect(hits[0]!.score).toBeLessThanOrEqual(hits[1]!.score);
      for (const h of hits) {
        expect(h.snippet.toLowerCase()).toContain('[typescript]');
      }
    } finally {
      store.close();
    }
  });

  test('returns empty array when query has no FTS-meaningful tokens', () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      store.remember({ text: 'hello world' });
      expect(store.recall({ query: '?' })).toEqual([]);
      expect(store.recall({ query: '   ' })).toEqual([]);
    } finally {
      store.close();
    }
  });

  test('filters by --since (timestamp_ms cutoff)', () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      const old = new Date('2026-01-01T00:00:00Z');
      const recent = new Date('2026-05-01T00:00:00Z');
      store.remember({ text: 'old typescript note', timestamp: old });
      store.remember({ text: 'recent typescript note', timestamp: recent });
      const cutoff = new Date('2026-04-01T00:00:00Z');
      const hits = store.recall({ query: 'typescript', since: cutoff });
      expect(hits.length).toBe(1);
      // biome-ignore lint/style/noNonNullAssertion: previous expect guards length === 1.
      expect(hits[0]!.record.text).toContain('recent');
    } finally {
      store.close();
    }
  });

  test('FTS index updates correctly on dedup-skip insert', () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      // Insert once, then re-insert (no-op) — recall should still hit it once.
      const ts = new Date('2026-05-15T10:00:00Z');
      store.remember({ text: 'unique sentinel phrase', timestamp: ts });
      store.remember({ text: 'unique sentinel phrase', timestamp: ts });
      const hits = store.recall({ query: 'sentinel' });
      expect(hits.length).toBe(1);
    } finally {
      store.close();
    }
  });

  test('handles user query with FTS-syntax characters safely', () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      store.remember({ text: 'NEAR is an FTS5 operator' });
      // Without sanitization this would either error or apply NEAR semantics.
      const hits = store.recall({ query: 'NEAR("FTS5", "operator")' });
      expect(hits.length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });
});

describe('CanonicalStore.scan', () => {
  test('yields records ordered by timestamp ASC', async () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      store.remember({ text: 'B', timestamp: new Date('2026-05-02T00:00:00Z') });
      store.remember({ text: 'A', timestamp: new Date('2026-05-01T00:00:00Z') });
      store.remember({ text: 'C', timestamp: new Date('2026-05-03T00:00:00Z') });
      const collected: string[] = [];
      for await (const rec of store.scan()) collected.push(rec.text);
      expect(collected).toEqual(['A', 'B', 'C']);
    } finally {
      store.close();
    }
  });

  test('honours --since', async () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      store.remember({ text: 'old', timestamp: new Date('2026-01-01T00:00:00Z') });
      store.remember({ text: 'new', timestamp: new Date('2026-05-01T00:00:00Z') });
      const collected: string[] = [];
      for await (const rec of store.scan({ since: new Date('2026-04-01T00:00:00Z') })) {
        collected.push(rec.text);
      }
      expect(collected).toEqual(['new']);
    } finally {
      store.close();
    }
  });
});

function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}
