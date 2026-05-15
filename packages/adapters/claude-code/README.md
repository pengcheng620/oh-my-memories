# @oh-my-memories/adapter-claude-code

Claude Code memory source adapter for **oh-my-memories**. Reads transcripts from
`~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` and yields canonical
`MemoryRecord`s through the SDK's `IIdeAdapter` contract.

This is the **Cat A pilot** adapter — Lane A in `docs/PLAN.md` §2. The other
M1 adapters (`cursor`, `codex`, `gemini-cli`) are derivatives of this shape.

## Install

```bash
bun add @oh-my-memories/adapter-claude-code
```

Workspace consumers depend on `workspace:*`.

## Usage

```ts
import { ClaudeCodeAdapter } from '@oh-my-memories/adapter-claude-code';

const adapter = new ClaudeCodeAdapter();
// or, in tests / sandboxed environments:
//   new ClaudeCodeAdapter({ storageRoot: '/tmp/fixture-root' })

const detect = await adapter.detect();
if (!detect.present) return;

for await (const record of adapter.scan()) {
  // record.id, record.source, record.timestamp, record.role, record.text, record.sessionId?
}

console.log(adapter.lastScanStats);
// → { recordCount, corruptLines, filesScanned, filesSkipped, durationMs }
```

## Storage layout (Claude Code)

```
~/.claude/
├── projects/
│   └── <encoded-cwd>/
│       ├── <sessionId>.jsonl              ← top-level session
│       └── <sessionId>/subagents/*.jsonl  ← sub-agent sessions (also scanned)
└── settings.json                           (adapter ignores)
```

Cross-platform path: the adapter resolves the storage root with `os.homedir()`,
so `%USERPROFILE%\.claude\projects` (Windows), `~/.claude/projects` (macOS,
Linux), and tmp roots in tests all work identically. There is no literal `~`
in adapter code.

## JSONL event schema (M1, observed in Claude Code 2.x)

This adapter **only** treats lines whose `type` is `user` or `assistant`
(and whose `isMeta` is not `true`) as memory turns. Everything else is
silently skipped — see `docs/spec.md` §3.1 *forward-compat schema drift*.

Fields the adapter reads:

| Source field        | Mapped to                             | Notes |
|---------------------|---------------------------------------|-------|
| `uuid`              | `MemoryRecord.id`                     | required, used as canonical id |
| `sessionId`         | `MemoryRecord.sessionId` (optional)   | omitted when absent |
| `timestamp`         | `MemoryRecord.timestamp` (Date)       | ISO 8601 string parsed |
| `message.role`      | `MemoryRecord.role`                   | one of `user`/`assistant`/`system`/`tool` |
| `message.content`   | `MemoryRecord.text`                   | string, OR text blocks joined from array |
| _(constant)_        | `MemoryRecord.source = 'claude-code'` | the adapter's `id` |

### Schema-version policy (per `docs/PLAN.md` §2 DoD)

This adapter targets the Claude Code JSONL transcript shape **observed in
Claude Code 2.x** (Nov 2025 – May 2026). There is no published version
header in the file; we treat the schema as eventually-consistent and apply
two forward-compat rules:

1. **Unknown `type` values are skipped silently.** Adding `attachment`,
   `permission-mode`, etc. upstream will not break us.
2. **Unknown fields are ignored.** Only `uuid` / `sessionId` / `timestamp` /
   `message.role` / `message.content` / `isMeta` are read; the rest of the
   raw line is opaque.

If Anthropic ships a breaking schema change (renamed `uuid` or `timestamp`),
the adapter will silently emit zero records — `lastScanStats.recordCount`
will be `0` against a non-empty source. The CLI surfaces this via
`omem doctor` (Lane C, future).

## Resilience (per spec §7.2)

Malformed JSON lines (truncated writes, partial flushes) are counted in
`lastScanStats.corruptLines` and skipped without aborting the scan. Tests
in `tests/corrupt.test.ts` lock this behavior.
