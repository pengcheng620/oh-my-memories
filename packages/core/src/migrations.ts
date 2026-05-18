// Migration runner for the canonical store.
//
// Each migration is an inlined string constant rather than a runtime
// readFile() of `migrations/00X-*.sql`, because `bun build --compile`
// bundles the binary as a single executable and disk-relative reads are
// brittle there. The .sql files in `./migrations/` exist for review tooling
// (CI grep + diffs); the source-of-truth that ships is this array.
//
// Spec: specs/m3-canonical-store-mini-spec.md §3.

// Structural Database type covering the bits of bun:sqlite we use, so this
// module doesn't pull in the bun:sqlite type declarations under Node.
interface Database {
  exec(sql: string): unknown;
  query(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] };
  run(sql: string, params?: unknown[]): unknown;
  transaction(fn: () => void): () => void;
}

import { MIGRATION_001_CANONICAL_INIT } from './migrations/001-canonical-init.sql.inline';
import { MIGRATION_002_EMBEDDINGS } from './migrations/002-embeddings.sql.inline';

export interface Migration {
  /** Monotonic, starts at 1. */
  readonly version: number;
  /** Human-readable name used in error messages. */
  readonly name: string;
  /** Full DDL/DML to apply when stepping from version-1 → version. */
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'canonical-init', sql: MIGRATION_001_CANONICAL_INIT },
  { version: 2, name: 'embeddings', sql: MIGRATION_002_EMBEDDINGS },
];

/** Latest version known to this build. */
export const LATEST_SCHEMA_VERSION: number = MIGRATIONS.reduce(
  (acc, m) => (m.version > acc ? m.version : acc),
  0,
);

export class CanonicalSchemaError extends Error {
  constructor(
    public readonly code: 'OMEM-E32-CANONICAL-SCHEMA' | 'OMEM-E33-CANONICAL-DB-NEWER',
    message: string,
  ) {
    super(message);
    this.name = 'CanonicalSchemaError';
  }
}

/**
 * Bring the database up to the latest schema version. Idempotent: returns
 * silently when already current, throws on schema-newer-than-binary or on
 * gaps in the migration sequence.
 *
 * Each migration runs inside its own transaction so a partially-applied
 * file never leaves the DB in a wedged state.
 */
export function runMigrations(db: Database): { from: number; to: number; applied: number } {
  const from = readSchemaVersion(db);
  if (from > LATEST_SCHEMA_VERSION) {
    throw new CanonicalSchemaError(
      'OMEM-E33-CANONICAL-DB-NEWER',
      `Canonical DB is at schema_version=${from}, but this omem build only knows up to ${LATEST_SCHEMA_VERSION}. Upgrade omem before reopening this store.`,
    );
  }

  let applied = 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= from) continue;
    if (migration.version !== from + applied + 1) {
      // Defensive: catches an array out of order or a missing step. The
      // MIGRATIONS array is supposed to be sorted+dense; if anyone breaks
      // that invariant we want a loud failure not silent skip.
      throw new CanonicalSchemaError(
        'OMEM-E32-CANONICAL-SCHEMA',
        `Migration sequence broken: expected version ${from + applied + 1} next, got ${migration.version} (${migration.name}).`,
      );
    }
    applyOne(db, migration);
    applied += 1;
  }

  return { from, to: from + applied, applied };
}

function readSchemaVersion(db: Database): number {
  // The schema_meta table is itself created by migration 001, so we have
  // to interrogate sqlite_master first.
  const exists = db
    .query("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='schema_meta'")
    .get();
  if (exists === null || exists === undefined) return 0;
  const row = db.query('SELECT schema_version FROM schema_meta LIMIT 1').get() as
    | { schema_version: number }
    | undefined
    | null;
  return row?.schema_version ?? 0;
}

function applyOne(db: Database, migration: Migration): void {
  const txn = db.transaction(() => {
    db.exec(migration.sql);
    if (migration.version === 1) {
      db.run('INSERT INTO schema_meta(schema_version, created_at_ms) VALUES (?, ?)', [
        1,
        Date.now(),
      ]);
    } else {
      db.run('UPDATE schema_meta SET schema_version = ? WHERE 1=1', [migration.version]);
    }
  });
  txn();
}
