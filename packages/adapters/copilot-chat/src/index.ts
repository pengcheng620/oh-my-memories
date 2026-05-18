import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  DetectResult,
  IIdeAdapter,
  MemoryRecord,
  ScanOptions,
} from '@oh-my-memories/adapter-sdk';
import { type ParseStats, extractRecords, reconstructSession } from './parser';
import { resolveVscodeDataDirs } from './paths';

export class CopilotChatAdapter implements IIdeAdapter {
  readonly id = 'copilot-chat';
  readonly category = 'ide' as const;
  readonly displayName = 'GitHub Copilot Chat (VS Code)';
  readonly version = '0.1.0';

  readonly #dataDirs: string[];
  #stats: ParseStats = { totalFiles: 0, totalRecords: 0, corruptLines: 0 };

  constructor(opts?: { dataDirs?: string[] }) {
    this.#dataDirs = opts?.dataDirs ?? resolveVscodeDataDirs();
  }

  storageRoot(): string {
    return this.#dataDirs[0] ?? '';
  }

  get stats(): Readonly<ParseStats> {
    return this.#stats;
  }

  async detect(): Promise<DetectResult> {
    for (const dir of this.#dataDirs) {
      const ws = join(dir, 'workspaceStorage');
      if (existsSync(ws)) {
        return { present: true, storageRoot: dir };
      }
    }
    return { present: false, storageRoot: this.storageRoot() };
  }

  async *scan(_opts?: ScanOptions): AsyncIterable<MemoryRecord> {
    this.#stats = { totalFiles: 0, totalRecords: 0, corruptLines: 0 };

    for (const dir of this.#dataDirs) {
      const wsRoot = join(dir, 'workspaceStorage');
      if (!existsSync(wsRoot)) continue;

      // Also check globalStorage/emptyWindowChatSessions
      const globalSessions = join(dir, 'globalStorage', 'emptyWindowChatSessions');
      const chatDirs = await this.#findChatSessionDirs(wsRoot);
      if (existsSync(globalSessions)) chatDirs.push(globalSessions);

      for (const chatDir of chatDirs) {
        yield* this.#scanChatDir(chatDir);
      }
    }
  }

  async #findChatSessionDirs(wsRoot: string): Promise<string[]> {
    const dirs: string[] = [];
    try {
      const workspaces = await readdir(wsRoot);
      for (const ws of workspaces) {
        const chatDir = join(wsRoot, ws, 'chatSessions');
        if (existsSync(chatDir)) {
          dirs.push(chatDir);
        }
      }
    } catch { /* non-fatal */ }
    return dirs;
  }

  async *#scanChatDir(chatDir: string): AsyncIterable<MemoryRecord> {
    let entries: string[];
    try {
      entries = await readdir(chatDir);
    } catch {
      return;
    }

    for (const file of entries) {
      if (!file.endsWith('.jsonl') && !file.endsWith('.json')) continue;
      const filePath = join(chatDir, file);
      this.#stats.totalFiles++;

      try {
        const content = await readFile(filePath, 'utf8');

        if (file.endsWith('.jsonl')) {
          const lines = content.split('\n');
          const session = reconstructSession(lines, this.#stats);
          if (session) {
            const records = extractRecords(session, filePath, this.#stats);
            for (const r of records) yield r;
          }
        } else {
          // Pre-v1.109 JSON format: full session object
          try {
            const session = JSON.parse(content) as Record<string, unknown>;
            const records = extractRecords(session as Parameters<typeof extractRecords>[0], filePath, this.#stats);
            for (const r of records) yield r;
          } catch {
            this.#stats.corruptLines++;
          }
        }
      } catch { /* unreadable file — skip */ }
    }
  }
}
