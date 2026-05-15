import { existsSync } from 'node:fs';
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

export interface CodexAdapterOptions {
  // Override the default ~/.codex/sessions path. Used by tests to point at
  // a tmp fixture root; production callers should pass nothing.
  storageRoot?: string;
}

export class CodexAdapter implements IIdeAdapter {
  readonly id = 'codex';
  readonly category = 'ide' as const;
  readonly displayName = 'OpenAI Codex';

  #storageRoot: string;

  // Set after `scan()` finishes draining. Mirrors the lastScanStats side
  // channel established by Lane A — corrupt-line and timestamp-malformed
  // counts surface here so `omem doctor` can flag schema drift.
  lastScanStats: ScanResult | null = null;

  constructor(opts?: CodexAdapterOptions) {
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
    const filesSkipped = 0; // Lane E1 owns the denylist; M1: zero skips.

    if (!existsSync(this.#storageRoot)) {
      this.lastScanStats = {
        recordCount: 0,
        corruptLines: 0,
        filesScanned: 0,
        filesSkipped: 0,
        durationMs: Date.now() - start,
      };
      return;
    }

    const files = await this.#findJsonlFiles(this.#storageRoot);
    try {
      for (const file of files) {
        filesScanned++;
        const sessionId = basename(file, '.jsonl');
        yield* parseJsonl(file, stats, { source: this.id, sessionId });
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
    // Codex layout: <root>/<YYYY>/<MM>/<DD>/rollout-<...>.jsonl. We accept
    // any depth so tests can use simpler layouts and so future codex
    // versions that flatten or re-shard the dir tree keep working.
    const entries = await readdir(root, { recursive: true });
    const out: string[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.endsWith('.jsonl')) {
        out.push(join(root, entry));
      }
    }
    out.sort();
    return out;
  }
}
