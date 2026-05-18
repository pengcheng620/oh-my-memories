import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
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

export interface GeminiCliAdapterOptions {
  storageRoot?: string;
}

export class GeminiCliAdapter implements IIdeAdapter {
  readonly id = 'gemini-cli';
  readonly category = 'ide' as const;
  readonly displayName = 'Gemini CLI';

  #storageRoot: string;
  lastScanStats: ScanResult | null = null;

  constructor(opts?: GeminiCliAdapterOptions) {
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
    const filesSkipped = 0;

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

    // Scan JSONL chat files under tmp/<hash>/chats/
    const chatFiles = await this.#findJsonlFiles(this.#storageRoot);

    // Also scan the global GEMINI.md memory file
    const geminiMdPath = join(this.#storageRoot, 'GEMINI.md');

    try {
      for (const file of chatFiles) {
        filesScanned++;
        yield* parseJsonl(file, stats, this.id);
      }

      if (existsSync(geminiMdPath)) {
        filesScanned++;
        const content = await readFile(geminiMdPath, 'utf8');
        if (content.trim()) {
          stats.recordCount++;
          yield {
            id: 'gemini-global-memory',
            source: this.id,
            timestamp: new Date(),
            role: 'system',
            text: content,
            metadata: { type: 'global-memory', path: geminiMdPath },
          };
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

  async #findJsonlFiles(root: string): Promise<string[]> {
    const tmpDir = join(root, 'tmp');
    if (!existsSync(tmpDir)) return [];

    const entries = await readdir(tmpDir, { recursive: true });
    const out: string[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.endsWith('.jsonl')) {
        out.push(join(tmpDir, entry));
      }
    }
    return out;
  }
}
