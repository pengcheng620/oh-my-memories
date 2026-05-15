import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  DetectResult,
  IIdeAdapter,
  MemoryRecord,
  ScanOptions,
  ScanResult,
} from '@oh-my-memories/adapter-sdk';
import { type ParseStats, parseJsonl } from './parser';
import { resolveDefaultStorageRoot } from './paths';

export interface ClaudeCodeAdapterOptions {
  // Override the default ~/.claude/projects path. Used by tests to point at
  // a tmp fixture root; production callers should pass nothing.
  storageRoot?: string;
}

export class ClaudeCodeAdapter implements IIdeAdapter {
  readonly id = 'claude-code';
  readonly category = 'ide' as const;
  readonly displayName = 'Claude Code';

  #storageRoot: string;

  // Set after `scan()` finishes draining. PLAN.md §2 Lane A DoD requires the
  // corrupt-line counter to be exposed via a side channel; we reuse the SDK's
  // ScanResult shape so future federation/CLI code can consume it uniformly.
  lastScanStats: ScanResult | null = null;

  constructor(opts?: ClaudeCodeAdapterOptions) {
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
        yield* parseJsonl(file, stats, this.id);
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
    // readdir({recursive:true}) returns paths relative to root in Node 20+/Bun 1.1+.
    // We accept any depth — Claude Code ships sessions at <root>/<project>/*.jsonl
    // and sub-agent sessions under <root>/<project>/<sid>/subagents/*.jsonl.
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
