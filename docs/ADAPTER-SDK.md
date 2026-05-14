# ADAPTER-SDK.md — write your own adapter

> **Status**: SDK exists in M1; semver-major-stable in M4. Until M4, breaking changes can happen in any minor.

## What an adapter does

Read records from some memory source, emit them in the canonical `MemoryRecord` shape. That's it.

The adapter does NOT:
- Index, search, or rank
- Talk to MCP, the CLI, or other adapters
- Persist anything
- Decide what's "important"

## Pick a category

| Category | Use when ... | Interface |
|----|----|----|
| `ide` | The source is an AI IDE that stores memory locally on disk | `IIdeAdapter` |
| `mcp` | The source is a local MCP memory server with on-disk storage we can read | `IMcpAdapter` |
| `saas` | The source is a remote SaaS service requiring API calls | `ISaasAdapter` |

Cat C (saas) is harder: rate limits, auth, network failures. M1 only has Cat A and B built in. We accept Cat C contributions in M2+.

## Minimal Cat A (IDE) adapter

```ts
import {
  type DetectResult,
  type IIdeAdapter,
  type MemoryRecord,
  type ScanOptions,
} from '@oh-my-memories/adapter-sdk';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

export class MyToolAdapter implements IIdeAdapter {
  readonly id = 'my-tool';
  readonly category = 'ide' as const;
  readonly displayName = 'My Tool';

  storageRoot(): string {
    return join(homedir(), '.my-tool', 'memory');
  }

  async detect(): Promise<DetectResult> {
    const root = this.storageRoot();
    return { present: existsSync(root), storageRoot: root };
  }

  async *scan(_opts?: ScanOptions): AsyncIterable<MemoryRecord> {
    const root = this.storageRoot();
    if (!existsSync(root)) return;

    const files = await readdir(root);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await readFile(join(root, file), 'utf8');
        const data = JSON.parse(content) as MyToolRecord[];
        for (const r of data) {
          yield {
            id: r.id,
            source: this.id,
            timestamp: new Date(r.created_at),
            role: r.role,
            text: r.content,
          };
        }
      }
    }
  }
}

interface MyToolRecord {
  id: string;
  created_at: string;
  role: 'user' | 'assistant';
  content: string;
}
```

## Required behaviors (these are non-negotiable)

1. **Streaming**: `scan()` is `AsyncIterable`. Never load whole files into memory.
2. **Schema drift tolerance**: read only the fields you care about; ignore unknown fields silently.
3. **Corrupt-line tolerance**: a malformed line in JSONL must NOT abort. Skip it. Increment a counter.
4. **Denylist**: skip files matching the safety denylist. (TODO: M2 will expose a helper from adapter-sdk; M1 the CLI does it pre-adapter.)
5. **Read-only in M1**: do NOT write to the source.
6. **Cross-platform paths**: never hardcode `~`. Use `os.homedir()`. Test on Windows.

## Tests required

Drop fixtures in `tests/fixtures/<your-adapter>/`:
- `valid.jsonl` — 3+ valid records
- `corrupt-line.jsonl` — one malformed line in the middle
- `empty.jsonl` — empty file

Then in `packages/adapters/<your-adapter>/tests/`:
- `detect.test.ts` — detect returns true/false correctly
- `scan.test.ts` — emits expected records from `valid.jsonl`
- `corrupt.test.ts` — handles `corrupt-line.jsonl` without throwing

## Publishing your adapter

Until M4, adapters live in this monorepo. Open a PR adding `packages/adapters/<your-tool>/`.

After M4, 3rd-party adapters can publish under the npm scope `@omem-adapter/<your-tool>`. The CLI will auto-discover them via `omem adapter list` / `install`.

## Contributing checklist

- [ ] Adapter fits one of the 3 categories
- [ ] Canonical record shape (no custom fields outside `metadata`)
- [ ] Streaming `scan()`
- [ ] Schema drift / corrupt-line tolerance
- [ ] Cross-platform path resolution
- [ ] All 4 mandatory tests
- [ ] Fixtures in `tests/fixtures/<adapter>/`
- [ ] README in `packages/adapters/<your-tool>/`
- [ ] Listed in this doc + `AGENTS.md` § Packages
