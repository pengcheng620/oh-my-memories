import type { AnyAdapter, MemoryRecord } from '@oh-my-memories/adapter-sdk';

export interface RecallHit {
  record: MemoryRecord;
  score: number;
  matchedTerms: string[];
}

export interface RecallOptions {
  query: string;
  sources?: readonly string[];
  limit?: number;
  since?: Date;
}

// M1 federation: simple BM25-ish term matching + recency tiebreak.
// True BM25 (SQLite FTS5) lands when packages/core gets the persistent index in M3.
export async function recall(
  adapters: readonly AnyAdapter[],
  opts: RecallOptions,
): Promise<RecallHit[]> {
  const targets = opts.sources?.length
    ? adapters.filter((a) => opts.sources!.includes(a.id))
    : adapters;

  const terms = tokenize(opts.query);
  if (terms.length === 0) return [];

  const hits: RecallHit[] = [];
  for (const adapter of targets) {
    for await (const record of adapter.scan({ since: opts.since })) {
      const score = scoreRecord(record.text, terms);
      if (score > 0) {
        hits.push({
          record,
          score,
          matchedTerms: terms.filter((t) => record.text.toLowerCase().includes(t)),
        });
      }
    }
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.record.timestamp.getTime() - a.record.timestamp.getTime();
  });

  return hits.slice(0, opts.limit ?? 50);
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);
}

function scoreRecord(text: string, terms: readonly string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let idx = -1;
    while ((idx = lower.indexOf(term, idx + 1)) !== -1) {
      score += 1;
    }
  }
  return score;
}
