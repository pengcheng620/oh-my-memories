# @oh-my-memories/adapter-sdk

Public adapter interface for [oh-my-memories](https://github.com/pengcheng620/oh-my-memories).

Implement one of these to add a new memory source:

- `IIdeAdapter` — for AI IDEs that store memory locally (Cat A): Claude Code, Cursor, Codex, Gemini CLI, Copilot, ...
- `IMcpAdapter` — for local MCP memory servers with on-disk storage we can read (Cat B): Serena, basic-memory, ...
- `ISaasAdapter` — for remote SaaS memory services (Cat C): mem0, Letta, Zep, Cognee, ...

See [`docs/ADAPTER-SDK.md`](../../docs/ADAPTER-SDK.md) in the main repo for the full author guide.

## Minimal example

```ts
import type { IIdeAdapter, MemoryRecord, ScanOptions } from '@oh-my-memories/adapter-sdk';

export class MyToolAdapter implements IIdeAdapter {
  readonly id = 'my-tool';
  readonly category = 'ide' as const;
  readonly displayName = 'My Tool';

  storageRoot() {
    return /* resolve cross-platform path */;
  }

  async detect() {
    return { present: /* check if storageRoot exists */, storageRoot: this.storageRoot() };
  }

  async *scan(opts?: ScanOptions): AsyncIterable<MemoryRecord> {
    for await (const file of /* walk storageRoot */) {
      for await (const record of /* parse file */) {
        yield record;
      }
    }
  }
}
```
