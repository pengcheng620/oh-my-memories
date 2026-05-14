# A. Data-Source Field Survey for loci v2

> **Date**: 2026-05-14
> **Depth**: medium (live filesystem inspection on lup's Windows machine)
> **Spec ref**: `../specs/spec.md` Section 7 (Adapter Roster)

## TL;DR

| Source | Files | Total Size | Format | Adapter Difficulty | Index-Ready? |
|---|---:|---:|---|---|---|
| Claude Code | 156 `.jsonl` (in 12 project dirs) + global `history.jsonl` | **35.0 MB** | JSON Lines, custom event types | Medium (event schema varies by line type) | ✅ Yes — already proven by `episodic-memory` & `recall` |
| Codex | 29 `.jsonl` (date-nested) + 1 `logs_2.sqlite` (44 MB) | **16.9 MB** + 44 MB SQLite | JSONL with `{timestamp,type,payload}` | Easy-Medium (well-structured) | ✅ Yes |
| Cursor | 59 `.jsonl` in 11 workspace dirs (out of 43 workspaces) | **15.1 MB** | JSONL with `{role,message:{content:[…]}}` | Easy (cleanest schema of the three) | ✅ Yes |
| Serena memories | 90 `.md` (mostly in `.serena/ticket/<TICKET>/`) + 1 in `.serena/memories/` | **797 KB** | Markdown, mixed (some frontmatter, some plain) | Easy (just glob + read) | ✅ Yes — high signal-to-noise |
| **TOTAL** | **334 files** | **~67 MB** raw + 44 MB sqlite | — | — | — |

**Bottom line**: All four sources are **trivially adaptable** — no exotic formats, no auth, no remote APIs. Total raw text after extraction will likely be ~20-30 MB (~5-10 million tokens), well within local FTS5 + vector index range.

---

## A.1 Claude Code (`~/.claude/`)

### Filesystem layout

```
C:\Users\lup\.claude\
├── CLAUDE.md                     # global rules (3.7 KB)
├── history.jsonl                 # global event log (704 KB)
├── settings.json / config.json   # not memory
├── projects\                     # ★ MAIN MEMORY SURFACE ★
│   ├── d--Works-Vault-vault\           ← cwd-encoded dir name (path → "--")
│   ├── d--Works-AI-ai-toolbox\
│   ├── D--Works-Vault-vault-Server-Web-Services-FMPanel\
│   ├── ... (12 dirs total)
│   └── <each project>\
│       └── <session-uuid>.jsonl        ← per-session transcripts
├── transcripts\                  # ? (not inspected, may overlap)
├── todos\, tasks\, sessions\     # other state
├── plugins\, skills\             # tooling, not memory
└── ide\, statsig\, telemetry\    # noise
```

### Volume

| Metric | Value |
|---|---:|
| Project directories | 12 |
| Session `.jsonl` files | 156 |
| Total size | 35.02 MB |
| Largest single session | 428 KB (sample seen) |

### Format sample

Each line is one event. Event types observed in the first lines of a recent session:

```jsonl
{"type":"last-prompt","leafUuid":"690de371-...","sessionId":"1058bff4-..."}
{"type":"permission-mode","permissionMode":"bypassPermissions","sessionId":"..."}
```

These are **session metadata** lines. The actual conversation messages are interleaved further down (similar to how `recall` and `episodic-memory` parse them — they look for `role` ∈ {user, assistant, tool} or specific event types).

### Adapter design notes

- **Path → cwd decoding**: directory `d--Works-Vault-vault` maps to `D:\Works\Vault\vault`. Use a deterministic `decodeProjectDir(name): string` helper.
- **Project name**: derive from cwd (e.g. last folder = `vault`). Useful as a `repo` filter.
- **Session ID**: take from filename or `sessionId` field, both should match.
- **Message extraction**: filter for `type == "user-prompt"` / `type == "assistant-message"` (exact names need verification by reading more lines).
- **Incremental sync**: track `(filename, lineCount)` last seen — same approach as `recall`'s `tail` strategy.

### Read/Write capability

| Op | Recommended | Why |
|---|---|---|
| Read transcripts | ✅ | Open files, no lock contention observed |
| Read CLAUDE.md (global rules) | ✅ | Static file |
| Append to CLAUDE.md | ⚠️ Allowed but cautious | User maintains this; loci can append a fenced block |
| Write back to `projects/.../*.jsonl` | ❌ Forbidden | Owned by Claude Code runtime, schema may break |

---

## A.2 Codex (`~/.codex/`)

### Filesystem layout

```
C:\Users\lup\.codex\
├── AGENTS.md                       # global rules (30 KB!)
├── config.toml                     # config
├── history.jsonl                   # global history (43 KB)
├── logs_2.sqlite                   # ★ 44 MB structured log DB ★
├── state_5.sqlite                  # 188 KB, runtime state
├── sessions\                       # ★ MAIN MEMORY SURFACE ★
│   └── 2026\04\17\rollout-2026-04-17T16-48-10-019d9aa0-...jsonl
├── memories\                       # (small; need to inspect — possibly OMX-style)
├── prompts\, agents\, skills\      # tooling
├── superpowers\, .omx\             # plugin state
└── log\, .tmp\, vendor_imports\    # noise
```

### Volume

| Metric | Value |
|---|---:|
| `sessions/*.jsonl` files | 29 |
| sessions total size | 16.91 MB |
| Largest sample session | 7,014 KB (7 MB!) |
| Bonus: `logs_2.sqlite` | 44 MB structured log (probably valuable) |

### Format sample

Excellent schema — uniform `{timestamp, type, payload}`:

```jsonl
{"timestamp":"2026-04-17T08:49:13.083Z","type":"session_meta","payload":{"id":"019d9aa0-...","timestamp":"2026-04-17T08:48:10.434Z","cwd":"D:\\Works\\AI\\Writing\\article","originator":"codex-tui","cli_version":"0.121.0","source":"cli","model_provider":"gateway","base_instructions":{"text":"You are Codex, a coding agent..."}}}
{"timestamp":"...","type":"event_msg","payload":{"type":"task_started","turn_id":"019d9aa1-...","model_context_window":950000,...}}
{"timestamp":"...","type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"<permissions instructions>..."}]}}
```

**Key fields**:
- `payload.cwd` (in `session_meta`) → repo grouping
- `payload.role` ∈ {developer, user, assistant} (in `response_item`) → message attribution
- `payload.content[*].text` → actual text payload
- Date partitioning is **built-in** (`sessions/<year>/<month>/<day>/`) — natural incremental boundary

### Adapter design notes

- **Easiest of the three**: schema is the most uniform, cwd is explicit, date dirs simplify incremental sync.
- **`session_meta` first**: always the first line — adapter can stop early if just needs metadata.
- **Big sessions**: 7 MB single file = ~50k events. Streaming parser (`readline`), not `JSON.parse(await readFile)`.
- **`logs_2.sqlite` bonus**: 44 MB SQLite is a **goldmine** if it contains structured tool calls / outcomes. **Worth inspecting in F-research** to decide whether to add a sub-adapter.
- **`memories/` dir**: looks like OMX (`oh-my-codex`) writes there. Inspect during F.

### Read/Write capability

| Op | Recommended | Why |
|---|---|---|
| Read sessions | ✅ | Stable schema |
| Read AGENTS.md | ✅ | 30 KB global rules — high value |
| Append to AGENTS.md | ⚠️ Allowed but cautious | Same as CLAUDE.md |
| Read `logs_2.sqlite` | 🔍 TBD | Worth investigating |
| Read `memories/` | 🔍 TBD | Depends on what OMX writes |

---

## A.3 Cursor (`~/.cursor/`)

### Filesystem layout

```
C:\Users\lup\.cursor\
├── mcp.json                          # MCP server registry
├── argv.json, ide_state.json         # runtime state
├── rules\                            # ★ user-level rules ★
├── projects\                         # ★ MAIN MEMORY SURFACE ★
│   ├── d-Works-Vault-vault\                ← cwd-encoded ("\" → "-")
│   ├── d-Works-AI-Skills-loci\
│   ├── d-Works-vault-ai-bug-report\
│   ├── ... (43 workspace dirs total, but only 11 have transcripts)
│   ├── empty-window\                       ← junk
│   └── <each ws>\
│       └── agent-transcripts\
│           └── <chat-uuid>\
│               └── <chat-uuid>.jsonl
├── plugins\, skills\, skills-cursor\ # tooling
└── extensions\, browser-logs\        # noise
```

### Volume

| Metric | Value |
|---|---:|
| Workspace directories | 43 |
| Workspaces with `agent-transcripts/` | 11 |
| `.jsonl` chat files | 59 |
| Total size | 15.12 MB |

⚠️ Note: 32 of 43 workspace dirs are **junk** (e.g. `empty-window`, temp paths under `AppData\Local\Temp`, IDs without paths). Adapter needs **glob + filter**, not naive iteration.

### Format sample

Cleanest of the three:

```jsonl
{"role":"user","message":{"content":[{"type":"text","text":"<timestamp>Thursday, May 14, 2026, 2:19 PM (UTC+8)</timestamp>\n<user_query>\n…\n</user_query>"}]}}
```

Each line = one chat turn. Encoding artifacts: text contains XML-like wrapper tags (`<timestamp>`, `<user_query>`, `<system_reminder>`) that the adapter MAY strip for cleaner indexing.

### Adapter design notes

- **Workspace filter**: `decodeWorkspaceDir(name)` → return null if path doesn't resolve to an actual dir. Skip junk dirs.
- **Transcript ID**: filename = parent dir name = chat UUID. Stable identifier for incremental sync.
- **`<user_query>` extraction**: optional pre-processing to strip system tags from `text` for the indexed snippet (keep raw for full retrieval).
- **No `cwd` field in lines**: derive from workspace dir name. Adapter must do this.
- **Cursor rules** (`.cursor/rules/*.mdc` per project, plus `~/.cursor/rules/`): a **separate "rules adapter"** could expose those, but they're closer to "config" than "memory" — defer to M2.

### Read/Write capability

| Op | Recommended | Why |
|---|---|---|
| Read transcripts | ✅ | Stable, simple schema |
| Read `~/.cursor/rules/*.mdc` | ✅ | Static markdown |
| Read project `.cursor/rules/*.mdc` | ✅ | Per-project rules |
| Write transcripts | ❌ | Owned by Cursor |
| Append to rules | ⚠️ | Cursor watches these; structured edits okay |

---

## A.4 Serena Memories (`D:\Works\Vault\vault\.serena\`)

### Filesystem layout

```
D:\Works\Vault\vault\.serena\
├── project.yml                          # serena config
├── .gitignore
├── cache\                               # serena's own cache
├── scripts\                             # tooling
├── memories\                            # ★ ONE FILE here as of today ★
│   └── meta-memory-skills-comparison.md (15.9 KB) ← my own notes from prior session
└── ticket\                              # ★ MAIN MEMORY SURFACE ★ (90 .md files)
    ├── PDM-51412\
    ├── PDM-50440-license-integration\   ← largest cluster (with archive/refs/test subdirs)
    ├── DEPLOY-14158-fix-fmpanel-hashed-filenames\
    ├── PDM-49715-fix-duplicate-notifications\
    ├── ... (28 ticket subdirs)
    └── <each ticket>\
        ├── PR-description.md            ← common across many tickets
        ├── pr-description-new.md        ← variants
        ├── investigation.md
        ├── spec.md
        ├── file-index.md
        ├── test-results-*.md
        └── ...                          ← 1-30 .md per ticket
```

### Volume

| Metric | Value |
|---|---:|
| Total `.md` files | 90 |
| Total size | 797 KB |
| Top-level "true memory" (`.serena/memories/`) | 1 file, 15.9 KB |
| Per-ticket scratchpads (`.serena/ticket/<T>/`) | ~89 files, ~780 KB |
| Distinct ticket directories | 28 |

### Format sample (high signal — see `diagnostic-logging-conventions.md`)

```markdown
# Quick-Test / Diagnostic Logging Conventions

User-imposed rules for **temporary diagnostic logging** added during investigation
work (e.g. "add logs to figure out why X is missing"). These apply when the
intent is throwaway — code that will be removed once the bug is understood —
NOT for permanent telemetry.

## Rules

1. **Use `console.log`, not `console.warn` / `console.error`.**
   - Diagnostics are observational, not warnings.
   - Don't trip console-mocking test setups...
```

Files vary widely:
- **Conventions / lessons** (e.g. `diagnostic-logging-conventions.md`, `git_workflow_critical_lessons.md`) → **highest value, evergreen**
- **PR descriptions** (`PR-description.md` × ~20) → ticket-specific, lower long-term value
- **Investigation notes** (`investigation.md`, `root-cause-analysis.md`) → high value
- **Reference indexes** (`file-index.md` × 6) → medium, ticket-bound

### Adapter design notes

- **Two import strategies**:
  1. **All-in**: import all 90 files; tag with `ticket=<dir>` for filtering.
  2. **Curated**: import only `.serena/memories/` + manually whitelisted lessons (avoid PR-description noise). User probably wants strategy 1 with a `--filter` flag.
- **Frontmatter**: most files have **no** YAML frontmatter. Adapter should derive metadata from path + filename + first H1.
- **Common filenames** (`PR-description.md` × 20): adapter MUST disambiguate by parent dir; otherwise titles collide in the index.
- **Multilingual**: many files mix English + Chinese (e.g. `diagnostic-logging-conventions.md` quotes user in Chinese). Embedding model must support both languages — confirms B-research's recommendation against `bge-small-en-v1.5`.

### Read/Write capability

| Op | Recommended | Why |
|---|---|---|
| Read `.serena/memories/*.md` | ✅ | Already plain markdown |
| Read `.serena/ticket/**/*.md` | ✅ | Same |
| Write new memories to `.serena/memories/` | ✅ | Compatible with Serena MCP convention |
| Write to `.serena/ticket/<T>/` | ⚠️ | Should respect ticket-bound nature; require `--ticket` flag |

---

## A.5 Cross-source observations

### A.5.1 Total volume estimate

| Source | Files | Raw size | Est. tokens after text extraction |
|---|---:|---:|---:|
| Claude Code | 156 | 35 MB | ~3-5M |
| Codex | 29 | 17 MB | ~1.5-2.5M |
| Cursor | 59 | 15 MB | ~1.5-2M |
| Serena | 90 | 0.8 MB | ~150-200K |
| **TOTAL** | **334** | **~68 MB** | **~6-10M tokens** |

This fits comfortably in:
- SQLite FTS5 (FTS5 indexes ~7M tokens easily, sub-second queries)
- Vector index at 384 dims: ~10M tokens × ~1.3 docs/k chunks ≈ 7-10K vectors → trivial for `sqlite-vec` or LanceDB

### A.5.2 cwd / repo grouping

All three IDE sources expose `cwd` (Claude+Cursor: encoded in dir name; Codex: in `session_meta.payload.cwd`).
**This means we can deliver "search only in `vault` repo" cross-source queries from M3.** Important for lup's multi-repo workflow.

### A.5.3 Multilingual concern

Serena notes mix English + Chinese fluently. **B-research already flagged this** — `bge-small-en` insufficient. Need either:
- `bge-m3` (multilingual, ~600MB ONNX) — overkill for offline?
- `paraphrase-multilingual-MiniLM-L12-v2` (~120MB)
- Or skip vectors for Serena adapter and only do FTS5 (which is language-agnostic)

### A.5.4 What's NOT a memory source (skip these)

| Path | Why skip |
|---|---|
| `~/.claude/{cache,debug,logs,paste-cache,statsig,telemetry,temp,statusline}` | Runtime / telemetry |
| `~/.codex/{log,sandbox*,vendor_imports,.tmp}` | Runtime |
| `~/.cursor/{extensions,browser-logs,plugins/.../cache}` | Runtime |
| `.serena/{cache,scripts}` | Tooling |
| Cursor workspace dirs without `agent-transcripts/` (32 of 43) | Empty / temp / IDs |

### A.5.5 Surprises worth following up

1. **`~/.codex/logs_2.sqlite` is 44 MB**. If it contains structured tool calls / outcomes (not just stderr), it's a richer source than the JSONL sessions. **TODO in F-research**.
2. **`~/.codex/memories/` exists**. Probably OMX-style memories. **TODO in F-research**.
3. **`~/.claude/transcripts/` exists separately from `projects/<>/.jsonl`**. Possibly a deduplicated/exported view. **TODO**.
4. **`~/.claude/sessions/` exists separately too**. Worth a one-liner glance.
5. **PDM-51412 ticket** is currently active (your focused file is `pr-description-new.md` there). Adapter can use ticket recency as a signal.

---

## A.6 Adapter implementation effort estimates (rough)

| Adapter | Lines of code | Test files needed | Half-day estimate |
|---|---:|---:|---|
| `serena` | ~80 LoC (just glob + read + frontmatter parse) | 1 | ✅ Half day |
| `cursor` | ~120 LoC (workspace decode + line parse + tag strip) | 1 | ✅ Half day |
| `codex` | ~150 LoC (date traversal + multi-event-type) | 1 | ✅ ~1 day |
| `claude-code` | ~180 LoC (event-type union + project decode) | 1 | ✅ ~1 day |
| **5 adapters** | **~530 LoC** | **5** | **~3 days** |

**This is well within M3's 1-week budget**. Spec's M3 allocation is realistic.

---

## A.7 Decisions surfaced for spec / design

| Question | Suggested answer based on this research |
|---|---|
| Should Claude/Codex/Cursor adapters be read-only? | **Yes for transcripts**; rules files (CLAUDE.md / AGENTS.md / .cursor/rules) can be **append-only** with confirmation |
| Should Serena adapter be writable? | **Yes** — it matches Serena MCP convention naturally |
| Should `.serena/ticket/**` be a separate sub-adapter? | **No** — same root, just metadata-tag differently |
| Embedding model multilingual requirement | **Hard requirement** — `bge-small-en` is insufficient |
| Codex `logs_2.sqlite` and `memories/` | **Investigate in F**, then decide for M2 |
| Junk Cursor workspaces | **Filter at adapter level** with `existsSync(decoded)` check |

---

## References

- Live filesystem inspection on `lup`'s machine, 2026-05-14
- Spec: `D:\Works\AI\Skills\loci-v2\specs\spec.md` §7
- Sample files cited inline (paths in each section)
