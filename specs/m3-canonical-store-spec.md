# M3 Canonical Store — Schema & Driver Specification

> **Status**: Draft · implementation reference for M3 (`packages/core/canonical-store`)  
> **Owner**: oh-my-memories core team  
> **Date**: 2026-05-15  
> **Runtime**: Bun 1.3.8 primary · Node ≥ 20 npm consumers (`npx oh-my-memories`)  
> **TypeScript**: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`

This document freezes the **SQLite + FTS5 (BM25)** “Layer 2” engine contract: DDL, migrations, merge semantics with federation, file locations, drivers, optional vector extension timing, and test obligations.

Upstream sources of intent:

| Source | Relevance |
|--------|-----------|
| `packages/adapter-sdk/src/index.ts` | Canonical `MemoryRecord` shape all rows must round-trip |
| `packages/core/src/federation.ts` | M1 scoring (naive TF + recency); M3 replaces ranking for L2 with BM25; merge uses RRF |
| `packages/cli/src/platform/paths.ts` | **Authoritative DB path** — already reserves `index.sqlite` under `OMEM_HOME` / `~/.omem` |
| `docs/ARCHITECTURE.md` | L2 stores `index.sqlite`, FTS5, optional sqlite-vec later |
| `specs/spec.md` §10 | BM25 + optional sqlite-vec + RRF + schema versioning |

Non-negotiable: **Schema upgrades (M3.1+) must not drop user data** — forward migrations only, additive by default.

---

## 1. SQLite driver decision: `bun:sqlite` vs `better-sqlite3`

### 1.1 Facts (Bun 1.3.x)

- Bun exposes `import { Database } from "bun:sqlite"` with `query` / `prepare` / `run` / `transaction` / `close` (see Bun runtime SQLite docs).
- Bun’s embedded SQLite build enables **`SQLITE_ENABLE_FTS5`**, **`SQLITE_ENABLE_JSON1`**, and related pragmas at compile time (per Bun’s `sqlite` build script in upstream docs) — **FTS5 + JSON1 are available in `bun:sqlite` without shipping a separate native addon**.
- **Node.js does not implement `bun:sqlite`**. Any code path that `import`s `bun:sqlite` is **Bun-only**.

### 1.2 `better-sqlite3` (npm)

- Mature synchronous API; **native addon** with prebuilds for common Node platforms.
- **Works on Node 20+**; under Bun it can work when the native binary matches, but adds **compile/prebuild fragility** and duplicates SQLite already inside Bun.
- FTS5: available when linked SQLite is built with FTS5 (default in `better-sqlite3` distributions).

### 1.3 Do we need Node-only npm consumers?

**Yes.** M0.5 / distribution plan includes `npx oh-my-memories` on a clean machine. That implies:

- The published package **must execute meaningful functionality under Node**, not only under Bun.
- However: the **core library** (`@oh-my-memories/core`) can expose a **driver interface**; the CLI already targets Bun for dev but npm entry may spawn **Node** for `npx`.

**Policy decision (auto-chosen):**

| Runtime | Driver |
|---------|--------|
| **Bun** (dev, `bunx`, compiled Bun binary) | **`bun:sqlite`** — zero native addon, FTS5+JSON1 confirmed in Bun’s build |
| **Node** (`npx`, Node-based CI, partners) | **`better-sqlite3`** — only if/when M3 code runs under Node; same SQL + schema |

### 1.4 Recommended architecture: thin driver + one schema

Implement **`CanonicalStore`** against a tiny internal **`SqlConnection` port** (see §2 API) with two adapters:

1. `BunSqliteConnection` — wraps `bun:sqlite` `Database`
2. `BetterSqliteConnection` — wraps `better-sqlite3` `Database`

**Why not only `better-sqlite3`?**

- On Bun, shipping `better-sqlite3` reintroduces the **exact M3 open question** (“native addon + compiled binary friction”) for the **default** developer path.
- Defaulting dev + dogfood to `bun:sqlite` keeps M3 velocity high.

**Why not only `bun:sqlite`?**

- Breaks **Node `npx`** unless the whole published CLI is a **standalone compiled binary** for every platform and `npx` is demoted to a thin stub — out of scope for M3.0.

**Node fallback story (explicit):**

- **M3.0**: If the CLI process is **Node**, load `better-sqlite3` dynamically (optional dependency or regular dependency on the CLI package). If native install fails, `omem remember` / L2 features print a **Tier-2 error** (`OMEM-E12-SQLITE-NATIVE` — code to be added to catalog) with remediation: *install build tools* or *use Bun / compiled binary release*.
- **M3.0 does not** attempt `sql.js` fallback (WASM) — too slow for FTS5 write path; revisit only if enterprise Windows locked-down machines demand it.

**Single source of truth**: All DDL lives in **`schema/ddl.ts`** strings shared by both drivers; **no dialect drift**.

---

## 2. Schema design (DDL)

### 2.1 Design principles

1. **Every durable row is a `MemoryRecord`** (SDK) — no parallel “shadow” columns that omit `sessionId` / `role` / `metadata`.
2. **Primary stable identifier** `records.id` is **`{source}:{fingerprint}`** where `fingerprint` is **hex(SHA-256)** of a canonical payload (see §3). This matches the product language “`source:hash`”.
3. **FTS5** uses the **external content** pattern (`content='records'`, `content_rowid='rowid'`) + triggers to keep the index consistent.
4. **Timestamps** stored as **`INTEGER` Unix epoch milliseconds** (`ms since 1970-01-01 UTC`) for fast range scans + deterministic JSON export; convert to `Date` at API boundary.
5. **`metadata`** stored as **`TEXT` JSON** validated on write; query with `json_extract` when needed.

### 2.2 `schema_version`

Forward-only registry; one row per applied migration script.

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  applied_at INTEGER NOT NULL,
  label TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_version (id, version, applied_at, label)
VALUES (1, 0, strftime('%s','now') * 1000, 'bootstrap');
```

**Semantics**

- `version` is a **monotonic integer** (M3.0 = `1`, M3.1 = `2`, …).  
- There is **no down migration**. Old versions of omem refuse to open a **newer** DB (see §6).

### 2.3 `sources`

Registry of logical sources (for provenance, future stats, and foreign keys). Federation adapter ids (`claude-code`, `cursor`, …) appear when we optionally track them; **durable L2 writes** use `omem` (§3).

```sql
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('ide','mcp','saas','internal')),
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  notes TEXT
);

-- Seed the native canonical source at migration time (M3.0)
INSERT OR IGNORE INTO sources (id, category, display_name, created_at, updated_at, notes)
VALUES (
  'omem',
  'internal',
  'oh-my-memories canonical store',
  strftime('%s','now') * 1000,
  strftime('%s','now') * 1000,
  'Durable Layer-2 memory created via `omem remember` (M3+)'
);
```

### 2.4 `records`

```sql
CREATE TABLE IF NOT EXISTS records (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL REFERENCES sources(id) ON UPDATE CASCADE,
  session_id TEXT,
  role TEXT CHECK (role IS NULL OR role IN ('user','assistant','system','tool')),
  timestamp_ms INTEGER NOT NULL,
  text TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  content_sha256 TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_source_time
  ON records (source, timestamp_ms DESC);

CREATE INDEX IF NOT EXISTS idx_records_time
  ON records (timestamp_ms DESC);

CREATE INDEX IF NOT EXISTS idx_records_session
  ON records (session_id)
  WHERE session_id IS NOT NULL;
```

**Column notes**

| Column | Purpose |
|--------|---------|
| `id` | Canonical `MemoryRecord.id` — `{source}:{sha256}` |
| `content_sha256` | Hash of **UTF-8 `text` body** for dedup analytics & future migration |
| `metadata` | JSON object; `{}` if absent in API |
| `created_at_ms` / `updated_at_ms` | Local store bookkeeping (ingest vs edit) |

### 2.5 `records_fts` (FTS5 + BM25)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
  text,
  content='records',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
```

**Triggers** (keep FTS in sync — required for external content):

```sql
CREATE TRIGGER IF NOT EXISTS records_ai AFTER INSERT ON records BEGIN
  INSERT INTO records_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS records_ad AFTER DELETE ON records BEGIN
  INSERT INTO records_fts(records_fts, rowid, text) VALUES('delete', old.rowid, old.text);
END;

CREATE TRIGGER IF NOT EXISTS records_au AFTER UPDATE ON records BEGIN
  INSERT INTO records_fts(records_fts, rowid, text) VALUES('delete', old.rowid, old.text);
  INSERT INTO records_fts(rowid, text) VALUES (new.rowid, new.text);
END;
```

**Why `unicode61`?** Cross-platform consistent tokenization; matches “CLI users type ASCII” adequately for M3.0. Revisit `porter` stemmer in M3.2+ only with a **new migration** (tokenization change = reindex).

### 2.6 PRAGMA policy (startup)

Executed once when opening DB (both drivers):

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
```

Busy timeout: **`3000 ms`** (`PRAGMA busy_timeout=3000`) — local-first contention only.

---

## 3. Write path: `omem remember <text>`

### 3.1 Source id

**Chosen default: `omem`**

- Matches adapter naming style (`claude-code`, `codex` — short, stable string).
- Clearly **not** a third-party tool id; category in `sources` is `internal`.
- Avoids ambiguous names like `local` (too generic) or `omem-store` (redundant).

`MemoryRecord.source` for these rows is **`"omem"`**.

### 3.2 Record id format

**Format**

```
id = `omem:` + lowercase-hex SHA-256( canonical_bytes )
```

**Canonical bytes** (`UTF-8`) are the **JSON object** with keys sorted lexicographically:

```jsonc
{
  "body": "<exact remember text>",
  "salt": "<16-byte random hex OR empty for deterministic tests>",
  "sessionId": "<optional>",
  "ts": <timestamp_ms integer>
}
```

**Default (user CLI)**

- `salt` is **128-bit CSPRNG hex** so two identical remembers in the same millisecond **create distinct memories** (humans re-type lessons; we don’t dedupe aggressively).

**Deterministic mode (tests / import)**

- Pass `salt: ""` and fixed `ts` so golden vectors are stable.

**Why not UUID-only?** UUID does not anchor to content; we want **stable ids** for future export/sync (`M2.B` archive can reference `id`).

### 3.3 `MemoryRecord` mapping

| Field | Value |
|-------|-------|
| `id` | As §3.2 |
| `source` | `"omem"` |
| `sessionId` | CLI `--session <id>` if provided; else `undefined` (stored SQL `NULL`) |
| `timestamp` | CLI `--at <iso>` if present; else `new Date()` at commit time |
| `role` | Default **`'user'`** (the human invoked `remember`); override via `--role assistant` for agent-pack workflows |
| `text` | Argument string (trimmed, non-empty — empty rejected `OMEM-E13-REMEMBER-EMPTY`) |
| `metadata` | Base object: `{ "origin": "cli-remember", "argv0": "omem", "version": "<semver>" }` merged with `--meta key=value` repeats |

### 3.4 Transactions

- **Single remember**: `BEGIN IMMEDIATE;` → `INSERT OR REPLACE` into `records` → `COMMIT;`
- **Batch import (future)**: one transaction per **1000** rows or **250 ms** wall clock, whichever first, to keep WAL checkpoints smooth.

**Isolation**

- Writers use `IMMEDIATE` to fail fast on locks; readers default **snapshot** in WAL.

### 3.5 Conflicts

**Policy: `INSERT OR REPLACE` on `records.id`**

- Same id → **upsert** updates `text`, `metadata`, `timestamp_ms` (if caller supplies), always bumps `updated_at_ms`.
- Triggers rewrite FTS row.

**Hash collision**

- Cryptographically ignored; if hit, last write wins.

---

## 4. Read path: BM25 retrieval & federation merge

### 4.1 Querying the canonical store

**Parameters**

- `q` — raw user query string
- `limit` — cap (default 50)
- `since` — optional `timestamp_ms` floor

**Tokenization** for FTS `MATCH` must mirror CLI expectations:

1. Split on non-alphanumerics **in TS** (same spirit as M1 `tokenize()` in `federation.ts`, min length 2).  
2. Join tokens with `AND` for precision in M3.0 OR use `OR` + rank — **chosen: `AND` across tokens, empty query returns no L2 hits**.

**Example SQL** (parameters shown as `?`):

```sql
SELECT
  r.id,
  r.source,
  r.session_id AS sessionId,
  r.role,
  r.timestamp_ms AS timestampMs,
  r.text,
  r.metadata,
  bm25(records_fts) AS bm25,
  snippet(records_fts, 0, '«', '»', ' … ', 32) AS snippet
FROM records_fts
JOIN records r ON r.rowid = records_fts.rowid
WHERE records_fts MATCH ?
  AND (? IS NULL OR r.timestamp_ms >= ?)
ORDER BY bm25 ASC, r.timestamp_ms DESC, r.id ASC
LIMIT ?;
```

**Notes**

- **`bm25()` smaller is better** under SQLite’s auxiliary function — **ORDER BY bm25 ASC**.
- `snippet()` is optional for CLI display; human table uses it, JSON uses full `text` trimmed.

### 4.2 Federated path (unchanged data plane)

Until background indexing lands (§5), **federation still scans live JSONL/markdown**.

M1 scoring remains as **interim ranker** for federated hits only.

### 4.3 Reciprocal Rank Fusion (RRF)

We **do not** normalize BM25 scores to M1 TF scores.

**RRF score** for document `d`:

\[
\text{RRF}(d) = \sum_{i \in \text{rankers}} \frac{1}{k + \text{rank}_i(d)}
\]

- **`k = 60`** (standard constant from Cormack et al. / Microsoft RRF writeups)
- **`rank_i(d)`** is the **1-based index** of `d` in ranker \(i\)’s list, or **absent → omit sum term**

**Chosen rankers (M3.0)**

| Ranker ID | Ordering | Applies to |
|-----------|----------|------------|
| `L2` | `bm25 asc` → `timestamp desc` → `id asc` | Canonical FTS hits |
| `L1Fed` | M1 naive score **`desc`** → **`timestamp_ms desc`** → `source asc` | Live federation |

**Dedup key**

- Prefer `MemoryRecord.id` if present across tools; otherwise hash `(source,text,timestamp)`.

After dedup → compute RRF on the **combined candidate set** (**max(`limit * 15` from config, `limitFed + limitL2`)?** pragmatic: collect **≤ 200** per ranker pre-fusion).

**When to enable RRF**

- **Always in M3** when both L2 and ≥1 federation adapter produce candidates.
- **If L2 absent / empty**, fall back **pure federation** sort (today’s behaviour).
- **If federation yields zero** (offline), **`recall`** still serves L2.

### 4.4 Performance expectations & pruning triggers

SQLite FTS scales to **multi-million rows** comfortably on-disk for interactive CLI; WAL amortizes writes.

| Corpus size | Expected |
|-------------|----------|
| < 20k rows | trivial (< 20 ms query) |
| 20k–200k | still fine; ensure `ANALYZE` after bulk import |
| > 1M | run `omem doctor` warnings; plan **prune** subcommand (M3.2) |

**Prune policy (future, not M3.0)** — `omem prune --older-than 180d --dry-run`.

---

## 5. Background indexing

### 5.1 MVP decision

**M3.0 ships without file watcher.** Rationale: reliability + cross-platform churn; watchers don’t replace federation truth for IDE-native stores.

Optional **`omem index scan`** (**M3.1**) can materialize ephemeral federation rows into `_scratch` FTS — **explicitly deferred**.

### 5.2 `omem scan` vs canonical store

**Chosen policy: NO automatic writes from `omem scan` / federation read path**

- Federation remains **live** (`IBaseAdapter.scan`) — aligns with ARCHITECTURE M1 simplicity.
- **Only `omem remember` + future `import`/`migrate`** write durable rows — user intent boundary.

---

## 6. Schema versioning & migrations

### 6.1 Table format (summary)

Already defined in §2.2; runtime invariant:

```
schema_version.version == CURRENT_DDL_VERSION
```

### 6.2 Migration runner pattern

**Forward-only `up()` steps**

```
packages/core/src/migrations/
  0001_init.ts      // CREATE TABLE baseline
  0002_future.ts
```

Runner algorithm:

1. Open DB RW, `PRAGMA foreign_keys=ON`
2. Read `schema_version.version`
3. If `disk > binary` → **`throw OMEM-E14-DB-NEWER`** (require upgrade)
4. For each `m` where `m.version == disk+1 .. target`: run `m.up(conn)` inside **one transaction**
5. `UPDATE schema_version SET version=?, applied_at=?, label=?`

**No `down()`** — broken migrations restore from user backup (`M2.B` export).

### 6.3 Adding features (M3.1 embeddings example)

1. **New table** `record_vectors(rowid INTEGER PRIMARY KEY REFERENCES records(rowid), dim INTEGER NOT NULL, vec BLOB NOT NULL, model TEXT NOT NULL, created_at_ms INTEGER NOT NULL)`
2. **Optional** `sqlite-vec` virtual table **shadows** or references `record_vectors`
3. **Backfill job** populates vectors asynchronously; missing vector → omit ranker contribution in RRF (not fatal)

Never `DROP TABLE records`; avoid destructive `ALTER` — **`ALTER TABLE ADD COLUMN`** only.

### 6.4 Backwards compatibility

- Rows untouched across upgrades unless a migration explicitly **transforms copy-on-write**.
- Backup recommendation printed on first **`--apply`** style mutator (`omem remember` warns once if no export in 30d — future nicety).

---

## 7. Optional `sqlite-vec` integration — **Defer to M3.1**

### 7.1 Compatibility matrix (expected)

| Runtime | FTS5 built-in | `sqlite-vec` |
|---------|---------------|---------------|
| `bun:sqlite` | ✅ | ⚠ Requires loadable extension **if** Bun build permits `load_extension` + ships signed `vec0` binary per OS |
| `better-sqlite3` (Node) | ✅ | ⚠ Same extension load requirements |

Because extension loading is **environment-specific** and CI must stay green:

- **Default OFF**
- **`omem config set embeddings true`** + **`omem models pull <id>`** (future) gated behind explicit user opt-in.

### 7.2 Placeholder DDL (NOT executed in M3.0 migrations)

Document only:

```sql
-- M3.1+ (skipped in <=3.0 binaries)
-- CREATE VIRTUAL TABLE vec_records USING vec0(embedding FLOAT[768]);
```

### 7.3 RRF fusion with vectors

Adds ranker **`VecSim`** ordering by cosine desc; fuse with **`L2/BM25`** via same RRF formula.

### 7.4 Opt-in UX

1. Config flag `embeddingsEnabled: boolean` (default `false`)
2. CLI `omem index --embeddings` backfills
3. If disabled, **no extension load attempted** (fast startup)

---

## 8. File location & portability

### 8.1 Path resolution (authoritative)

Use existing helper (no new root):

```typescript
// packages/cli/src/platform/paths.ts (existing)
export function indexPath(options: ResolveHomeOptions = {}): string {
  return resolve(resolveOmemHome(options), 'index.sqlite');
}
```

`resolveOmemHome` respects **`OMEM_HOME`** override (`packages/cli/src/platform/home.ts`).

**Full path**

```
${resolveOmemHome()}/index.sqlite
```

Default:

- macOS / Linux: `~/.omem/index.sqlite`
- Windows: `%USERPROFILE%\.omem\index.sqlite`

### 8.2 Machine migration / backup

- **Yes — `index.sqlite` is the portable artifact** for Layer-2 memory.
- Pair with `config.json` for source preferences.
- **M2.B** `export` should zip: `index.sqlite` + `config.json` + manifest checksum.

---

## 9. Test strategy (M3 implementation gates)

### 9.1 Seven mandatory tests

1. **Open + migrate idempotent** — running migrations twice does not duplicate tables.
2. **Remember round-trip** — `remember` → row exists → `recall` finds text.
3. **FTS trigger correctness** — update `text` changes BM25 hit for new term.
4. **ORDER BY bm25 stable tie-break** — equal BM25 → `timestamp_ms desc` → `id asc`.
5. **RRF fusion ordering** — constructed lists L1/L2 where **neither raw list** places the best doc first but RRF does.
6. **`OMEM_HOME` isolation** — DB file lands under temp dir, not user home.
7. **Node driver smoke** (CI job matrix) — `better-sqlite3` path opens DB and runs one insert/select (skip allowed on arch w/o prebuild only if marked `optional`).

### 9.2 Deterministic BM25 testing

BM25 is **corpus-dependent**. Do **not** assert absolute score values.

**Instead**

- Freeze **tiny fixture DB** (≤ 20 rows) checked into `tests/fixtures/sqlite/m3-bm25.sqlite` generated by a **scripted builder** (`bun run fixtures:build-m3-sqlite`).
- Tests assert **relative order** for a fixed query: `docC` before `docA` before `docB`.
- Regenerate fixture when tokenization changes (rare).

### 9.3 Negative tests

- Empty remember text → `OMEM-E13-REMEMBER-EMPTY`
- Opening DB with future `schema_version` → `OMEM-E14-DB-NEWER`
- Corrupt metadata JSON on manual tamper → load skipped row + doctor warning (M3.1 hardening)

---

## 10. TypeScript API surface (`packages/core/src/canonical-store.ts`)

### 10.1 Connection port (internal)

```typescript
export type SqlScalar = string | number | bigint | Uint8Array | null;

export interface SqlStatement {
  all(...params: SqlScalar[]): Record<string, SqlScalar>[];
  get(...params: SqlScalar[]): Record<string, SqlScalar> | undefined;
  run(...params: SqlScalar[]): { changes: number; lastInsertRowid: bigint | number };
  finalize(): void;
}

export interface SqlConnection {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  transaction<T>(fn: () => T): T;
  close(): void;
}
```

### 10.2 Public facade

```typescript
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';

export interface RememberOptions {
  readonly text: string;
  readonly sessionId?: string;
  readonly at?: Date;
  readonly role?: MemoryRecord['role'];
  readonly metadataPatch?: Record<string, unknown>;
  /** Test hook: deterministic id salt */
  readonly saltHex?: string;
}

export interface RecallL2Options {
  readonly query: string;
  readonly limit?: number;
  readonly since?: Date;
}

export interface CanonicalRecallHit {
  readonly record: MemoryRecord;
  /** Lower is better (FTS bm25 auxiliary) */
  readonly bm25: number;
  readonly snippet?: string;
}

export interface OpenCanonicalStoreOptions {
  readonly filePath?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly driver?: 'auto' | 'bun' | 'better-sqlite3';
}

export class CanonicalStore {
  static open(opts?: OpenCanonicalStoreOptions): CanonicalStore;

  remember(opts: RememberOptions): MemoryRecord;
  recallL2(opts: RecallL2Options): CanonicalRecallHit[];

  /** Executes ANALYZE; optional incremental optimize */
  maintain(opts?: { analyze: boolean }): void;

  close(): void;
}
```

### 10.3 Federation merger (exported helper)

```typescript
import type { RecallHit } from './federation.js';

export interface FusedRecallOptions {
  readonly query: string;
  readonly limit?: number;
  readonly since?: Date;
  readonly k?: number; // RRF constant, default 60
}

export function fuseRecall(
  federated: readonly RecallHit[],
  l2: readonly CanonicalRecallHit[],
  opts: FusedRecallOptions,
): RecallHit[];
```

Implementation detail: **`fuseRecall`** returns unified `RecallHit[]` scores where `score` equals **RRF** (not bm25/raw tf).

---

## 11. CLI / telemetry touchpoints

- `omem doctor` surfaces: **DB presence**, **`schema_version`**, **WAL size**, **`record count`**, **FTS integrity** (`PRAGMA integrity_check` quick)
- Sizes printed human-readable (<1 MB quiet)

---

## 12. Glossary deltas

| Term | Meaning |
|------|---------|
| **L2** | Canonical SQLite store (`index.sqlite`) |
| **Remember** | Durable ingest path (`omem remember`) |
| **Federation scan** | Voluntary live scanning only (no persistence in M3.0) |

---

## 13. Changelog anchors

| Milestone | Action |
|-----------|--------|
| M3.0 | Baseline DDL `version=1`; drivers `bun` + `better-sqlite3`; FTS5 BM25 retrieval; remember + fused recall |
| M3.1 | Embeddings (`sqlite-vec` optional), `records_vec` linkage, backfill job |
| M3.2 | Prune SLAs + maintenance automation |

---

## Appendix A — Migration module template (reference)

Each migration file exports a **version** and **`up(conn: SqlConnection)`** only.

```typescript
// packages/core/src/migrations/0001_init.ts (illustrative — keep in sync §2 DDL)
import type { SqlConnection } from '../canonical-store/db.js';

export const version = 1;
export const label = 'm3.0-baseline';

export function up(conn: SqlConnection): void {
  conn.transaction(() => {
    for (const ddl of M3_0_DDL_STATEMENTS) {
      conn.exec(ddl);
    }
    conn.prepare(
      `UPDATE schema_version SET version = ?, applied_at = ?, label = ? WHERE id = 1`,
    ).run(version, Date.now(), label);
  });
}
```

**Rules**

1. **One transaction per migration file** — failures roll back completely.
2. **No `IF NOT EXISTS` abuses** for core tables after v1 — subsequent migrations use `ALTER` or new tables.
3. Migrations **never** `DELETE FROM records` unless the user runs an explicit `prune`/`gdpr` command that is not part of upgrade.

---

## Appendix B — Reference `fuseRecall` algorithm (correct, optimize freely)

Let `rankFed[key]` / `rankL2[key]` be **1-based** positions in lists already sorted best-first (federation hits as returned by core recall; L2 hits sorted bm25 ascending, then timestamp descending, then id ascending).

Combined RRF contribution:

```
score[key] =
  IF rankFed[key] DEFINED then 1/(k + rankFed[key]) else 0
+ IF rankL2[key] DEFINED then 1/(k + rankL2[key]) else 0
```

Default **`k = 60`**.

Prefer the **federated** `MemoryRecord` when merging duplicate keys so tool-specific provenance survives; fallback to L2 row.

Deterministic ordering after score: `score desc`, `timestamp desc`, `source asc`.

```typescript
function fuseRecall(
  federated: RecallHit[],
  l2Sorted: CanonicalRecallHit[],
  limit: number,
  k = 60,
): RecallHit[] {
  const rankFed = new Map<string, number>();
  federated.forEach((h, idx) => {
    const key = recallKey(h.record);
    if (!rankFed.has(key)) rankFed.set(key, idx + 1);
  });

  const rankL2 = new Map<string, number>();
  l2Sorted.forEach((h, idx) => {
    const key = recallKey(h.record);
    if (!rankL2.has(key)) rankL2.set(key, idx + 1);
  });

  const keys = new Set<string>();
  for (const h of federated) keys.add(recallKey(h.record));
  for (const h of l2Sorted) keys.add(recallKey(h.record));

  const fused: RecallHit[] = [];

  for (const key of keys) {
    let score = 0;
    const rf = rankFed.get(key);
    const rl = rankL2.get(key);
    if (rf !== undefined) score += 1 / (k + rf);
    if (rl !== undefined) score += 1 / (k + rl);
    if (score === 0) continue;

    const fedHit = federated.find((h) => recallKey(h.record) === key);
    const l2Hit = l2Sorted.find((h) => recallKey(h.record) === key);
    const record = fedHit?.record ?? l2Hit!.record;
    fused.push({
      record,
      score,
      matchedTerms: fedHit?.matchedTerms ?? [],
    });
  }

  fused.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ts = b.record.timestamp.getTime() - a.record.timestamp.getTime();
    if (ts !== 0) return ts;
    return a.record.source.localeCompare(b.record.source);
  });

  return fused.slice(0, limit);
}
```

**Dedup invariant**: adapters that lack intrinsic ids MUST synthesize deterministic ids upstream (recommended: `packages/core/src/recall/key.ts` exports both `stableRecordId(adapterId, fingerprint)` helper and canonical `dedupKey`). Do not bifurcate logic between federation and canonical store.



---

## Appendix C — FTS5 `MATCH` escaping & query assembly

User queries can contain `"`, `*`, `:`, etc. **Never** interpolate raw strings into `MATCH`.

**M3.0 minimal strategy**

1. Tokenize query with shared `tokenizeRecallQuery(q)` (same rules as M1 + unicode NFKC optional M3.2).
2. Drop tokens `< 2` chars.
3. If zero tokens → **no L2 FTS query** (avoid full scan).
4. Escape each token per SQLite FTS5 rules:

```typescript
function escapeFtsToken(tok: string): string {
  const escaped = tok.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildMatchAndClause(tokens: readonly string[]): string {
  return tokens.map(escapeFtsToken).join(' AND ');
}
```

**Prefix queries** (`token*`) are **not** enabled in M3.0 — surprising behavior + user injection risk; revisit with dedicated flag `--prefix`.

---

## Appendix D — Proposed error catalog additions (M3)

Codes to register in `packages/cli/src/output/error-catalog.ts` (exact numbers assigned at implementation time):

| Code | When |
|------|------|
| `OMEM-E12-SQLITE-NATIVE` | `better-sqlite3` failed to load native `.node` |
| `OMEM-E13-REMEMBER-EMPTY` | whitespace-only remember text |
| `OMEM-E14-DB-NEWER` | on-disk schema version > binary supported |
| `OMEM-E15-SQLITE-CORRUPT` | integrity check failed |
| `OMEM-E16-SQLITE-BUSY` | exceeded busy timeout (contention) |

**Partial success** does not apply to remember — single-writer command either succeeds or fails atomically.

---

## Appendix E — WAL & backup advisory

**Concurrent readers**

- CLI recall should open **read-only** connections where possible to avoid writer starvation.

**User backup**

Copying `index.sqlite` while another process writes can produce inconsistent snapshots.

**Chosen UX**

- Document `omem doctor --backup` (M3.1 nicety) wrapping SQLite backup API — **not M3.0 blocker**
- M3.0 docs instruct users to quit other `omem` instances before copying file manually

---

## Appendix F — Fixture DB generation script outline

```text
packages/dev-scripts/src/build-m3-fixture-db.ts
```

Steps:

1. Instantiate fresh DB in-memory (`:memory:`) or temp path.
2. Apply migrations `0001`.
3. Insert curated rows with **`salt=""`** fixed timestamps.
4. Copy file to `tests/fixtures/sqlite/m3-bm25-expected.sqlite`.
5. Export JSON sidecar `m3-bm25-expected.manifest.json` describing expected ordering for query `"alpha beta"`.

CI runs the builder only when `UPDATE_FIXTURES=1`.

---

## Appendix G — `MemoryRecord` ↔ SQL row mapping (exact)

| `MemoryRecord` field | SQL column | Transform |
|---------------------|------------|-----------|
| `id` | `records.id` | verbatim |
| `source` | `records.source` | verbatim |
| `sessionId?` | `records.session_id` | `NULL` if absent |
| `role?` | `records.role` | `NULL` if absent |
| `timestamp` | `records.timestamp_ms` | `date.getTime()` |
| `text` | `records.text` | verbatim UTF-8 |
| `metadata?` | `records.metadata` | JSON.stringify; `{}` if absent |

Reverse read:

```typescript
function rowToMemoryRecord(row: DbRow): MemoryRecord {
  const metadata = row.metadata ? JSON.parse(row.metadata) : undefined;
  const rec: MemoryRecord = {
    id: String(row.id),
    source: String(row.source),
    timestamp: new Date(Number(row.timestamp_ms)),
    text: String(row.text),
  };
  if (row.session_id !== null) rec.sessionId = String(row.session_id);
  if (row.role !== null) rec.role = row.role as MemoryRecord['role'];
  if (metadata !== undefined) rec.metadata = metadata;
  return rec;
}
```

Ensure **`exactOptionalPropertyTypes`** compliance — omit keys instead of assigning `undefined`.

---

## Appendix H — Security notes

**Injection**: parameterized queries only (`?` placeholders). FTS match assembled from escaped discrete tokens — never raw user substring inside double quotes unsanitized.

**Threat model**: local-first; attacker with filesystem access can tamper DB — detected via optional integrity checks / signing deferred.

---

## Appendix I — Observability hooks

Structured debug logs (`--verbose`):

```
canonical-store:open path=C:\Users\foo\.omem\index.sqlite driver=bun fts=records_fts version=1 wal=on
canonical-store:remember id=omem:a3f... rows=1 durationMs=4
canonical-store:recallL2 query="websocket reconnect" hits=3 topBm25=-2.817
```

No network.

---

## Appendix J — Relationship to `spec.md` §4.3 JSON recall shape

JSON recall rows currently omit canonical id distinction between federation vs L2 beyond `source`.

**Additive JSON fields (allowed minor bump)**

```jsonc
{
  "id": "omem:a3f…",
  "source": "omem",
  "lane": "L2",
  "rank": 1,
  "score": 0.01923,
  "matchedTerms": ["websocket"],
  "snippet": "«websocket» reconnect …",
  "timestamp": "2026-05-01T12:34:56Z",
  "role": "user"
}
```

Existing consumers ignore unknown keys — forward compatible.

---

## Appendix K — Decision summary card (for reviewers)

| Decision | Choice |
|---------|--------|
| DB path | `${OMEM_HOME|~/.omem}/index.sqlite` via `indexPath()` |
| Bun driver | `bun:sqlite` |
| Node driver | `better-sqlite3` with graceful failure |
| Remember source | `omem` |
| Id | `omem:` + sha256(canonical JSON payload) |
| Dedup | Random salt default (no dedup) |
| Upsert | `REPLACE` on duplicate `id` |
| Federation persistence | **none** in M3.0 |
| Ranking fusion | RRF \(k=60\) across L1+M1-scored + L2+BM25 |
| Tokenizer | `unicode61` / CLI AND-of-tokens |
| Embeddings | Deferred M3.1 |
| Migrations | forward-only integer versions |

---

**End of specification**
