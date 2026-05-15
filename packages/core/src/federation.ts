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

export interface AdapterFailure {
  adapterId: string;
  error: string;
}

export interface RecallResult {
  hits: RecallHit[];
  failures: AdapterFailure[];
  partial: boolean;
}

// M1 federation: simple BM25-ish term matching + recency tiebreak.
// True BM25 (SQLite FTS5) lands when packages/core gets the persistent index in M3.
//
// Uses Promise.allSettled across adapters so one failing adapter doesn't block
// the rest. Partial success (some adapters fail, some succeed) exits 5 per spec.
export async function recall(
  adapters: readonly AnyAdapter[],
  opts: RecallOptions,
): Promise<RecallResult> {
  const targets = opts.sources?.length
    ? adapters.filter((a) => opts.sources?.includes(a.id) === true)
    : adapters;

  const terms = tokenize(opts.query);
  if (terms.length === 0) return { hits: [], failures: [], partial: false };

  const scanOpts = opts.since !== undefined ? { since: opts.since } : {};
  const now = Date.now();

  const settled = await Promise.allSettled(
    targets.map(async (adapter) => {
      const hits: RecallHit[] = [];
      for await (const record of adapter.scan(scanOpts)) {
        const score = scoreRecord(record.text, terms, record.timestamp, now);
        if (score > 0) {
          hits.push({
            record,
            score,
            matchedTerms: terms.filter((t) => record.text.toLowerCase().includes(t)),
          });
        }
      }
      return { adapterId: adapter.id, hits };
    }),
  );

  const allHits: RecallHit[] = [];
  const failures: AdapterFailure[] = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      allHits.push(...result.value.hits);
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failures.push({ adapterId: 'unknown', error: reason });
    }
  }

  // Stable sort: score desc, then timestamp desc, then source id asc (tie-break
  // per eng-verdict §Failure Modes — deterministic order prevents flaky tests).
  allHits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tsDiff = b.record.timestamp.getTime() - a.record.timestamp.getTime();
    if (tsDiff !== 0) return tsDiff;
    return a.record.source.localeCompare(b.record.source);
  });

  return {
    hits: allHits.slice(0, opts.limit ?? 50),
    failures,
    partial: failures.length > 0 && allHits.length > 0,
  };
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);
}

// Recency-weighted scoring per spec §4.3: BM25-ish term frequency +
// an exponential decay that boosts recent records. The decay half-life
// is 7 days — records older than a month contribute essentially their
// raw TF score; records from today get up to 2x.
const DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

function scoreRecord(
  text: string,
  terms: readonly string[],
  timestamp: Date,
  nowMs: number,
): number {
  const lower = text.toLowerCase();
  let tf = 0;
  for (const term of terms) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      tf += 1;
      idx = lower.indexOf(term, idx + 1);
    }
  }
  if (tf === 0) return 0;

  const ageMs = Math.max(0, nowMs - timestamp.getTime());
  const recencyBoost = 1 + 2 ** (-ageMs / DECAY_HALF_LIFE_MS);
  return tf * recencyBoost;
}
