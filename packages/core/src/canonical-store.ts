// SQLite + FTS5 canonical store — the L2 engine. See
// specs/m3-canonical-store-mini-spec.md for the full design rationale.
//
// Why bun:sqlite over better-sqlite3: native addons require per-platform
// prebuilds and break `bun build --compile`. bun:sqlite ships with the Bun
// runtime and includes FTS5 (verified via scripts/probe-fts5.mjs).
//
// Runtime gating: this module is bundled into the Node-targeted CJS for
// `npx oh-my-memories`. `bun:sqlite` does NOT exist under Node, so we resolve
// the Database class lazily inside CanonicalStore.open(). Adapter-only
// commands (recall without remember, init, scan, doctor, mcp, …) keep working
// under Node; the canonical-store-touching commands (remember, recall WITH
// canonical.db) emit OMEM-E32 telling the user to use the Bun-compiled binary.

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { MemoryRecord, MemoryRole } from '@oh-my-memories/adapter-sdk';
import { createFingerprint } from './fingerprint';
import { runMigrations } from './migrations';

// Database-shaped subset we actually use. Avoids depending on the bun:sqlite
// type module (which Node's tsc otherwise can't resolve). The `transaction`
// method is also exposed because runMigrations() needs it to wrap each
// migration in a transaction.
interface SqliteDatabase {
  exec(sql: string): unknown;
  query(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] };
  run(sql: string, params?: unknown[]): unknown;
  transaction(fn: () => void): () => void;
  close(): void;
}

interface SqliteDatabaseCtor {
  new (path: string, opts?: { readonly?: boolean }): SqliteDatabase;
}

// Memoised — module load is expensive enough that we don't want to redo it
// for every CanonicalStore.open() call.
let cachedDatabase: SqliteDatabaseCtor | null = null;

function loadBunSqlite(): SqliteDatabaseCtor {
  if (cachedDatabase !== null) return cachedDatabase;

  // Fast-fail under Node: a clear hint beats a confusing module-not-found.
  const isBun =
    typeof process !== 'undefined' &&
    typeof (process.versions as { bun?: string }).bun === 'string';
  if (!isBun) {
    throw new CanonicalRuntimeError(
      'Canonical store requires the Bun runtime (or the Bun-compiled `omem` binary). Install Bun (https://bun.sh) and re-run, or use one of the prebuilt binaries from the GitHub releases page.',
    );
  }

  // createRequire is portable: works in both Node CJS and Bun ESM. Under Bun
  // it resolves the `bun:sqlite` builtin synchronously. We hide the literal
  // string behind a variable so the Node-targeted bundler doesn't try to
  // statically resolve `bun:sqlite` at build time.
  try {
    const requireFromHere = createRequire(import.meta.url);
    const moduleName = 'bun:sqlite';
    const mod = requireFromHere(moduleName) as { Database: SqliteDatabaseCtor };
    cachedDatabase = mod.Database;
    return mod.Database;
  } catch (err) {
    throw new CanonicalRuntimeError(
      `Failed to load bun:sqlite: ${(err as Error).message}. Use the Bun-compiled \`omem\` binary or install Bun (https://bun.sh).`,
    );
  }
}

export class CanonicalRuntimeError extends Error {
  readonly code = 'OMEM-E34-CANONICAL-RUNTIME' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalRuntimeError';
  }
}

export interface CanonicalStoreOptions {
  readonly path: string;
  /** When true: open without running migrations and refuse writes. */
  readonly readonly?: boolean;
}

export interface RememberInput {
  readonly text: string;
  readonly source?: string;
  readonly sessionId?: string;
  readonly role?: MemoryRole;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: Date;
}

export interface RememberResult {
  readonly id: string;
  readonly fingerprint: string;
  readonly created: boolean;
}

export interface RecallQueryFromStore {
  readonly query: string;
  readonly limit?: number;
  readonly since?: Date;
}

export interface RecallHitFromStore {
  readonly record: MemoryRecord;
  /**
   * SQLite FTS5 BM25 score. *Lower is better.* Federation fusion converts
   * this into rank order before merging — see RRF in `recall()` of
   * federation.ts.
   */
  readonly score: number;
  readonly snippet: string;
}

export interface CanonicalScanOptions {
  readonly since?: Date;
  readonly limit?: number;
}

export interface PruneOptions {
  readonly olderThan?: Date;
  readonly deduplicate?: boolean;
}

export interface PruneResult {
  readonly deleted: number;
  readonly remaining: number;
}

export interface EmbeddingRow {
  readonly recordId: string;
  readonly record: MemoryRecord;
  readonly vector: Float32Array;
}

export interface SemanticHit {
  readonly record: MemoryRecord;
  readonly similarity: number;
}

export class CanonicalStore {
  private readonly db: SqliteDatabase;
  private readonly readonly: boolean;

  private constructor(db: SqliteDatabase, readonly: boolean) {
    this.db = db;
    this.readonly = readonly;
  }

  static open(opts: CanonicalStoreOptions): CanonicalStore {
    const Database = loadBunSqlite();
    const isReadonly = opts.readonly === true;
    if (!isReadonly) {
      // Ensure the parent directory exists; bun:sqlite won't create it for us.
      mkdirSync(dirname(opts.path), { recursive: true });
    }
    const db = new Database(opts.path, isReadonly ? { readonly: true } : undefined);
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA foreign_keys = ON');
    if (!isReadonly) {
      // WAL would be the obvious choice, but `omem` is single-user single-
      // process and Windows holds WAL/SHM file handles open even after
      // close() — that wedges test cleanup and `omem migrate` round-trips.
      // DELETE mode is plenty fast for our write volume and stays portable.
      db.exec('PRAGMA journal_mode = DELETE');
      db.exec('PRAGMA synchronous = NORMAL');
      runMigrations(db);
    }
    return new CanonicalStore(db, isReadonly);
  }

  remember(input: RememberInput): RememberResult {
    if (this.readonly) {
      throw new Error('CanonicalStore opened readonly; cannot remember()');
    }
    const text = input.text;
    if (text.trim().length === 0) {
      throw new Error('remember() requires non-empty text');
    }

    const timestamp = input.timestamp ?? new Date();
    const fingerprint = createFingerprint({
      text,
      timestamp,
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    });

    // Dedup by fingerprint. The lookup is a single primary index hit so the
    // happy path of "remember duplicate" is cheap.
    const existing = this.db
      .query('SELECT record_id FROM memories WHERE fingerprint = ? LIMIT 1')
      .get(fingerprint) as { record_id: string } | null | undefined;
    if (existing !== null && existing !== undefined) {
      return { id: existing.record_id, fingerprint, created: false };
    }

    const id = randomUUID();
    const nowMs = Date.now();
    const source = input.source ?? 'omem';
    const sessionId = input.sessionId ?? null;
    const role = input.role ?? null;
    const metadata = input.metadata !== undefined ? JSON.stringify(input.metadata) : '{}';

    this.db.run(
      `INSERT INTO memories (
        record_id, source, session_id, timestamp_ms, role, text, metadata_json,
        fingerprint, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, source, sessionId, timestamp.getTime(), role, text, metadata, fingerprint, nowMs, nowMs],
    );

    return { id, fingerprint, created: true };
  }

  recall(q: RecallQueryFromStore): readonly RecallHitFromStore[] {
    const matchExpr = sanitizeMatchExpression(q.query);
    if (matchExpr.length === 0) return [];

    const sinceMs = q.since !== undefined ? q.since.getTime() : 0;
    const limit = q.limit ?? 50;

    const rows = this.db
      .query(
        `SELECT
           m.record_id,
           m.source,
           m.session_id,
           m.timestamp_ms,
           m.role,
           m.text,
           m.metadata_json,
           bm25(memories_fts) AS bm25_score,
           snippet(memories_fts, 0, '[', ']', '…', 16) AS snippet
         FROM memories_fts
         JOIN memories AS m ON m.mem_pk = memories_fts.rowid
         WHERE memories_fts MATCH ?
           AND m.timestamp_ms >= ?
         ORDER BY bm25_score ASC
         LIMIT ?`,
      )
      .all(matchExpr, sinceMs, limit) as Array<{
      record_id: string;
      source: string;
      session_id: string | null;
      timestamp_ms: number;
      role: string | null;
      text: string;
      metadata_json: string;
      bm25_score: number;
      snippet: string;
    }>;

    return rows.map<RecallHitFromStore>((row) => ({
      record: rowToRecord(row),
      score: row.bm25_score,
      snippet: row.snippet,
    }));
  }

  async *scan(opts: CanonicalScanOptions = {}): AsyncIterable<MemoryRecord> {
    const sinceMs = opts.since !== undefined ? opts.since.getTime() : 0;
    const limit = opts.limit ?? Number.MAX_SAFE_INTEGER;
    const rows = this.db
      .query(
        `SELECT record_id, source, session_id, timestamp_ms, role, text, metadata_json
         FROM memories
         WHERE timestamp_ms >= ?
         ORDER BY timestamp_ms ASC
         LIMIT ?`,
      )
      .all(sinceMs, limit) as Array<{
      record_id: string;
      source: string;
      session_id: string | null;
      timestamp_ms: number;
      role: string | null;
      text: string;
      metadata_json: string;
    }>;
    for (const row of rows) {
      yield rowToRecord(row);
    }
  }

  /** Total record count — useful for tests and `omem doctor`. */
  count(): number {
    const row = this.db.query('SELECT COUNT(*) AS n FROM memories').get() as { n: number };
    return row.n;
  }

  /**
   * Remove records older than `olderThan`, or remove duplicate fingerprints
   * (keeping the newest). Returns the number of records deleted.
   */
  prune(opts: PruneOptions): PruneResult {
    if (this.readonly) {
      throw new Error('CanonicalStore opened readonly; cannot prune()');
    }

    let deleted = 0;

    if (opts.olderThan !== undefined) {
      const cutoffMs = opts.olderThan.getTime();
      const row = this.db
        .query('SELECT COUNT(*) AS n FROM memories WHERE timestamp_ms < ?')
        .get(cutoffMs) as { n: number };
      deleted += row.n;
      this.db.run('DELETE FROM memories WHERE timestamp_ms < ?', [cutoffMs]);
    }

    if (opts.deduplicate) {
      const dupeRow = this.db
        .query(
          `SELECT COUNT(*) AS n FROM memories
           WHERE mem_pk NOT IN (
             SELECT MAX(mem_pk) FROM memories GROUP BY fingerprint
           )`,
        )
        .get() as { n: number };
      deleted += dupeRow.n;
      this.db.run(
        `DELETE FROM memories
         WHERE mem_pk NOT IN (
           SELECT MAX(mem_pk) FROM memories GROUP BY fingerprint
         )`,
      );
    }

    const remaining = this.count();
    return { deleted, remaining };
  }

  // ---------- Embedding methods ----------

  storeEmbedding(recordId: string, model: string, vector: Float32Array): void {
    if (this.readonly) {
      throw new Error('CanonicalStore opened readonly; cannot storeEmbedding()');
    }
    const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
    this.db.run('INSERT OR REPLACE INTO embeddings (record_id, model, vector) VALUES (?, ?, ?)', [
      recordId,
      model,
      buf,
    ]);
  }

  /**
   * Brute-force cosine similarity search over all embeddings for a given model.
   * Returns the top `limit` records sorted by descending similarity.
   *
   * This is the fallback path when sqlite-vec is unavailable. For our expected
   * scale (hundreds to low thousands of canonical records), this completes in
   * sub-millisecond time.
   */
  searchByVector(queryVector: Float32Array, model: string, limit: number): SemanticHit[] {
    const rows = this.db
      .query(
        `SELECT e.record_id, e.vector,
                m.source, m.session_id, m.timestamp_ms, m.role, m.text, m.metadata_json
         FROM embeddings e
         JOIN memories m ON m.record_id = e.record_id
         WHERE e.model = ?`,
      )
      .all(model) as Array<{
      record_id: string;
      vector: Buffer;
      source: string;
      session_id: string | null;
      timestamp_ms: number;
      role: string | null;
      text: string;
      metadata_json: string;
    }>;

    const hits: SemanticHit[] = [];
    for (const row of rows) {
      const stored = new Float32Array(
        row.vector.buffer,
        row.vector.byteOffset,
        row.vector.byteLength / 4,
      );
      const sim = cosineSim(queryVector, stored);
      if (sim > 0) {
        hits.push({ record: rowToRecord(row), similarity: sim });
      }
    }

    hits.sort((a, b) => b.similarity - a.similarity);
    return hits.slice(0, limit);
  }

  /** Number of embeddings stored for a given model. */
  countEmbeddings(model?: string): number {
    if (model !== undefined) {
      const row = this.db
        .query('SELECT COUNT(*) AS n FROM embeddings WHERE model = ?')
        .get(model) as { n: number };
      return row.n;
    }
    const row = this.db.query('SELECT COUNT(*) AS n FROM embeddings').get() as { n: number };
    return row.n;
  }

  /** Record IDs that have a memory but no embedding for the given model. */
  unembeddedRecordIds(model: string, limit: number): string[] {
    const rows = this.db
      .query(
        `SELECT m.record_id FROM memories m
         LEFT JOIN embeddings e ON e.record_id = m.record_id AND e.model = ?
         WHERE e.record_id IS NULL
         LIMIT ?`,
      )
      .all(model, limit) as Array<{ record_id: string }>;
    return rows.map((r) => r.record_id);
  }

  /** Get text for a batch of record IDs (for backfill embedding). */
  getTexts(recordIds: string[]): Array<{ id: string; text: string }> {
    if (recordIds.length === 0) return [];
    const placeholders = recordIds.map(() => '?').join(',');
    const rows = this.db
      .query(`SELECT record_id, text FROM memories WHERE record_id IN (${placeholders})`)
      .all(...recordIds) as Array<{ record_id: string; text: string }>;
    return rows.map((r) => ({ id: r.record_id, text: r.text }));
  }

  close(): void {
    this.db.close();
  }
}

function rowToRecord(row: {
  record_id: string;
  source: string;
  session_id: string | null;
  timestamp_ms: number;
  role: string | null;
  text: string;
  metadata_json: string;
}): MemoryRecord {
  const record: MemoryRecord = {
    id: row.record_id,
    source: row.source,
    timestamp: new Date(row.timestamp_ms),
    text: row.text,
  };
  if (row.session_id !== null) (record as { sessionId?: string }).sessionId = row.session_id;
  if (row.role !== null) (record as { role?: MemoryRole }).role = row.role as MemoryRole;
  if (row.metadata_json !== '{}') {
    try {
      const meta = JSON.parse(row.metadata_json) as Record<string, unknown>;
      if (meta && typeof meta === 'object') {
        (record as { metadata?: Record<string, unknown> }).metadata = meta;
      }
    } catch {
      // Corrupt metadata: drop it rather than fail recall. Fingerprint
      // dedup means we'll heal the row next time it's rewritten.
    }
  }
  return record;
}

/**
 * FTS5 treats ", *, : as operators. Naively passing a user query straight
 * into MATCH causes "syntax error in MATCH" for anything containing
 * punctuation. We strip operators and wrap each remaining token in quotes
 * so the user always gets a literal phrase-OR query.
 */
function sanitizeMatchExpression(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"`).join(' OR ');
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] as number;
    const bi = b[i] as number;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
