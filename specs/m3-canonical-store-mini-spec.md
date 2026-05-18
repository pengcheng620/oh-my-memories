# M3 Canonical Store — mini-spec

**Scope**: Layer-2 SQLite-backed canonical memory (`packages/core/src/canonical-store.ts`), BM25 retrieval via FTS5 replacing naive federation scoring for indexed rows, lazy singleton wiring from `packages/core/src/federation.ts`, and `omem remember <text>`. Bun-only runtime matches shipping posture (`bun` CLI + `bun build --compile`); Node fallback is explicitly out of scope.

**Status**: Ready to implement after FTS5 capability probe (§Open Questions).

---

## 1. SQLite driver decision

**Chosen**: `bun:sqlite` (Bun built-in module — tracks Bun runtime version; pin minimum Bun in `package.json` / CI matrix when implementation lands).

**Rejected**: `better-sqlite3` — npm native addon requires per-platform `.node` prebuilds; `bun build --compile` needs `--asset-naming` / `--compile-target` gymnastics and still couples release artifacts to native ABI. That conflicts with **primary** distribution as a single compiled binary.

**Rejected (not chosen)**: Abstract driver shim defaulting to `bun:sqlite` — adds indirection without a supported second runtime today; **revisit only** if Node becomes a tier-1 target.

**Open verification (blocking before merge)**: Confirm the linked SQLite in the minimum supported Bun build was compiled **with FTS5 enabled** (`sqlite_compileoption_used('FTS5')` = 1 at runtime). **Failure mode if missing**: abandon external-content FTS5 in that build → either (a) block M3 on Bun version bump that ships FTS5, or (b) document “L2 unavailable” and keep federation-only recall (last resort).

---

## 2. Schema

### 2.1 Primary key strategy

**Chosen**: SQLite `INTEGER PRIMARY KEY` on `mem_pk` (integer row alias) plus `record_id TEXT NOT NULL UNIQUE` (`MemoryRecord.id`) and `fingerprint TEXT NOT NULL UNIQUE` (dedup).

**Rejected**: PK = `fingerprint` — fingerprints are wide hex strings; worse btree locality vs integer rowids and awkward for `content_rowid` ergonomics.

**Rejected**: PK = `record_id` only — duplicates by content must dedup on **fingerprint**, not caller-supplied id; a separate unique fingerprint index is mandatory either way — integer PK keeps FTS `content_rowid` joins cheap.

### 2.2 Tokenizer

**Chosen**: FTS5 `unicode61` with `remove_diacritics 2` so queries fold accents consistently without porter stemming.

**Rejected**: `porter ascii` — English-centric stemming hides mismatches for code snippets / multilingual memories.

### 2.3 DDL — baseline migration (`001-canonical-init.sql`)

```sql
-- schema_meta: single authoritative row (see §3 — no history table)
CREATE TABLE schema_meta (
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE memories (
  mem_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  session_id TEXT,
  timestamp_ms INTEGER NOT NULL,
  role TEXT,
  text TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  fingerprint TEXT NOT NULL UNIQUE,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX idx_memories_source ON memories(source);
CREATE INDEX idx_memories_timestamp ON memories(timestamp_ms);
CREATE INDEX idx_memories_session ON memories(session_id);

CREATE VIRTUAL TABLE memories_fts USING fts5(
  text,
  content='memories',
  content_rowid='mem_pk',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, text) VALUES (NEW.mem_pk, NEW.text);
END;

CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, text) VALUES('delete', OLD.mem_pk, OLD.text);
END;

CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, text) VALUES('delete', OLD.mem_pk, OLD.text);
  INSERT INTO memories_fts(rowid, text) VALUES (NEW.mem_pk, NEW.text);
END;

INSERT INTO schema_meta(schema_version, created_at_ms) VALUES (1, CAST(strftime('%s','now') AS INTEGER) * 1000);
```

### 2.4 External-content vs contentless FTS

**Chosen**: `content='memories' content_rowid='mem_pk'` **external-content** FTS5 — `memories` remains the SSOT for full rows; FTS holds inverted index only.

**Rejected**: Contentless FTS (`INSERT INTO fts(...) VALUES(...)`) — duplicates long `text` in SQLite pages or forces reconstruct-from-row-only workflows without simplifying backups.

---

## 3. Schema versioning

**Chosen**: Monotonic integer `schema_version` in **`schema_meta`** (exactly one row). Each bump adds `packages/core/src/migrations/002-<slug>.sql`, `003-…`, zero-padded to three digits.

**Rejected**: Recording migration history rows (`migration_log`) — duplicates git + checksum discipline without aiding rollback (SQLite rollback is whole-file backup / export).

### Migration runner contract

1. Open DB → `PRAGMA foreign_keys=ON`; `BEGIN IMMEDIATE`.
2. If `schema_meta` missing → apply **`001`** from empty file state (creates meta + tables).
3. Else read `schema_version`; expected next files must exist sequentially (`expectedVersion + 1` → file `00N-*.sql`).
4. Execute **exactly one file** per transaction; after success `UPDATE schema_meta SET schema_version = ?, …`.
5. **Idempotent files**: safe to re-run on empty partial state **only** when file begins with guards — preferred pattern: runner stores optional SHA256 of each applied file in code constants; **before** executing file N, verify file contents hash matches embedded manifest (**fails loudly** on mismatch → prevents drifted partial installs).
6. Missing expected next migration file → **throw** fatal error (`OMEM-E32-CANONICAL-SCHEMA` suggested — append to catalog with §6).
7. Future `schema_version` on disk **>** binary max → **throw** `OMEM-E33-CANONICAL-DB-NEWER` (user must upgrade `omem`).

---

## 4. Public TypeScript API

```ts
import type { MemoryRecord, MemoryRole } from '@oh-my-memories/adapter-sdk';

interface CanonicalStoreOptions {
  readonly path: string;
  readonly readonly?: boolean;
}

interface RememberInput {
  readonly text: string;
  readonly source?: string;
  readonly sessionId?: string;
  readonly role?: MemoryRole;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: Date;
}

interface RememberResult {
  readonly id: string;
  readonly fingerprint: string;
  readonly created: boolean;
}

interface RecallQuery {
  readonly query: string;
  readonly limit?: number;
  readonly since?: Date;
}

interface RecallHitFromStore {
  readonly record: MemoryRecord;
  readonly score: number;
  readonly snippet: string;
}

class CanonicalStore {
  static open(opts: CanonicalStoreOptions): CanonicalStore;
  remember(input: RememberInput): RememberResult;
  recall(q: RecallQuery): readonly RecallHitFromStore[];
  scan(opts?: { since?: Date; limit?: number }): AsyncIterable<MemoryRecord>;
  close(): void;
}
```

### 4.1 `static open`

`mkdir -p` parent unless readonly → `new Database(path, { readonly })` (`bun:sqlite`) → run migrations unless readonly (readonly requires existing schema). `PRAGMA busy_timeout=5000`; `journal_mode=WAL` when writable.

### 4.2 `remember`

1. Build `MemoryRecord` with `id = randomUUID()`, `source = input.source ?? 'omem'`, timestamps normalized to UTC ms.
2. `fp = createFingerprint(record)` (`packages/core/src/fingerprint.ts` — same semantics as `specs/iwritable-adapter-mini-spec.md` §3.3).
3. SQL dedup path:

```sql
SELECT record_id FROM memories WHERE fingerprint = ? LIMIT 1;
```

If row exists → `return { id: existing, fingerprint: fp, created: false }`.

4. Else insert:

```sql
INSERT INTO memories (
  record_id, source, session_id, timestamp_ms, role, text, metadata_json,
  fingerprint, created_at_ms, updated_at_ms
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
```

Triggers maintain FTS.

### 4.3 `recall`

Bind `sinceMs` as `0` when `since` omitted. Parameters: `$q`, `$sinceMs`, `$limit` (default 50).

```sql
SELECT
  m.mem_pk,
  m.record_id,
  m.source,
  m.session_id,
  m.timestamp_ms,
  m.role,
  m.text,
  m.metadata_json,
  bm25(memories_fts) AS bm25_score,
  snippet(memories_fts, 0, '[', ']', '…', 48) AS snippet
FROM memories_fts
JOIN memories AS m ON m.mem_pk = memories_fts.rowid
WHERE memories_fts MATCH ?
  AND m.timestamp_ms >= ?
ORDER BY bm25_score ASC
LIMIT ?;
```

**Score semantics**: expose raw `bm25_score` (**lower is better**, SQLite FTS5 convention). Federation fusion uses **rank order only** (§5).

### 4.4 `scan`

Bind `sinceMs` as `0` when `since` omitted.

```sql
SELECT record_id, source, session_id, timestamp_ms, role, text, metadata_json
FROM memories
WHERE timestamp_ms >= ?
ORDER BY timestamp_ms ASC
LIMIT ?;
```

Map rows → `MemoryRecord` (`metadata_json` parsed).

### 4.5 `close`

`database.close()`; subsequent ops undefined.

---

## 5. Wiring into `federation.recall`

**Chosen fusion**: **Reciprocal Rank Fusion (RRF)** with `k = 60` — avoids normalizing incompatible scores (BM25 lower-better vs positive TF×recency).

**Rejected**: Min-max normalization of BM25 vs TF scores — brittle across corpora and query lengths.

### Algorithm

**Lazy singleton** `getCanonicalStore()` in `federation.ts`: `${OMEM_HOME:-~/.omem}/canonical.db`. **Recall path**: if the DB file **does not exist**, skip canonical retrieval entirely (**no mkdir / no empty DB creation**) — merged results match adapter-only recall. **Remember path**: first writable `CanonicalStore.open` mkdir + migrations creates `canonical.db` idempotently.

When canonical arm runs: **`L_c`** = BM25 recall order (best-first); **`L_a`** = existing adapter TF×recency sort. **RRF** `k=60`, `h = fingerprint(record)`: `score_rrf[h] += Σ 1/(k+rank)` over lists containing `h` (1-based ranks). Final sort: `score_rrf` desc → newer `timestamp` → `(source,id)`. **`RecallHit.score = score_rrf`**; fill `matchedTerms` via tokenizer parity for canonical rows.

---

## 6. `omem remember <text>` CLI

### Args

| Arg | Meaning |
|-----|---------|
| `<text>` | Required positional |
| `--source <id>` | Default `omem` |
| `--session <id>` | Optional |
| `--metadata '<json>'` | Single JSON object |
| `--timestamp <iso>` | Optional |
| `--json` | stdout `RememberResult` |

### Human output

- `remembered <id> (created)`
- `remembered <id> (already known)`

### Errors (append-only catalog)

| Code | When |
|------|------|
| `OMEM-E29-REMEMBER-EMPTY` | Whitespace-only `<text>` |
| `OMEM-E30-REMEMBER-METADATA` | `--metadata` not valid JSON object |
| `OMEM-E31-CANONICAL-STORE` | SQLite logic error / corruption / busy after timeout |
| `OMEM-E11-IO` | mkdir/open/write failures reaching DB path |

Exit codes align with `docs/CLI.md`: usage-like → `2`; I/O → `1`.

---

## 7. Testing strategy

- **Migrations**: tmp DB per test; assert `schema_meta` version after each bump; rerun runner → checksum mismatch path fails loudly.
- **`remember` dedup**: duplicate fingerprint → `created:false`, stable `record_id`.
- **`recall`**: fixture corpus → snapshot BM25 rank order.
- **CLI**: `omem remember` → `omem recall` round-trip when query unique.
- **Cross-platform**: Windows + macOS/Linux CI — paths, WAL locks, delayed `EBUSY` (same class of issues as M2.B Bun `tar` on Windows).

## Open Questions / Followups

1. **FTS5 enabled** in Bun’s SQLite (`sqlite_compileoption_used`).
2. **MATCH / query escaping** — helper for user literals vs FTS operators.
3. **`scan` back-pressure** — batch `AsyncIterable` yields on large tables.
