import { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type {
  DetectResult,
  IIdeAdapter,
  MemoryRecord,
  ScanOptions,
  ScanResult,
} from '@oh-my-memories/adapter-sdk';
import { type ParseStats, parseJsonl } from './parser';
import { resolveDefaultStorageRoot } from './paths';

export interface CursorAdapterOptions {
  // Override the default ~/.cursor/projects path. Used by tests to point at
  // a tmp fixture root; production callers should pass nothing.
  storageRoot?: string;
}

export class CursorAdapter implements IIdeAdapter {
  readonly id = 'cursor';
  readonly category = 'ide' as const;
  readonly displayName = 'Cursor';

  #storageRoot: string;

  // Set after `scan()` finishes draining. PLAN.md §2 Lane A DoD requires the
  // corrupt-line counter to be exposed via a side channel; we mirror that here
  // for parity across all M1 adapters.
  lastScanStats: ScanResult | null = null;

  constructor(opts?: CursorAdapterOptions) {
    this.#storageRoot = opts?.storageRoot ?? resolveDefaultStorageRoot();
  }

  storageRoot(): string {
    return this.#storageRoot;
  }

  async detect(): Promise<DetectResult> {
    return {
      present: existsSync(this.#storageRoot),
      storageRoot: this.#storageRoot,
    };
  }

  async *scan(_opts?: ScanOptions): AsyncIterable<MemoryRecord> {
    const start = Date.now();
    const stats: ParseStats = { recordCount: 0, corruptLines: 0 };
    let filesScanned = 0;
    const filesSkipped = 0; // Lane E1 owns the denylist; M1 stub: zero skips.

    if (!existsSync(this.#storageRoot)) {
      this.lastScanStats = {
        recordCount: 0,
        corruptLines: 0,
        filesScanned,
        filesSkipped,
        durationMs: Date.now() - start,
      };
      return;
    }

    const files = await this.#findJsonlFiles(this.#storageRoot);
    try {
      for (const file of files) {
        filesScanned++;
        const sessionId = basename(file, '.jsonl');
        const fileTimestamp = statSync(file).mtime;
        yield* parseJsonl(file, stats, { source: this.id, sessionId, fileTimestamp });
      }
    } finally {
      this.lastScanStats = {
        recordCount: stats.recordCount,
        corruptLines: stats.corruptLines,
        filesScanned,
        filesSkipped,
        durationMs: Date.now() - start,
      };
    }
  }

  async #findJsonlFiles(root: string): Promise<string[]> {
    // Cursor's nesting is <storageRoot>/<project-id>/agent-transcripts/<sess>/<sess>.jsonl.
    // readdir({recursive:true}) gives us paths relative to root in Node 20+/Bun 1.1+.
    // We accept any depth so tests can use simpler layouts and so future cursor
    // schema changes (extra subdirs) keep working without code changes.
    const entries = await readdir(root, { recursive: true });
    const out: string[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.endsWith('.jsonl')) {
        out.push(join(root, entry));
      }
    }
    return out;
  }
}
