# @oh-my-memories/adapter-cursor

Cursor IDE memory source adapter for **oh-my-memories**. Reads
`agent-transcripts` JSONL files under `~/.cursor/projects/<encoded-cwd>/agent-transcripts/<sessionId>/<sessionId>.jsonl` and yields canonical `MemoryRecord`s through the SDK's `IIdeAdapter` contract.

This is **Lane B** in `docs/PLAN.md` §2 — a Cat A IDE adapter, derivative of Lane A's Claude Code adapter shape, but with cursor-specific schema mapping.

## Install

```bash
bun add @oh-my-memories/adapter-cursor
```

Workspace consumers depend on `workspace:*`.

## Usage

```ts
import { CursorAdapter } from '@oh-my-memories/adapter-cursor';

const adapter = new CursorAdapter();
// or, in tests / sandboxed environments:
//   new CursorAdapter({ storageRoot: '/tmp/fixture-root' })

const detect = await adapter.detect();
if (!detect.present) return;

for await (const record of adapter.scan()) {
  // record.id, record.source, record.timestamp, record.role, record.text, record.sessionId
}

console.log(adapter.lastScanStats);
// → { recordCount, corruptLines, filesScanned, filesSkipped, durationMs }
```

## Storage layout (Cursor)

```
~/.cursor/
└── projects/
    └── <encoded-cwd>/                ← workspace path with separators replaced by '-'
        └── agent-transcripts/
            └── <sessionId>/          ← UUID dir per chat session
                └── <sessionId>.jsonl ← line-per-turn transcript
```

Cross-platform path: the adapter resolves the storage root with `os.homedir()`,
so `%USERPROFILE%\.cursor\projects` (Windows), `~/.cursor/projects` (macOS,
Linux), and tmp roots in tests all work identically. There is no literal `~`
in adapter code (locked by `paths.test.ts`).

## JSONL event schema (Cursor v1.x, observed May 2026)

Cursor stores raw chat turns at the top level of each line — there is **no**
envelope with type/uuid/timestamp like Claude Code uses:

```json
{"role":"user","message":{"content":[{"type":"text","text":"..."}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"..."},{"type":"tool_use","name":"Read","input":{}}]}}
```

Field-by-field mapping to `MemoryRecord`:

| Source field        | Mapped to                              | Notes |
|---------------------|----------------------------------------|-------|
| `role` (top-level)  | `MemoryRecord.role`                    | one of `user`/`assistant`/`system`/`tool`; unknown roles silently skipped |
| `message.content`   | `MemoryRecord.text`                    | string OR `text`-block array joined; `tool_use`/`tool_result`/image blocks dropped |
| _(constant)_        | `MemoryRecord.source = 'cursor'`       | the adapter's `id` |
| _(derived)_         | `MemoryRecord.sessionId`               | from JSONL filename (basename without `.jsonl`) |
| _(derived)_         | `MemoryRecord.id = '<sessionId>#<lineIndex>'` | line index is 0-based within the file; deterministic |
| _(derived)_         | `MemoryRecord.timestamp`               | the file's mtime — Cursor doesn't record per-turn timestamps |

### Schema-version policy (per `docs/PLAN.md` §2 DoD)

This adapter targets the Cursor agent-transcripts JSONL shape **observed in
Cursor v1.x (May 2026)**. There is no published version header in the file;
we treat the schema as eventually-consistent and apply two forward-compat rules:

1. **Unknown role values are skipped silently.** If a future Cursor version
   adds a `tool` role, system metadata role, etc., they pass through cleanly
   (they're already in the `MemoryRole` union); anything else is dropped.
2. **Unknown content-block types are ignored.** Only blocks with
   `type === 'text'` and a string `text` field contribute to `MemoryRecord.text`.
   New block types (e.g., `image`, `code-execution`, ...) are silently dropped.

If Cursor ships a breaking schema change (e.g., renames `role` to `kind`),
the adapter will silently emit zero records — `lastScanStats.recordCount`
will be `0` against a non-empty source. The CLI surfaces this via
`omem doctor` (Lane C/E2, future).

### Why no per-turn timestamp?

Cursor's JSONL format records the ordered conversation but not when each
turn occurred. Two pragmatic choices:

- **What we do**: assign every record in a file the file's `mtime`. This
  preserves per-session ordering for `omem recall --since` cohort filters and
  is monotonic across files (later sessions have larger mtimes).
- **What we don't do**: synthesize fake monotonic timestamps per line. That
  would mislead any future per-turn timing analysis.

Consumers needing finer ordering should use `record.id` (which encodes the
zero-based line index) for tie-breaking within a session.

## Resilience (per spec §7.2)

Malformed JSON lines (truncated writes, partial flushes) are counted in
`lastScanStats.corruptLines` and skipped without aborting the scan. Tests
in `tests/corrupt.test.ts` lock this behavior.

The streaming primitive lives in
[`@oh-my-memories/adapter-shared`](../_shared/) (`streamJsonl`) so the
corrupt-line tolerance contract is implemented in exactly one place across
all three Cat A adapters. The text-block extractor (`extractTextBlocks`)
and role guard (`isMemoryRole`) come from the same package.

## Test fixtures

Three real-shaped fixtures live under `tests/fixtures/`:

- `valid.jsonl` — 4 turns: 2 user + 2 assistant (the last assistant turn
  contains a `tool_use` block to exercise content-block filtering).
- `corrupt-line.jsonl` — 3 lines: valid → malformed JSON → valid.
- `empty.jsonl` — empty file (proves the adapter doesn't crash on empties).

Per `docs/PLAN.md` §3 cross-cutting rule 3, these are real-shaped, captured
from a working Cursor install and PII-scrubbed.
