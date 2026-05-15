# @oh-my-memories/adapter-codex

Cat A (IDE) adapter for [OpenAI Codex CLI](https://github.com/openai/codex)
session rollouts.

## What it reads

`<homedir>/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<iso-ts>-<thread-uuid>.jsonl`

Each rollout is one JSONL session captured by `codex_cli_rs ≥ 0.116.0`. We
walk the date partitions recursively, so the adapter keeps working if a
future codex version flattens or re-shards the layout.

## Schema mapping

Codex JSONL is structurally different from Claude Code and Cursor. Each
line has a top-level `type` discriminating the event kind, and a `payload`
holding the content. We only care about a narrow slice:

```jsonc
{
  "timestamp": "2026-04-02T10:00:04.000Z",
  "type": "response_item",
  "payload": {
    "type": "message",
    "role": "user",                    // or "assistant"; we drop "developer"
    "content": [
      { "type": "input_text", "text": "..." },
      { "type": "output_text", "text": "..." }   // joined into one .text
    ]
  }
}
```

Other top-level types we silently skip: `session_meta` (file header),
`event_msg` (lifecycle), `turn_context` (per-turn config). Other payload
types we silently skip: `reasoning` (model's internal monologue),
`function_call`, `function_call_output`, `web_search_call`, `custom_tool_call`,
`custom_tool_call_output`. Other content block types we silently skip:
`input_image`, `reasoning_text`.

| `MemoryRecord` field | Source |
|---|---|
| `id` | `<sessionId>#<lineIndex>` (no per-line UUID in the codex schema) |
| `source` | `'codex'` |
| `sessionId` | filename basename (e.g. `rollout-2026-04-02T10-00-00-019d2900-...`) |
| `timestamp` | top-level `timestamp` ISO-8601 string parsed to `Date` |
| `role` | `payload.role` (limited to `user` / `assistant` / `system` / `tool`; `developer` is dropped) |
| `text` | concatenation of every `input_text` / `output_text` block |

## Schema-version policy

`codex/2026-04`. The adapter is forward-compatible:

- **Unknown top-level `type`** — silently skipped. Codex ships breaking
  schema additions mid-release; this contract assumes new event kinds will
  appear and the adapter must not error on them.
- **Unknown payload `type`** — silently skipped (see above).
- **Unknown content block types** — silently skipped. Future video / file
  blocks won't break the parser.
- **`developer`-role messages** — silently skipped. They are runtime-injected
  system instructions (skill list, sandbox policy, base prompt) — not
  user-authored memories.
- **Malformed JSON line** — `lastScanStats.corruptLines++` and continue.
  Per `specs/spec.md` §7.2, a malformed line MUST NOT crash the iterator.
- **Message line with unparseable `timestamp`** — counted under
  `corruptLines` and dropped. A memory with no real Date is useless for
  the recency-weighted federation step downstream.

## Usage

```ts
import { CodexAdapter } from '@oh-my-memories/adapter-codex';

const adapter = new CodexAdapter();

const detect = await adapter.detect();
if (!detect.present) {
  console.log(`No codex sessions at ${detect.storageRoot}`);
  return;
}

for await (const record of adapter.scan()) {
  console.log(record.timestamp.toISOString(), record.role, record.text.slice(0, 60));
}

console.log('stats:', adapter.lastScanStats);
// { recordCount, corruptLines, filesScanned, filesSkipped, durationMs }
```

## Tests

| File | Covers |
|---|---|
| `tests/adapter.test.ts` | identity (`id` / `category` / `displayName`) and `detect()` for present / missing storageRoot |
| `tests/paths.test.ts` | `resolveDefaultStorageRoot()` lives under `homedir()` and ends with `.codex/sessions`; never expands `~` |
| `tests/parser.test.ts` | `scan()` emits the 4 user/assistant turns from `valid.jsonl`, drops `developer` / `reasoning` / `function_call` / `input_image`, joins multiple text blocks, uses per-line timestamps, preserves chronological order |
| `tests/corrupt.test.ts` | malformed JSON line does NOT crash; valid records around the corruption are still yielded; `lastScanStats.corruptLines` reports the count |

Fixtures in `tests/fixtures/` are real-shaped (modeled after a working
codex install with PII scrubbed) per PLAN.md §3 cross-cutting rule 3.

## Spec references

- `specs/spec.md` §3.1 — Cat A adapter contract
- `specs/spec.md` §7.2 — resilience requirement (corrupt input must not crash)
- `docs/PLAN.md` §2 Lane C — DoD checklist (identical to Lane A's, with
  the codex-specific schema notes above)
- `docs/ADAPTER-SDK.md` — `IIdeAdapter` shape and authoring guide
