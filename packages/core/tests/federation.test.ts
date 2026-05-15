import { describe, expect, test } from 'bun:test';
import type {
  AnyAdapter,
  DetectResult,
  MemoryRecord,
  ScanOptions,
} from '@oh-my-memories/adapter-sdk';
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
});
