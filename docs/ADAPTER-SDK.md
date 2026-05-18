# ADAPTER-SDK.md — write your own adapter

> **Status**: `@oh-my-memories/adapter-sdk@1.0.0` is semver-major-stable as of M4. No breaking changes until 2.0.0.

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

Cat C (saas) is harder: rate limits, auth, network failures. Built-in adapters cover Cat A (Claude Code, Cursor, Codex, Gemini CLI, OpenCode) and Cat B (Serena, Basic Memory). We accept Cat C contributions in M2+.

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
  // Optional: semver of your adapter package.
  // Shown by `omem adapter list` so users know which version is installed.
  readonly version = '1.0.0';

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

## Publishing your adapter (M4+)

Third-party adapters publish under the `@omem-adapter/*` npm scope and are discovered
automatically by `omem adapter install` / `omem adapter list`.

### Minimum `package.json`

```json
{
  "name": "@omem-adapter/my-tool",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js"
  },
  "peerDependencies": {
    "@oh-my-memories/adapter-sdk": ">=1.0.0"
  }
}
```

**Why `peerDependencies`?** The CLI bundles `adapter-sdk`; listing it as a peer prevents
a second copy of the types landing in the plugin and causing `instanceof` mismatches.

### Default export

Your package's main entry **must** have a default export that satisfies `IBaseAdapter`:

```ts
// src/index.ts
import type { IIdeAdapter } from '@oh-my-memories/adapter-sdk';
import { MyToolAdapter } from './adapter.js';

const adapter: IIdeAdapter = new MyToolAdapter();
export default adapter;
```

The plugin loader reads `module.default` first, then the module namespace itself. An
anonymous `export default` works just as well as a named class.

### Installing and testing locally

```bash
# Install during development (local path install):
omem adapter install ./path/to/my-tool

# Verify it loaded:
omem adapter list

# Run a real scan:
omem scan

# Remove it:
omem adapter uninstall my-tool
```

### ID collision policy

If two installed plugins share the same `id`, the first one loaded (alphabetically by
package directory name) wins and a `OMEM-W02-PLUGIN-ID-COLLISION` warning is emitted.
Pick a unique, hyphen-separated ID in the `@omem-adapter/*` namespace.

## Contributing checklist

- [ ] Adapter fits one of the 3 categories
- [ ] Canonical record shape (no custom fields outside `metadata`)
- [ ] Streaming `scan()`
- [ ] Schema drift / corrupt-line tolerance
- [ ] Cross-platform path resolution
- [ ] All 3+ mandatory tests
- [ ] Fixtures in `tests/fixtures/<adapter>/`
- [ ] README in package root
- [ ] `version` field set on adapter class
- [ ] `peerDependencies` on `@oh-my-memories/adapter-sdk >= 1.0.0`
- [ ] Tested with `omem adapter install ./local-path` before publishing
