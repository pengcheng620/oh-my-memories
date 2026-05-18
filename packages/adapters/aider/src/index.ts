import { existsSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  DetectResult,
  IIdeAdapter,
  MemoryRecord,
  ScanOptions,
  ScanResult,
} from '@oh-my-memories/adapter-sdk';
import { type ParseStats, parseChatHistory } from './parser';
import { resolveDefaultScanRoot } from './paths';

const HISTORY_FILENAME = '.aider.chat.history.md';
const MAX_SCAN_DEPTH = 4;

export interface AiderAdapterOptions {
  storageRoot?: string;
}

export class AiderAdapter implements IIdeAdapter {
  readonly id = 'aider';
  readonly category = 'ide' as const;
  readonly displayName = 'Aider';

  #storageRoot: string;
  lastScanStats: ScanResult | null = null;

  constructor(opts?: AiderAdapterOptions) {
    this.#storageRoot = opts?.storageRoot ?? resolveDefaultScanRoot();
  }

  storageRoot(): string {
    return this.#storageRoot;
  }

  async detect(): Promise<DetectResult> {
    const files = await this.#findHistoryFiles(this.#storageRoot, 0);
    return {
      present: files.length > 0,
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

    const files = await this.#findHistoryFiles(this.#storageRoot, 0);
    try {
      for (const file of files) {
        filesScanned++;
        const content = await readFile(file, 'utf8');
        if (!content.trim()) continue;
        const records = parseChatHistory(file, content, this.id, stats);
        for (const record of records) {
          yield record;
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

  async #findHistoryFiles(dir: string, depth: number): Promise<string[]> {
    if (depth > MAX_SCAN_DEPTH) return [];

    const out: string[] = [];
    const historyPath = join(dir, HISTORY_FILENAME);
    if (existsSync(historyPath)) {
      out.push(historyPath);
    }

    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const sub = await this.#findHistoryFiles(join(dir, entry.name), depth + 1);
        out.push(...sub);
      }
    } catch { /* permission denied, etc. */ }

    return out;
  }
}
