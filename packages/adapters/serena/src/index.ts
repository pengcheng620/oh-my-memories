import { existsSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type {
  DetectResult,
  IMcpAdapter,
  MemoryRecord,
  ScanOptions,
  ScanResult,
} from '@oh-my-memories/adapter-sdk';
import { parseMarkdown } from './parser';
import { resolveStorageRoot } from './paths';

export interface SerenaAdapterOptions {
  /** Absolute path to the project that owns the `.serena/memories/` directory. */
  projectRoot: string;
}

// Schema version: serena/2026-05. See README for the policy.
//
// Cat B (MCP) adapter — reads project-local `.serena/memories/*.md`.
// Unlike Cat A adapters, Serena is per-project, so the constructor REQUIRES
// `projectRoot`; there is no global default. Callers wanting "the project I'm
// in right now" should pass `process.cwd()` or a configured project root.

export class SerenaAdapter implements IMcpAdapter {
  readonly id = 'serena';
  readonly category = 'mcp' as const;
  readonly displayName = 'Serena MCP';

  readonly #storageRoot: string;

  // Set after `scan()` finishes draining. Per PLAN.md §2 Lane D, malformed
  // frontmatter is the resilience surface that substitutes for Cat A's
  // corrupt-line counter; we reuse the SDK's `corruptLines` field rather than
  // adding a new one (cross-lane rule: don't touch adapter-sdk).
  lastScanStats: ScanResult | null = null;

  constructor(opts: SerenaAdapterOptions) {
    this.#storageRoot = resolveStorageRoot(opts.projectRoot);
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
    let recordCount = 0;
    let corruptLines = 0;
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

    const files = await this.#findMarkdownFiles(this.#storageRoot);
    try {
      for (const file of files) {
        filesScanned++;
        const raw = await readFile(file, 'utf8');
        // Empty / whitespace-only files emit nothing — there's no payload
        // to recall and no metadata to derive. They still count toward
        // filesScanned so `omem doctor` can flag them.
        if (raw.trim().length === 0) continue;
        const parsed = parseMarkdown(raw);
        if (parsed.malformed) corruptLines++;

        const id = basename(file, '.md');
        const timestamp = statSync(file).mtime;
        const metadata: Record<string, unknown> = { ...parsed.frontmatter };
        // Always surface a title on metadata when we can derive one — even
        // for files without frontmatter. It's the most-asked-for pivot
        // downstream (recall UI, CLI table column).
        if (parsed.title !== undefined && metadata.title === undefined) {
          metadata.title = parsed.title;
        }

        metadata.filePath = file;

        recordCount++;
        const record: MemoryRecord = {
          id,
          source: this.id,
          timestamp,
          text: parsed.body,
          metadata,
        };
        yield record;
      }
    } finally {
      this.lastScanStats = {
        recordCount,
        corruptLines,
        filesScanned,
        filesSkipped,
        durationMs: Date.now() - start,
      };
    }
  }

  async #findMarkdownFiles(root: string): Promise<string[]> {
    // Serena's layout is flat — `.serena/memories/*.md`. We still walk
    // recursively so future Serena versions that nest categories don't
    // require a parser change here.
    const entries = await readdir(root, { recursive: true });
    const out: string[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.endsWith('.md')) {
        out.push(join(root, entry));
      }
    }
    out.sort();
    return out;
  }
}
