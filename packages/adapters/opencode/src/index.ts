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
import { type ParseStats, parseStorage } from './parser';
import { resolveDefaultStorageRoot } from './paths';

export interface OpenCodeAdapterOptions {
  storageRoot?: string;
}

export class OpenCodeAdapter implements IIdeAdapter {
  readonly id = 'opencode';
  readonly category = 'ide' as const;
  readonly displayName = 'OpenCode';

  #storageRoot: string;
  lastScanStats: ScanResult | null = null;

  constructor(opts?: OpenCodeAdapterOptions) {
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

    try {
      const storageDirs = await this.#findStorageDirs();
      for (const storageDir of storageDirs) {
        filesScanned++;
        yield* parseStorage(storageDir, stats, this.id);
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

  async #findStorageDirs(): Promise<string[]> {
    const dirs: string[] = [];

    // Primary: <root>/storage/ — the documented layout since OpenCode v1
    const rootStorage = join(this.#storageRoot, 'storage');
    if (existsSync(rootStorage)) dirs.push(rootStorage);

    // Legacy / alternative: global/storage and project/<hash>/storage
    const globalStorage = join(this.#storageRoot, 'global', 'storage');
    if (existsSync(globalStorage)) dirs.push(globalStorage);

    const projectDir = join(this.#storageRoot, 'project');
    if (existsSync(projectDir)) {
      try {
        const projects = await readdir(projectDir);
        for (const p of projects) {
          const pStorage = join(projectDir, p, 'storage');
          if (existsSync(pStorage)) dirs.push(pStorage);
        }
      } catch { /* non-fatal */ }
    }

    return dirs;
  }
}
