import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AnyAdapter,
  DetectResult,
  MemoryRecord,
  ScanOptions,
} from '@oh-my-memories/adapter-sdk';
import { CanonicalStore } from '../src/canonical-store';
import { recall } from '../src/federation';

function makeRecord(id: string, source: string, text: string, ageMs: number): MemoryRecord {
  return {
    id,
    source,
    timestamp: new Date(Date.now() - ageMs),
    text,
  };
}

function fakeAdapter(
  id: string,
  records: MemoryRecord[],
  opts?: { shouldFail?: boolean },
): AnyAdapter {
  return {
    id,
    category: 'ide' as const,
    displayName: id,
    detect: async (): Promise<DetectResult> => ({ present: true }),
    storageRoot: () => '/tmp/fake',
    scan: async function* (_scanOpts?: ScanOptions): AsyncIterable<MemoryRecord> {
      if (opts?.shouldFail) throw new Error(`Adapter ${id} failed`);
      yield* records;
    },
  } as AnyAdapter;
}

describe('federation: recall', () => {
  test('returns hits sorted by score (descending)', async () => {
    const records = [
      makeRecord('1', 'a', 'foo bar baz foo', 1000),
      makeRecord('2', 'a', 'foo', 2000),
    ];
    const result = await recall([fakeAdapter('a', records)], { query: 'foo' });
    expect(result.hits.length).toBe(2);
    // biome-ignore lint/style/noNonNullAssertion: test asserts length=2 above
    expect(result.hits[0]!.score).toBeGreaterThanOrEqual(result.hits[1]!.score);
  });

  test('recency weighting boosts newer records', async () => {
    const recent = makeRecord('1', 'a', 'keyword match', 60_000);
    const old = makeRecord('2', 'a', 'keyword match', 30 * 24 * 60 * 60 * 1000);
    const result = await recall([fakeAdapter('a', [recent, old])], { query: 'keyword' });
    expect(result.hits.length).toBe(2);
    // biome-ignore lint/style/noNonNullAssertion: test asserts length=2 above
    expect(result.hits[0]!.record.id).toBe('1');
  });

  test('stable sort breaks ties by source id', async () => {
    const ts = new Date();
    const r1: MemoryRecord = { id: '1', source: 'beta', timestamp: ts, text: 'same' };
    const r2: MemoryRecord = { id: '2', source: 'alpha', timestamp: ts, text: 'same' };
    const result = await recall([fakeAdapter('beta', [r1]), fakeAdapter('alpha', [r2])], {
      query: 'same',
    });
    expect(result.hits.length).toBe(2);
    // biome-ignore lint/style/noNonNullAssertion: test asserts length=2 above
    expect(result.hits[0]!.record.source).toBe('alpha');
  });

  test('sources filter restricts adapters', async () => {
    const r1 = makeRecord('1', 'a', 'test', 1000);
    const r2 = makeRecord('2', 'b', 'test', 1000);
    const result = await recall([fakeAdapter('a', [r1]), fakeAdapter('b', [r2])], {
      query: 'test',
      sources: ['a'],
    });
    expect(result.hits.length).toBe(1);
    // biome-ignore lint/style/noNonNullAssertion: test asserts length=1 above
    expect(result.hits[0]!.record.source).toBe('a');
  });

  test('limit caps result count', async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord(String(i), 'a', 'match this', i * 1000),
    );
    const result = await recall([fakeAdapter('a', records)], { query: 'match', limit: 3 });
    expect(result.hits.length).toBe(3);
  });

  test('partial success: one adapter fails, others succeed', async () => {
    const good = makeRecord('1', 'good', 'test data', 1000);
    const result = await recall(
      [fakeAdapter('good', [good]), fakeAdapter('bad', [], { shouldFail: true })],
      { query: 'test' },
    );
    expect(result.hits.length).toBe(1);
    expect(result.failures.length).toBe(1);
    expect(result.partial).toBe(true);
    // biome-ignore lint/style/noNonNullAssertion: test asserts failures.length=1 above
    expect(result.failures[0]!.error).toContain('bad');
  });

  test('all adapters fail: no hits, all failures', async () => {
    const result = await recall(
      [fakeAdapter('a', [], { shouldFail: true }), fakeAdapter('b', [], { shouldFail: true })],
      { query: 'test' },
    );
    expect(result.hits.length).toBe(0);
    expect(result.failures.length).toBe(2);
    expect(result.partial).toBe(false);
  });

  test('empty query returns empty results', async () => {
    const result = await recall([fakeAdapter('a', [makeRecord('1', 'a', 'hello world', 1000)])], {
      query: '',
    });
    expect(result.hits.length).toBe(0);
  });

  test('hits carry origin: "adapter" when no canonical store is configured', async () => {
    const result = await recall([fakeAdapter('a', [makeRecord('1', 'a', 'hello world', 1000)])], {
      query: 'hello',
    });
    expect(result.hits.length).toBe(1);
    // biome-ignore lint/style/noNonNullAssertion: test asserts length=1 above
    expect(result.hits[0]!.origin).toBe('adapter');
  });
});

describe('federation: recall + canonical store (RRF fusion)', () => {
  let workdir: string;
  let dbPath: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'omem-fed-'));
    dbPath = join(workdir, 'canonical.db');
  });

  afterEach(() => {
    try {
      rmSync(workdir, { recursive: true, force: true });
    } catch {
      // Windows occasionally holds the SQLite handle a tick longer.
    }
  });

  test('canonicalStorePath pointing at a missing file is silently ignored (cold start)', async () => {
    const records = [makeRecord('1', 'a', 'hello world', 1000)];
    const result = await recall([fakeAdapter('a', records)], {
      query: 'hello',
      canonicalStorePath: join(workdir, 'does-not-exist.db'),
    });
    // Behaves identically to "no canonical arm".
    expect(result.hits.length).toBe(1);
    // biome-ignore lint/style/noNonNullAssertion: test asserts length=1 above
    expect(result.hits[0]!.origin).toBe('adapter');
  });

  test('canonical-only hits surface with origin: "canonical"', async () => {
    const store = CanonicalStore.open({ path: dbPath });
    try {
      store.remember({ text: 'always use TypeScript strict mode' });
      store.remember({ text: 'prefer Bun for new projects' });
    } finally {
      store.close();
    }
    const result = await recall([fakeAdapter('a', [])], {
      query: 'typescript',
      canonicalStorePath: dbPath,
    });
    expect(result.hits.length).toBe(1);
    // biome-ignore lint/style/noNonNullAssertion: test asserts length=1 above
    expect(result.hits[0]!.origin).toBe('canonical');
    // biome-ignore lint/style/noNonNullAssertion: test asserts length=1 above
    expect(result.hits[0]!.record.text).toContain('TypeScript');
  });

  test('RRF merges adapter and canonical hits and dedups by fingerprint', async () => {
    const ts = new Date('2026-05-15T10:00:00Z');
    const sharedText = 'shared knowledge nugget about typescript';
    const sharedRecord: MemoryRecord = {
      id: 'adapter-id',
      source: 'cursor',
      timestamp: ts,
      text: sharedText,
    };

    // Same text+timestamp on both sides → identical fingerprint → must dedup.
    const store = CanonicalStore.open({ path: dbPath });
    try {
      store.remember({ text: sharedText, timestamp: ts, source: 'omem' });
      // A second canonical-only memory the adapter doesn't know about.
      store.remember({
        text: 'separate canonical typescript wisdom',
        timestamp: new Date('2026-05-14T10:00:00Z'),
      });
    } finally {
      store.close();
    }

    const result = await recall([fakeAdapter('cursor', [sharedRecord])], {
      query: 'typescript',
      canonicalStorePath: dbPath,
    });

    // Expect exactly 2 logical hits (deduped: 1 shared + 1 canonical-only).
    expect(result.hits.length).toBe(2);
    const texts = result.hits.map((h) => h.record.text).sort();
    expect(texts).toEqual([sharedText, 'separate canonical typescript wisdom'].sort());

    // The shared hit's origin is "canonical" because we prefer the canonical
    // copy when both sides agree (curated wins).
    const sharedHit = result.hits.find((h) => h.record.text === sharedText);
    expect(sharedHit).toBeDefined();
    expect(sharedHit?.origin).toBe('canonical');
  });

  test('RRF: hits appearing in both lists outrank hits appearing in only one', async () => {
    const ts = new Date('2026-05-15T10:00:00Z');
    const sharedText = 'shared signal from both sides';
    const sharedRecord: MemoryRecord = {
      id: 'shared-1',
      source: 'cursor',
      timestamp: ts,
      text: sharedText,
    };
    const adapterOnly: MemoryRecord = {
      id: 'adapter-only',
      source: 'cursor',
      timestamp: ts,
      text: 'lonely shared adapter signal',
    };

    const store = CanonicalStore.open({ path: dbPath });
    try {
      store.remember({ text: sharedText, timestamp: ts });
      store.remember({
        text: 'lonely shared canonical signal',
        timestamp: ts,
      });
    } finally {
      store.close();
    }

    const result = await recall([fakeAdapter('cursor', [sharedRecord, adapterOnly])], {
      query: 'shared',
      canonicalStorePath: dbPath,
    });

    expect(result.hits.length).toBe(3);
    // biome-ignore lint/style/noNonNullAssertion: test asserts length=3 above
    expect(result.hits[0]!.record.text).toBe(sharedText);
    // Shared hit appears in both lists ⇒ accumulates RRF from both ⇒ wins.
  });

  test('RRF result order is deterministic (stable tie-break)', async () => {
    const ts = new Date('2026-05-15T10:00:00Z');
    const records: MemoryRecord[] = [
      { id: 'b', source: 'beta', timestamp: ts, text: 'tie tie tie' },
      { id: 'a', source: 'alpha', timestamp: ts, text: 'tie tie tie' },
    ];

    const store = CanonicalStore.open({ path: dbPath });
    try {
      store.remember({ text: 'unrelated', timestamp: ts });
    } finally {
      store.close();
    }

    const r1 = await recall([fakeAdapter('beta', records)], {
      query: 'tie',
      canonicalStorePath: dbPath,
    });
    const r2 = await recall([fakeAdapter('beta', records)], {
      query: 'tie',
      canonicalStorePath: dbPath,
    });
    expect(r1.hits.map((h) => h.record.id)).toEqual(r2.hits.map((h) => h.record.id));
  });

  test('canonicalStorePath omitted ⇒ no canonical arm even when adapter results exist', async () => {
    const records = [makeRecord('1', 'a', 'hello world', 1000)];
    const result = await recall([fakeAdapter('a', records)], { query: 'hello' });
    expect(result.hits.every((h) => h.origin === 'adapter')).toBe(true);
  });
});
