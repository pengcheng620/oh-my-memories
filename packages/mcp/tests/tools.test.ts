import { describe, expect, it } from 'bun:test';
import type {
  AnyAdapter,
  DetectResult,
  MemoryRecord,
  ScanOptions,
  ScanResult,
} from '@oh-my-memories/adapter-sdk';
import { executeRecall } from '../src/tools/recall';
import { executeScan } from '../src/tools/scan';

// Tool unit tests — exercise the recall/scan execute() functions in isolation
// from the McpServer wiring. The server boundary is contract-tested separately
// via the in-memory MCP transport.

class FakeAdapter implements AnyAdapter {
  readonly id: string;
  readonly category = 'ide' as const;
  readonly displayName: string;
  private readonly records: MemoryRecord[];
  private readonly _detect: DetectResult;

  constructor(
    id: string,
    displayName: string,
    records: MemoryRecord[],
    detect?: Partial<DetectResult>,
  ) {
    this.id = id;
    this.displayName = displayName;
    this.records = records;
    this._detect = {
      present: true,
      storageRoot: `/fake/${id}`,
      ...detect,
    };
  }

  async detect(): Promise<DetectResult> {
    return this._detect;
  }

  async *scan(_opts?: ScanOptions): AsyncIterable<MemoryRecord> {
    for (const r of this.records) yield r;
  }

  async scanAndCount(_opts?: ScanOptions): Promise<ScanResult> {
    return { records: this.records.length, denylistedFiles: 0 };
  }
}

function makeRecord(source: string, id: string, text: string, hoursAgo: number): MemoryRecord {
  return {
    source: source as MemoryRecord['source'],
    id,
    text,
    timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    sessionId: `session-${id}`,
  };
}

describe('executeRecall', () => {
  it('returns ranked hits with score, terms, and snippet', async () => {
    const a = new FakeAdapter('claude-code', 'Claude Code', [
      makeRecord('claude-code', 'a1', 'react hooks deep dive', 2),
      makeRecord('claude-code', 'a2', 'vue composition api', 24),
    ]);
    const b = new FakeAdapter('cursor', 'Cursor', [
      makeRecord('cursor', 'b1', 'react hooks vs class components', 1),
    ]);

    const out = await executeRecall({ query: 'react hooks' }, { listAdapters: () => [a, b] });

    expect(out.query).toBe('react hooks');
    expect(out.hits.length).toBe(2);
    expect(out.hits[0]?.matchedTerms).toContain('react');
    expect(out.hits[0]?.matchedTerms).toContain('hooks');
    expect(out.hits[0]?.score).toBeGreaterThan(0);
    expect(out.failures).toEqual([]);
    expect(out.partial).toBe(false);
  });

  it('respects --source filter via input.source', async () => {
    const a = new FakeAdapter('claude-code', 'Claude Code', [
      makeRecord('claude-code', 'a1', 'react hooks deep dive', 2),
    ]);
    const b = new FakeAdapter('cursor', 'Cursor', [
      makeRecord('cursor', 'b1', 'react hooks vs class components', 1),
    ]);

    const out = await executeRecall(
      { query: 'react', source: 'cursor' },
      {
        listAdapters: () => [a, b],
        getAdapterById: (id) => (id === 'cursor' ? b : undefined),
      },
    );
    expect(out.hits.length).toBe(1);
    expect(out.hits[0]?.source).toBe('cursor');
  });

  it('returns empty result when no adapters match', async () => {
    const out = await executeRecall({ query: 'whatever' }, { listAdapters: () => [] });
    expect(out.hits).toEqual([]);
    expect(out.failures).toEqual([]);
    expect(out.partial).toBe(false);
  });

  it('caps results at the supplied limit', async () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      makeRecord('claude-code', `r${i}`, `react ${i}`, i),
    );
    const a = new FakeAdapter('claude-code', 'Claude Code', records);

    const out = await executeRecall({ query: 'react', limit: 5 }, { listAdapters: () => [a] });
    expect(out.hits.length).toBe(5);
  });
});

describe('executeScan', () => {
  it('returns one row per detected adapter with category + schema version', async () => {
    const a = new FakeAdapter('claude-code', 'Claude Code', []);
    const b = new FakeAdapter('cursor', 'Cursor', [], { present: false });
    const out = await executeScan({}, { listAdapters: () => [a, b] });

    expect(out.sources.length).toBe(2);
    const cc = out.sources.find((s) => s.id === 'claude-code');
    expect(cc?.present).toBe(true);
    expect(cc?.category).toBe('ide');
    expect(cc?.schemaVersion).toBe('claude-code/2026-05');
    expect(cc?.storageRoot).toBe('/fake/claude-code');

    const cu = out.sources.find((s) => s.id === 'cursor');
    expect(cu?.present).toBe(false);
  });

  it('respects source filter', async () => {
    const a = new FakeAdapter('claude-code', 'Claude Code', []);
    const b = new FakeAdapter('cursor', 'Cursor', []);
    const out = await executeScan(
      { source: 'cursor' },
      {
        listAdapters: () => [a, b],
        getAdapterById: (id) => (id === 'cursor' ? b : undefined),
      },
    );
    expect(out.sources.length).toBe(1);
    expect(out.sources[0]?.id).toBe('cursor');
  });
});
