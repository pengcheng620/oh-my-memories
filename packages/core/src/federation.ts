import { existsSync } from 'node:fs';
import type { AnyAdapter, MemoryRecord } from '@oh-my-memories/adapter-sdk';
import { CanonicalStore } from './canonical-store';
import { createFingerprint } from './fingerprint';

export interface RecallHit {
  record: MemoryRecord;
  score: number;
  matchedTerms: string[];
  /** Where this hit came from: 'adapter' (federated scan) or 'canonical' (L2 BM25 store). */
  origin: 'adapter' | 'canonical';
}

export interface RecallOptions {
  query: string;
  sources?: readonly string[];
  limit?: number;
  since?: Date;
  /**
   * Path to the canonical SQLite store. When supplied AND the file exists,
   * BM25 hits from the store are merged with adapter results via Reciprocal
   * Rank Fusion (k=60). Cold-start safe: a missing file is silently skipped.
   *
   * Spec: specs/m3-canonical-store-mini-spec.md §5.
   */
  canonicalStorePath?: string;
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

/** Reciprocal Rank Fusion constant — Cormack/Buettcher's 2009 default. */
const RRF_K = 60;

// Federation: per-adapter scans + (optionally) canonical-store BM25, fused
// via Reciprocal Rank Fusion. RRF avoids normalising incompatible scores
// (BM25 lower-better vs TF×recency higher-better) and is robust across
// query lengths.
//
// Cold start: when canonicalStorePath is omitted OR the file does not
// exist, the canonical arm is skipped entirely and adapter ranking remains
// the M1 TF×recency formula. This means existing tests + behaviour stay
// unchanged for users who never run `omem remember`.
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
            origin: 'adapter',
          });
        }
      }
      return { adapterId: adapter.id, hits };
    }),
  );

  const adapterHits: RecallHit[] = [];
  const failures: AdapterFailure[] = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      adapterHits.push(...result.value.hits);
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failures.push({ adapterId: 'unknown', error: reason });
    }
  }

  // Adapter ranking: TF×recency desc → timestamp desc → source asc.
  adapterHits.sort(compareAdapterHits);

  const canonicalHits = recallFromCanonical(opts, terms);

  // Without a canonical arm, return the adapter ranking verbatim — preserves
  // M1 score semantics and existing test expectations.
  if (canonicalHits === null) {
    return {
      hits: adapterHits.slice(0, opts.limit ?? 50),
      failures,
      partial: failures.length > 0 && adapterHits.length > 0,
    };
  }

  const fused = fuseRRF(adapterHits, canonicalHits);
  return {
    hits: fused.slice(0, opts.limit ?? 50),
    failures,
    partial: failures.length > 0 && fused.length > 0,
  };
}

function compareAdapterHits(a: RecallHit, b: RecallHit): number {
  if (b.score !== a.score) return b.score - a.score;
  const tsDiff = b.record.timestamp.getTime() - a.record.timestamp.getTime();
  if (tsDiff !== 0) return tsDiff;
  return a.record.source.localeCompare(b.record.source);
}

function recallFromCanonical(opts: RecallOptions, terms: readonly string[]): RecallHit[] | null {
  const path = opts.canonicalStorePath;
  if (path === undefined || path.length === 0) return null;
  if (!existsSync(path)) return null;
  let store: CanonicalStore;
  try {
    store = CanonicalStore.open({ path, readonly: true });
  } catch {
    // Cold/corrupt DB on disk; treat as "canonical unavailable" rather than
    // failing the whole recall. Federation still works.
    return null;
  }
  try {
    const recallQuery: { query: string; limit?: number; since?: Date } = {
      query: opts.query,
      limit: 200,
    };
    if (opts.since !== undefined) recallQuery.since = opts.since;
    const rows = store.recall(recallQuery);
    return rows.map<RecallHit>((row) => ({
      record: row.record,
      score: row.score,
      matchedTerms: terms.filter((t) => row.record.text.toLowerCase().includes(t)),
      origin: 'canonical',
    }));
  } finally {
    store.close();
  }
}

/**
 * Reciprocal Rank Fusion of adapter and canonical lists. Each list contributes
 * 1/(RRF_K + rank_in_list) per record, summed across lists, then sorted desc.
 * Records appearing in both lists (matched by content fingerprint) get a
 * combined boost — this is the dedup *and* relevance-fusion path.
 *
 * The returned RecallHit retains the more-recent record body; if a hit appears
 * in both, the canonical copy wins (it's the curated version).
 */
function fuseRRF(adapterList: RecallHit[], canonicalList: RecallHit[]): RecallHit[] {
  const byFingerprint = new Map<
    string,
    { hit: RecallHit; rrf: number; sources: Set<'adapter' | 'canonical'> }
  >();

  const accumulate = (list: RecallHit[]) => {
    list.forEach((hit, idx) => {
      const fp = createFingerprint(hit.record);
      const contribution = 1 / (RRF_K + idx + 1);
      const existing = byFingerprint.get(fp);
      if (existing === undefined) {
        byFingerprint.set(fp, {
          hit,
          rrf: contribution,
          sources: new Set([hit.origin]),
        });
      } else {
        existing.rrf += contribution;
        existing.sources.add(hit.origin);
        // Canonical record wins as the canonical copy if both exist.
        if (hit.origin === 'canonical') existing.hit = hit;
      }
    });
  };

  accumulate(adapterList);
  accumulate(canonicalList);

  const merged = Array.from(byFingerprint.values()).map(({ hit, rrf }) => ({
    ...hit,
    score: rrf,
  }));

  merged.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tsDiff = b.record.timestamp.getTime() - a.record.timestamp.getTime();
    if (tsDiff !== 0) return tsDiff;
    const srcCmp = a.record.source.localeCompare(b.record.source);
    if (srcCmp !== 0) return srcCmp;
    return a.record.id.localeCompare(b.record.id);
  });

  return merged;
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
