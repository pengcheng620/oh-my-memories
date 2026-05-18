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
    // Replace anything that isn't a word character with whitespace, then split.
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"`).join(' OR ');
}
