# F. Unknowns — Quick-Hit Investigation

> **Date**: 2026-05-14
> **Depth**: medium (live filesystem + targeted web search)
> **Spec ref**: `../specs/spec.md` Section 7 (Adapter Roster) and §1.1

This research clears up six ambiguities surfaced during spec drafting.

---

## F.1 OpenCode — what is it, where does it live on Windows?

**Project**: `anomalyco/opencode` — open-source AI coding agent CLI ("OpenCode CLI").

### Storage location on **lup's Windows machine** (verified 2026-05-14)

| Path | Status | Size hint |
|---|---|---|
| `C:\Users\lup\.local\share\opencode\` | ✅ **EXISTS** | Has `storage/`, `log/`, `snapshot/`, `tool-output/`, `auth.json`, `opencode.db` (+ WAL/SHM) |
| `C:\Users\lup\.opencode\` | ✅ Exists (different role) | Has `skills/`, `node_modules/`, `package.json`, `bun.lock` — this is the **OpenCode skills/install** dir, **not** session data |
| `%LOCALAPPDATA%\opencode` | ❌ Not used |
| `%APPDATA%\opencode` | ❌ Not used |

### Storage layout (per official docs + filesystem evidence)

```
~/.local/share/opencode/
├── storage\
│   ├── session\                  ← session metadata: {hash}\ses_{id}.json
│   ├── message\                  ← per-session: ses_{id}\msg_{id}.json
│   ├── session_diff\             ← session diffs
│   ├── tool-output\              ← tool execution results
│   └── todo\                     ← task management
├── log\                          ← *.log real-time events
├── snapshot\                     ← system snapshots
├── opencode.db (+ -shm, -wal)    ← SQLite, primary index
└── auth.json                     ← credentials (skip!)
```

### Adapter implications

- **JSON files, not JSONL** → adapter loads each `msg_{id}.json` individually. Slower but trivial.
- **Per-session sub-directories** → easy to walk and incrementally sync.
- **`opencode.db` is intriguing** — likely a session/message index. Worth inspecting in M2 to decide whether to bypass JSON files.
- **No automatic cleanup** (per upstream issue #4980) → data accumulates. Adapter incremental sync MUST handle large dirs gracefully.
- **Auth.json must be skipped** (security).

### Verdict

**Add `opencode` adapter to Tier 2 (M2) of spec §7.2.** Lower priority than Cursor/Codex because lup's `~/.local/share/opencode/` is fresh-looking (not heavy use yet). But the format is so similar to Codex+Cursor that the adapter should be ~150 LoC.

---

## F.2 Anthropic `memory-management` skill — current state

**Repo**: `anthropics/knowledge-work-plugins` (created 2026-01-23, last push 2026-04-03, **10,879 stars**).
**Skill location in repo**: `productivity/skills/memory-management/`

### Architecture

Two-tier:

1. **`CLAUDE.md`** = "hot cache" of ~30 frequently used items (~50-80 lines).
   - Covers ~90% of daily decoding needs.
   - Lives in the project root or user dir.
2. **`memory/` directory** = deep storage:
   ```
   memory/
   ├── glossary.md         ← acronyms / terms
   ├── people/             ← per-person profiles (e.g. todd-martinez.md)
   ├── projects/           ← per-project context
   └── context/            ← misc background
   ```

### What it does

Decodes "ask Todd to do the PSR for oracle" → `Todd Martinez (Finance) / Pipeline Status Report / Oracle Systems deal`.

**Optimized for workplace shorthand**, not arbitrary memory. Lookup flow: CLAUDE.md → `memory/glossary.md` → ask user.

### Adapter implications for loci v2

- **Read** `<project>/memory/**/*.md` is straightforward — same shape as Serena adapter.
- **Write** is also fine (just append to glossary or create new files).
- Conceptually overlaps with Serena: both are "project-bound markdown memory". Adapter could be a **specialization** of a generic "markdown-dir adapter" with different default subpaths.

### Verdict

**Confirm `anthropic-memory` in Tier 2 (M2) of spec §7.2.** Worth ~80 LoC sharing 90% with `serena` adapter. Don't build separately; build a generic `markdown-dir` adapter and parametrize.

---

## F.3 `recall` (arjunkmrm) — actual storage layout

**Local clone**: `D:\Works\AI\Skills\recall\`
**DB path** (hardcoded in `scripts/recall.py:18`): `Path.home() / ".recall.db"` → `C:\Users\lup\.recall.db`

### Status on lup's machine

`C:\Users\lup\.recall.db` → **NOT FOUND**. lup hasn't run recall yet (it's installed but never invoked).

### Schema (from `recall.py`)

Two FTS5 virtual tables:

```sql
CREATE VIRTUAL TABLE messages USING fts5(
    -- standard FTS5 over ~/.claude/projects + ~/.codex/sessions
);

CREATE VIRTUAL TABLE messages_cjk USING fts5(
    -- CJK trigram tokenizer for Chinese/Japanese/Korean queries
);
```

Both indexes feed off the **same source files** as the `claude-code` and `codex` adapters loci v2 will write.

### Adapter implications

| Strategy | Pros | Cons |
|---|---|---|
| Build `recall-db` adapter (read `.recall.db`) | Reuse recall's FTS index | Duplicates loci's own FTS5; user wouldn't use recall + loci both |
| Replace recall (tell user to use `loci search` instead) | Simpler stack | Loses recall's CJK-trigram tokenizer trick |
| **Borrow recall's CJK trigram code** into loci's own FTS5 | Best of both | ~50 LoC port |

### Verdict

**Don't build `recall-db` adapter.** Instead:
- **Steal recall's `messages_cjk` FTS5 trigram tokenizer setup** for loci's own FTS5 schema (B-research recommends FTS5 anyway, so this is a free upgrade).
- **Document migration path**: "Already use recall? `loci sync claude-code codex` indexes the same data with better cross-source search."

Update spec §7.2 to **drop `recall-db`** from Tier 2.

---

## F.4 `episodic-memory` (obra) — actual storage layout

**Local clone**: `D:\Works\AI\Skills\episodic-memory\`
**Stack**: Node + `better-sqlite3` + `sqlite-vec` (B-research ✅ same recommended stack).

### Storage path

Code references `paths.ts` (which composes `process.env.CLAUDE_CONFIG_DIR || os.homedir() + '/.claude'` and `CODEX_HOME` for alternate profiles). DB path is constructed from those — **likely `~/.config/superpowers/conversation-index/db.sqlite`** based on prior research, but couldn't fully verify in 30s. Either way:

### Status on lup's machine

`C:\Users\lup\.config\superpowers\conversation-index\db.sqlite` → **NOT FOUND**. lup hasn't run episodic-memory yet either.

### Adapter implications

Same logic as F.3 (recall):

| Strategy | Verdict |
|---|---|
| Build `episodic-memory-db` adapter | ❌ Don't — duplicates loci's own vector index |
| **Borrow episodic-memory's `db.ts` setup as template** | ✅ Yes — it's literally the recommended stack from B-research |

### Verdict

**Don't add `episodic-memory-db` to spec §7.2.** Update spec.

**Strong recommendation**: read `D:\Works\AI\Skills\episodic-memory\src\db.ts` as a **reference implementation** when implementing loci's L1 vector index. The schema migration logic (FK enforcement, sqlite-vec extension loading, embedding-migration) is exactly what loci v2 needs.

---

## F.5 `~/.codex/logs_2.sqlite` — is it a memory goldmine?

**Surfaced as TODO from A-research §A.5.5.** Live inspection of 42 MB SQLite:

### Schema

```sql
CREATE TABLE _sqlx_migrations (...)        -- sqlx migration metadata, ignore
CREATE TABLE sqlite_sequence (...)         -- sqlite internals, ignore
CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    ts_nanos INTEGER NOT NULL,
    level TEXT NOT NULL,                   -- DEBUG/INFO/WARN/ERROR
    target TEXT NOT NULL,                  -- module name
    feedback_log_body TEXT,                -- log message
    module_path TEXT,
    file TEXT,
    line INTEGER,
    thread_id TEXT,
    process_uuid TEXT,
    estimated_bytes INTEGER NOT NULL DEFAULT 0
)
```

11,460 rows. Pure **runtime log** (sqlx tracing logs from Codex Rust binary) — equivalent of `stderr` to a file, not structured tool calls / outcomes.

### Verdict

**Not a memory source.** Skip. Don't add an adapter. (Could be useful for **debugging Codex**, not for AI memory.)

Update A-research §A.5.5 to mark this resolved → not interesting.

---

## F.6 `~/.codex/{memories, agents}` and `~/.claude/{transcripts, sessions}` — what's there?

| Path | Status | Verdict |
|---|---|---|
| `~/.codex/memories/` | Empty | Skip — but watch in case OMX starts using it |
| `~/.codex/agents/` | 20 `.toml` files (analyst.toml, architect.toml, etc.) | **Agent definitions, not memories.** Skip. |
| `~/.claude/transcripts/` | **96 `.jsonl`, 6.9 MB** | ⚠️ **NEW** — separate from `projects/` |
| `~/.claude/sessions/` | Empty | Skip |

### `~/.claude/transcripts/` is interesting

96 jsonl files, ~6.9 MB. This is **separate** from the 156 jsonl files in `~/.claude/projects/` (35 MB). Two possibilities:

1. **Exported / "cleaned" transcripts** — Claude Code's export feature writes here.
2. **Older / archived sessions** — possibly from previous Claude Code versions.

### Adapter implications

The `claude-code` adapter (spec §7.1, Tier 1) should:
- **Primary source**: `~/.claude/projects/<dir>/<session>.jsonl` (per-project, current).
- **Secondary source**: `~/.claude/transcripts/*.jsonl` (catch what's missing).
- **Dedup by sessionId**: in case both contain same session.

Add a one-liner sample-read of `~/.claude/transcripts/` to A-research before M3 to confirm the schema matches `projects/` (so adapter can use the same parser).

---

## F.7 Updated ~/.loci/ status

| Path | Status |
|---|---|
| `C:\Users\lup\.loci\` | Exists, **0 KB** (empty dir, created 2026-05-09) |
| `C:\Users\lup\.loci\index.json` | Not found |

**Implication**: lup installed loci a few days ago but hasn't actually used `loci remember`. **No data migration needed for FR-L1-08** (smooth upgrade of existing `~/.loci/index.json`). Spec can simplify.

Update spec §6.5 (Compatibility) to note: as of 2026-05-14, lup has no v1 data; the "must not break v1 data" requirement is **academic** for lup specifically, but should still be honored for any other future v1 user.

---

## F.8 Updates to make to spec.md

| Spec section | Change |
|---|---|
| §7.2 Tier 2 | **Remove** `recall-db` (rationale: borrow tokenizer instead) |
| §7.2 Tier 2 | **Remove** `episodic-memory-db` (rationale: same stack, no need to dual-index) |
| §7.2 Tier 2 | **Add** `opencode` (path: `~/.local/share/opencode/storage/`, format: per-message JSON) |
| §7.2 Tier 2 | **Confirm** `anthropic-memory` (build as parameterization of generic markdown-dir adapter) |
| §6.5 Compatibility | Soften the "must not break v1 data" line — lup has none |
| §1.2 (current loci diagnosis) | Add: "verified ~/.loci/ is empty as of 2026-05-14" |
| New: §7.x | Add a **`markdown-dir`** generic adapter as a parent of `serena` / `lessons-learned` / `anthropic-memory` (DRY) |

---

## F.9 Decisions surfaced

| Decision | Verdict |
|---|---|
| Build separate adapters for `recall` / `episodic-memory` DBs? | **No** — borrow code/tokenizers, replace functionally |
| Treat `~/.codex/logs_2.sqlite` as memory? | **No** — runtime log, not memory |
| Include `~/.claude/transcripts/`? | **Yes** — secondary input to claude-code adapter |
| Include OpenCode? | **Yes** at Tier 2 (M2) |
| Include Anthropic memory-management? | **Yes** at Tier 2 (M2), as `markdown-dir` parameterization |
| `~/.loci/` v1 data migration concern? | **No real concern** for lup (empty); keep best-effort logic for other users |

---

## References

- Filesystem inspection on lup's Windows machine, 2026-05-14
- `D:\Works\AI\Skills\recall\scripts\recall.py` (lines 18, 48-55, 441-443)
- `D:\Works\AI\Skills\episodic-memory\src\db.ts`, `paths.ts`
- OpenCode docs: https://open-code.ai/en/docs/cli + GitHub `anomalyco/opencode` issues #4980, #10592
- Anthropic memory-management: https://github.com/anthropics/knowledge-work-plugins/tree/main/productivity/skills/memory-management
