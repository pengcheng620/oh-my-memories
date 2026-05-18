import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  DetectResult,
  IMcpAdapter,
  MemoryRecord,
  ScanOptions,
  ScanResult,
} from '@oh-my-memories/adapter-sdk';
import { type ParseStats, parseMarkdownNote } from './parser';
import { resolveDefaultStorageRoot } from './paths';

export interface BasicMemoryAdapterOptions {
  storageRoot?: string;
}

export class BasicMemoryAdapter implements IMcpAdapter {
  readonly id = 'basic-memory';
  readonly category = 'mcp' as const;
  readonly displayName = 'Basic Memory';

  #storageRoot: string;
  lastScanStats: ScanResult | null = null;

  constructor(opts?: BasicMemoryAdapterOptions) {
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
    let filesSkipped = 0;

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

    try {
      const mdFiles = await this.#findMarkdownFiles(this.#storageRoot);

      for (const file of mdFiles) {
        try {
          const content = await readFile(file, 'utf8');
          filesScanned++;
          const record = parseMarkdownNote(file, content, this.id, stats);
          if (record) yield record;
        } catch {
          filesSkipped++;
        }
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

  async #findMarkdownFiles(root: string): Promise<string[]> {
    const entries = await readdir(root, { recursive: true });
    const out: string[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.endsWith('.md')) {
        out.push(join(root, entry));
      }
    }
    return out;
  }
}
