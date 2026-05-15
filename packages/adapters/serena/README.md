# @oh-my-memories/adapter-serena

Cat B (MCP) adapter for [Serena MCP](https://github.com/oraios/serena) memories.

## What it reads

`<projectRoot>/.serena/memories/*.md` — one markdown file per memory.

Serena memories are per-project (not per-user), so the adapter takes a
`projectRoot` in its constructor; there is no global default storage root
the way Cat A adapters (claude-code, cursor, codex) have.

## Schema mapping

Real-world Serena memories are mostly plain markdown with a `# Title` as the
first line. Optional YAML frontmatter is supported but rare. We map both
shapes onto the canonical `MemoryRecord`:

| `MemoryRecord` field | Source |
|---|---|
| `id` | filename without the `.md` extension (e.g. `vault_build_scripts`) |
| `source` | `'serena'` |
| `sessionId` | _undefined_ — Serena memories are not session-bound |
| `timestamp` | file mtime (Serena does not stamp memories internally) |
| `role` | _undefined_ — these are user-authored notes, not chat turns |
| `text` | markdown body (everything after the closing `---`, or the whole file when no frontmatter is present) |
| `metadata.title` | `frontmatter.title` if present, else first `# heading` from body |
| `metadata.<key>` | every other key parsed from frontmatter (tags, date, etc.) |

## Schema-version policy

`serena/2026-05`. The adapter is forward-compatible:

- **Unknown frontmatter keys** — surfaced verbatim on `metadata`, never dropped.
- **Missing frontmatter** — the file is treated as plain markdown body. NOT
  counted as malformed.
- **Malformed frontmatter** — unclosed `---` block, broken YAML, freeform
  lines that aren't `key: value`. The adapter does NOT crash; it emits the
  record with the entire file as `text` and increments
  `lastScanStats.corruptLines` so `omem doctor` can flag it.
- **Empty files** — silently skipped (no payload to recall).

We deliberately reuse the SDK's `corruptLines` counter for malformed
frontmatter even though Serena is not line-streamed. PLAN.md §2 Lane D
locks this substitution: malformed frontmatter is the resilience surface
that replaces Cat A's per-line JSONL contract.

## Usage

```ts
import { SerenaAdapter } from '@oh-my-memories/adapter-serena';

const adapter = new SerenaAdapter({ projectRoot: process.cwd() });

const detect = await adapter.detect();
if (!detect.present) {
  console.log(`No serena memories at ${detect.storageRoot}`);
  return;
}

for await (const record of adapter.scan()) {
  console.log(record.id, '—', record.metadata?.title ?? '(no title)');
}

console.log('stats:', adapter.lastScanStats);
// { recordCount, corruptLines, filesScanned, filesSkipped, durationMs }
```

## Tests

| File | Covers |
|---|---|
| `tests/adapter.test.ts` | identity (`id` / `category` / `displayName`) and `detect()` for present / missing / `.serena`-without-`memories` cases |
| `tests/paths.test.ts` | `resolveStorageRoot()` joins on the OS separator and never expands `~` |
| `tests/parser.test.ts` | `scan()` emits canonical records from frontmatter / no-frontmatter / empty / multi-file fixtures |
| `tests/malformed-frontmatter.test.ts` | broken YAML and unclosed `---` blocks are tolerated; mixed-fixture scan exposes the right count via `lastScanStats.corruptLines` |

Fixtures in `tests/fixtures/` are real-shaped (sampled from a working Serena
install with PII scrubbed) per PLAN.md §3 cross-cutting rule 3.

## Spec references

- `specs/spec.md` §3.1 — Cat B adapter contract
- `specs/spec.md` §7.2 — resilience requirement (corrupt input must not crash)
- `docs/PLAN.md` §2 Lane D — DoD checklist (identical to Lane A's, with
  `malformed-frontmatter.test.ts` substituted for `corrupt.test.ts`)
- `docs/ADAPTER-SDK.md` — `IMcpAdapter` shape and authoring guide
