# @oh-my-memories/adapter-shared

Internal helpers used by every built-in JSONL adapter (`claude-code`,
`cursor`, `codex`). Not a public package — external SDK consumers depend
on `@oh-my-memories/adapter-sdk` directly and parse however they like.

## Why a separate package

Per [`docs/PLAN.md`](../../../docs/PLAN.md) §3 rule 1 and
[`specs/spec.md`](../../../specs/spec.md) §7.2, the streaming JSONL
primitive lives in exactly one place so the corrupt-line tolerance contract
cannot drift between adapters. Keeping it here (rather than in
`@oh-my-memories/adapter-sdk`) means:

- External adapter authors don't take a transitive dependency on Node's
  `fs`/`readline` if they're parsing some other format.
- The SDK surface stays minimal and stable; this package is free to
  evolve as our adapters do.

## Surface

```ts
import {
  streamJsonl,            // async generator yielding JsonlLine
  type JsonlLine,         // { ok: true, value: unknown } | { ok: false, error: string }
  createParseStats,       // factory for { recordCount, corruptLines }
  type ParseStats,        // the counter type
  isMemoryRole,           // type guard for 'user'|'assistant'|'system'|'tool'
  extractTextBlocks,      // string | null from Anthropic-style content arrays
} from '@oh-my-memories/adapter-shared';
```

### `streamJsonl(path)`

Streams one line at a time. Empty/whitespace-only lines are skipped
silently. Per-line `JSON.parse` errors yield `{ ok: false, error }` and
the iterator continues — never throws.

### `extractTextBlocks(content, allowedTypes?)`

Reduces a `message.content` value to a concatenated string. Pass-through
for plain strings; for arrays, picks blocks whose `type` is in
`allowedTypes` (default `{'text'}`). Returns `null` if nothing matched.

Adapters use the optional set to opt into their schema's vocabulary:

| Adapter | `allowedTypes` |
|----|----|
| claude-code, cursor | default (`{'text'}`) |
| codex | `{'input_text', 'output_text'}` |

## Tests

```bash
bun test packages/adapters/_shared
```

11 tests across `jsonl.test.ts` (5 streaming + 2 ParseStats + 2 role guard)
and `content.test.ts` (8 content-block scenarios). Coverage gates apply
the same way as production adapters (≥ 80%, per `bunfig.toml`).
