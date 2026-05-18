# M7 Design: Semantic Search + Provenance + AI Hooks (preview)

> **Status**: Draft · **Date**: 2026-05-18 · **Owner**: lup
> **Depends on**: M6 (complete) · federation.ts RRF pipeline · canonical-store.ts

---

## 1. Goals

M7 upgrades omem from keyword-only recall to **semantic understanding**, adds **provenance tracing** so users know where each memory came from and why it matched, and previews the **AI hooks** system for automatic memory capture.

| Goal | User value | Complexity |
|------|-----------|------------|
| Semantic search | "find memories about auth even when I search for 'login'" | High |
| Memory provenance | "this memory came from a Claude Code session on May 12" | Medium |
| AI hooks (preview) | "omem auto-recalls relevant context when I start a Cursor session" | Medium |

---

## 2. Semantic Search

### 2.1 Architecture

The current recall pipeline has two arms merged via RRF:
1. **Adapter arm** — TF×recency scoring across live adapter scans
2. **Canonical arm** — FTS5 BM25 over the canonical SQLite store

M7 adds a third arm:
3. **Semantic arm** — vector similarity search over pre-computed embeddings

```
                                    ┌── Adapter arm (TF×recency) ──┐
User query ──→ Core Engine ────────┼── Canonical arm (BM25)       ──┼──→ RRF(k=60) ──→ ranked hits
               │                    └── Semantic arm (cosine sim)  ──┘
               └──→ embed(query)
```

All three arms contribute `1/(k + rank)` scores per record, merged via the existing `fuseRRF()` function. The semantic arm is purely additive — disabling it reverts to M6 behavior.

### 2.2 Embedding Model

**Decision: local-first, no API keys, offline-capable.**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Transformers.js v4** (`@huggingface/transformers`) | Pure JS/WASM, works in Bun, large model zoo | ~80MB model download, `bun --compile` issues with onnxruntime-node, embedding inconsistency across backends | **Primary choice** — use WASM backend for portability |
| **OpenAI API** | Best quality embeddings | Requires API key, network, costs money | **Optional secondary** — for users who want quality over offline |
| **Ollama** | Local, good quality | Requires separate install, not embeddable | **Optional tertiary** — for power users |

**Default model**: `all-MiniLM-L6-v2` (384 dimensions, ~23MB ONNX, ~80MB total download)
- Good balance of quality vs size for a CLI tool
- Well-tested, widely used, MIT licensed

**Model management**:
```bash
omem config set embedding.provider local          # default: local (Transformers.js)
omem config set embedding.provider openai         # opt-in: requires OPENAI_API_KEY
omem config set embedding.provider ollama         # opt-in: requires running Ollama
omem config set embedding.model all-MiniLM-L6-v2  # default for local
```

### 2.3 Embedding Storage

Extend `canonical.db` schema (migration v3):

```sql
-- New table: pre-computed embeddings
CREATE TABLE IF NOT EXISTS embeddings (
  record_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  model     TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
  vector    BLOB NOT NULL,  -- Float32Array serialized
  PRIMARY KEY (record_id, model)
);
```

**sqlite-vec integration**: Load via `sqliteVec.load(db)` for vector KNN queries:

```sql
SELECT record_id, distance
FROM vec_memories
WHERE embedding MATCH ?
ORDER BY distance
LIMIT 20;
```

**Platform note**: On macOS, `bun:sqlite` may not support dynamic extension loading. Fallback strategy:
1. Try `sqliteVec.load(db)` — works on Linux + Windows
2. If fails, try `Database.setCustomSQLite()` with Homebrew's libsqlite3
3. If all fail, disable semantic arm silently (adapter + BM25 still work)

### 2.4 Embedding Pipeline

```
omem remember "text"
  │
  ├──→ write to FTS5 table (existing)
  └──→ embed(text) ──→ write to embeddings table (new)

omem recall "query"
  │
  ├──→ adapter scan (existing)
  ├──→ BM25 search (existing)
  └──→ embed(query) ──→ KNN search ──→ semantic hits
       │
       └──→ fuseRRF(adapter, bm25, semantic) ──→ ranked results
```

**Lazy embedding**: Adapter records are NOT pre-embedded (too expensive for 10K+ records on every scan). Only canonical store records get embeddings. Adapter records still use TF×recency.

**Background indexing** (optional): `omem embed --backfill` can run as a one-time job to embed all existing canonical records.

### 2.5 Performance Budget

| Operation | Target | Notes |
|-----------|--------|-------|
| Embed single query | <200ms | WASM backend on modern CPU |
| Embed at remember time | <300ms | Acceptable for interactive `omem remember` |
| KNN search (10K vectors, 384-dim) | <50ms | sqlite-vec is optimized for this |
| Full recall (3 arms + RRF) | <2.5s | Up from <2s baseline; acceptable |

### 2.6 User Opt-in

Semantic search is **opt-in** for M7:

```bash
omem config set embedding.enabled true    # enables semantic arm
# First run downloads the model (~80MB one-time)
```

When disabled (default), M7 behaves identically to M6.

---

## 3. Memory Provenance

### 3.1 What "Provenance" Means

Every recall hit should answer: **where did this come from, when, and why did it match?**

Current `RecallHit`:
```typescript
interface RecallHit {
  record: MemoryRecord;
  score: number;
  matchedTerms: string[];
  origin: 'adapter' | 'canonical';
}
```

M7 `RecallHit`:
```typescript
interface RecallHit {
  record: MemoryRecord;
  score: number;
  matchedTerms: string[];
  origin: 'adapter' | 'canonical';
  // NEW in M7:
  provenance: {
    source: string;         // "claude-code", "cursor", "canonical", etc.
    sessionId?: string;     // session/conversation ID if available
    filePath?: string;      // source file path on disk
    timestamp: Date;        // when the memory was created
    matchReason: MatchReason[];  // why this hit matched
  };
}

type MatchReason =
  | { type: 'keyword'; terms: string[] }
  | { type: 'bm25'; score: number }
  | { type: 'semantic'; similarity: number; model: string }
  | { type: 'recency'; boost: number };
```

### 3.2 CLI Output

**Table mode** (default):

```
$ omem recall "JWT refresh"
 # Score Source         Session     Date         Matched By
 1 0.032 claude-code    ses_abc123  2026-05-12   keyword: jwt, refresh
 2 0.028 canonical      —           2026-05-10   bm25: 12.3 + semantic: 0.89
 3 0.024 cursor         agent-xyz   2026-05-08   keyword: token, refresh
```

**JSON mode** (`--json`): Full provenance object in each hit.

**Verbose mode** (`--verbose` or `-v`): Show file paths and match reason details.

### 3.3 Implementation

Provenance data is already partially available:
- `record.source` → adapter ID (exists)
- `record.sessionId` → session ID (exists in MemoryRecord)
- `record.timestamp` → creation time (exists)
- `matchedTerms` → keyword match (exists)

New work:
1. Add `filePath` to `MemoryRecord.metadata` in adapter scan (each adapter knows which file it read)
2. Compute `matchReason` array during scoring (keyword, BM25, semantic, recency contributions)
3. Update output formatters (table + JSON) to display provenance

---

## 4. AI Hooks (Preview)

### 4.1 Concept

Instead of requiring users to explicitly type `omem recall`, hooks automate memory operations at IDE lifecycle events.

```
IDE Event                              omem Action
──────────────────────────────────────────────────────
Session starts                    →    auto-recall context
User asks a question              →    inject relevant memories
Session ends                      →    auto-remember key decisions
Important decision made           →    remember immediately
```

### 4.2 Hook Types

| Hook | Trigger | Action | Complexity |
|------|---------|--------|------------|
| **Auto-Recall** | Session start | `omem recall --context` → inject as system prompt | Low |
| **Auto-Remember** | Session end | Extract key facts → `omem remember` | High (needs LLM judgment) |
| **Query-Augmented Recall** | User prompt | Extract keywords → `omem recall` → inject | Medium |

### 4.3 M7 Scope: Auto-Recall Only

M7 ships **only Auto-Recall** — the simplest and most deterministic hook:

```bash
omem hooks install --ide=cursor    # writes to .cursor/hooks.json
omem hooks install --ide=claude    # writes to .claude/settings.local.json hooks
omem hooks uninstall --ide=cursor
omem hooks status                  # show installed hooks
```

**How Auto-Recall works**:
1. On IDE session start, the hook runs `omem recall --context --limit=5 --json`
2. `--context` is a new flag: uses the current project name + recent files as implicit query
3. Returns the 5 most relevant memories as a compact summary
4. The hook injects this as context for the AI agent

**What `--context` does**:
- Reads `git remote` to get project name
- Reads recent git log (last 5 commits) for topic keywords
- Queries omem with these auto-extracted keywords
- Returns a formatted context block

### 4.4 IDE-Specific Hook Format

**Claude Code** (`.claude/settings.local.json` or hooks directory):
```json
{
  "hooks": {
    "SessionStart": [{
      "type": "command",
      "command": "omem recall --context --limit=5 --json"
    }]
  }
}
```

**Cursor** (`.cursor/hooks.json`):
```json
{
  "hooks": [
    {
      "event": "session_start",
      "command": "omem recall --context --limit=5 --json",
      "inject": "system_context"
    }
  ]
}
```

### 4.5 Auto-Remember (deferred to M8)

Auto-Remember is deferred because it needs to answer "what's worth remembering?" — a judgment call that requires either:
- LLM summarization (expensive, needs API key)
- Rule-based extraction (brittle, misses nuance)
- User confirmation (adds friction, defeats the purpose)

M8 will explore a hybrid: auto-extract candidates, present to user for confirmation.

---

## 5. Implementation Plan

### Phase 1: Provenance (1-2 days)

1. Extend `RecallHit` with `provenance` field
2. Each adapter reports `filePath` in metadata during scan
3. Compute `matchReason` during scoring
4. Update table + JSON output formatters
5. Add `--verbose` flag for detailed provenance

### Phase 2: Semantic Search (3-5 days)

1. Add `@huggingface/transformers` dependency (WASM backend)
2. Schema migration v3: `embeddings` table
3. Add `sqlite-vec` npm package + load extension
4. `embed()` utility: text → Float32Array (384-dim)
5. Embed at `remember()` time
6. `omem embed --backfill` command for existing records
7. Add semantic arm to `recall()` in federation.ts
8. Extend `fuseRRF()` for 3-way merge
9. Config: `embedding.enabled`, `embedding.provider`, `embedding.model`
10. Graceful fallback when sqlite-vec load fails

### Phase 3: AI Hooks preview (2-3 days)

1. `omem recall --context` flag implementation
2. `omem hooks install --ide=<ide>` command
3. `omem hooks uninstall --ide=<ide>` command
4. `omem hooks status` command
5. Hook format writers for Claude Code + Cursor
6. Tests

### Total: ~7-10 days

---

## 6. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `sqlite-vec` load fails on macOS | No semantic search on Mac | Fallback to BM25-only; document `setCustomSQLite` workaround |
| Transformers.js WASM is slow on first run | Bad DX on first `recall` | Cache model aggressively; show progress bar on first download |
| `bun --compile` can't bundle onnxruntime | Compiled binary lacks semantic | Use WASM backend (no native deps); accept slightly slower inference |
| Embedding quality varies by backend | Inconsistent recall results | Pin to WASM backend only; document this |
| Hook format changes across IDE versions | Hooks break on IDE update | Loose coupling; `omem hooks status` detects stale hooks |

---

## 7. Recall Conflict Resolution

Federated recall across 9+ adapters can surface the same fact from multiple sources, contradictory facts across time, and stale advice superseded by newer decisions. M7 introduces the first two layers of a 4-layer defense; M8 completes it.

### 7.1 Four-Layer Defense

| Layer | Name | Ships in | Description |
|-------|------|----------|-------------|
| L1 | **Fingerprint dedup** | M3 (done) | Content-hash dedup in `fuseRRF()` — identical records from adapter + canonical arms merge into one hit |
| L2 | **Semantic dedup** | M7 | When embedding is enabled, hits with cosine similarity >0.85 are grouped; only the highest-scoring representative surfaces. Reduces near-duplicate noise from rephrased memories |
| L3 | **Contradiction detection** | M8 | Compare top-N hits pairwise for contradictions (e.g. "use JWT" vs "don't use JWT"). Surface both with a `[conflicting]` annotation and let the agent decide |
| L4 | **Staleness / superseded** | M8+ | When `omem remember` stores a fact that contradicts an existing canonical record, mark the older record `[superseded]`. Superseded records rank lower but remain queryable |

### 7.2 L2 Semantic Dedup (M7 implementation)

After RRF fusion produces a ranked list, a post-fusion dedup pass runs:

```
for each hit (rank order):
  if embedding is available:
    compute cosine_sim(hit, every higher-ranked hit)
    if max_sim > 0.85:
      drop this hit (it's a near-duplicate of a higher-ranked one)
```

This is O(n^2) but n is capped at `--limit` (default 50), so worst case is 1,225 comparisons of 384-dim vectors — sub-millisecond on any modern CPU.

### 7.3 M8 Auto-Remember: Agent Self-Report

Auto-remember (deferred to M8) uses the **agent self-report** approach:

1. IDE hook fires at session end (Claude Code `Stop` hook, Cursor post-session)
2. Hook asks the agent: "Summarize the key decisions, patterns, and facts from this session in ≤5 bullet points"
3. Agent produces structured output (JSON array of summaries)
4. Hook pipes each summary to `omem remember --source=auto-hook --session=<id>`
5. Normal fingerprint + semantic dedup prevents bloat

This avoids the need for omem to run its own LLM — the IDE's agent is already there. Trade-off: quality depends on the agent's summarization ability, but this is good enough for v1 and avoids adding an API key dependency.

---

## 8. What We Explicitly Defer

- **Auto-Remember** → M8 (needs LLM judgment or user confirmation UX)
- **Cross-machine sync** → M9+ (needs server infrastructure)
- **Web UI** → M9+ (nice-to-have, not core)
- **Cat C adapters (mem0/Letta)** → M9+ (blocked on their API stability)
- **OpenAI/Ollama embedding providers** → M7.1 (start with local WASM only)

---

## 9. Success Criteria

M7 is done when:

1. `omem recall "auth flow"` finds memories about "login" and "JWT" via semantic similarity (not just keyword match)
2. Every recall hit shows provenance: source, session, file path, match reason
3. `omem hooks install --ide=cursor` successfully installs an auto-recall hook
4. Semantic search is opt-in and defaults to off
5. All existing tests still pass (semantic is additive, not breaking)
6. Performance: full recall with semantic arm completes in <3s for a typical workload
