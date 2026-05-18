import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { create } from 'tar';

// `omem export --all` produces a tar.gz archive of each present adapter's
// raw on-disk storage (their JSONL files etc.) plus a top-level
// `manifest.json` for provenance. Spec §9 ("Adjacent: omem export --all
// and omem import <archive>...") frames this as the offline backup story.
//
// Design notes:
//   - We bundle RAW files, not normalized records, because the goal is a
//     true backup that can rehydrate each adapter's storage byte-for-byte.
//     If we exported only MemoryRecord JSON, restore would require a
//     re-encoder per adapter and we'd lose anything outside our schema.
//   - The manifest is the single source of truth for what's inside; the
//     importer reads it first, validates, then unpacks.
//   - The archive layout mirrors the on-disk layout under each source root
//     so import can simply copy `claude-code/...` back to `<home>/.claude/...`.

export const MANIFEST_FILENAME = 'manifest.json';

/** What the orchestrator needs from each adapter to export it. */
export interface ExportableAdapter {
  readonly id: string;
  readonly schemaId: string;
  /** Absolute path that holds this adapter's raw files (or "" if none). */
  storageRoot(): string;
}

export interface ExportInput {
  readonly sources: readonly ExportableAdapter[];
  /** Where the .tar.gz lands. Parent dir will be created. */
  readonly outputPath: string;
  /** Filter by mtime; files older than this are skipped. Default: include all. */
  readonly since?: Date;
  /** Override `randomUUID()` for deterministic tests. */
  readonly idFactory?: () => string;
  /** Override `new Date()` for deterministic tests. */
  readonly clock?: () => Date;
  /** Override the omem version recorded in the manifest. */
  readonly omemVersion: string;
  /** Override the staging dir (tests). Default: `tmpdir/omem-export-<id>`. */
  readonly stagingDir?: string;
}

export interface ExportSourceEntry {
  readonly id: string;
  readonly schemaId: string;
  readonly storageRoot: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  /** Files listed relative to the archive root (e.g. `cursor/projects/...`). */
  readonly files: readonly string[];
}

export interface ExportManifest {
  readonly manifestVersion: 1;
  readonly kind: 'omem-export';
  readonly ts: string;
  readonly archiveId: string;
  readonly omemVersion: string;
  readonly platform: NodeJS.Platform;
  readonly node: string;
  readonly filters: { since?: string };
  readonly sources: readonly ExportSourceEntry[];
  readonly summary: {
    readonly sourceCount: number;
    readonly fileCount: number;
    readonly totalBytes: number;
    readonly skippedSources: readonly string[];
  };
}

export interface ExportResult {
  readonly manifest: ExportManifest;
  readonly outputPath: string;
}

export async function runExport(input: ExportInput): Promise<ExportResult> {
  const idFactory = input.idFactory ?? defaultIdFactory;
  const clock = input.clock ?? (() => new Date());
  const archiveId = idFactory().slice(0, 8);
  const startedAt = clock();

  const stagingRoot = input.stagingDir ?? join(tmpdir(), `omem-export-${archiveId}`);
  await mkdir(stagingRoot, { recursive: true });

  const sourceEntries: ExportSourceEntry[] = [];
  const skippedSources: string[] = [];
  let totalFiles = 0;
  let totalBytes = 0;

  for (const adapter of input.sources) {
    const root = adapter.storageRoot();
    if (root === '' || !(await pathExists(root))) {
      skippedSources.push(adapter.id);
      continue;
    }

    const files: string[] = [];
    let bytes = 0;
    for await (const file of walk(root)) {
      if (input.since !== undefined) {
        const st = await stat(file);
        if (st.mtimeMs < input.since.getTime()) continue;
      }
      const rel = relative(root, file).split(sep).join('/');
      const archiveRel = `${adapter.id}/${rel}`;
      const stagingDest = join(stagingRoot, adapter.id, rel);
      await mkdir(dirname(stagingDest), { recursive: true });
      const buf = await Bun.file(file).arrayBuffer();
      await writeFile(stagingDest, Buffer.from(buf));
      files.push(archiveRel);
      bytes += buf.byteLength;
    }
    files.sort();
    if (files.length === 0) {
      skippedSources.push(adapter.id);
      continue;
    }
    sourceEntries.push({
      id: adapter.id,
      schemaId: adapter.schemaId,
      storageRoot: root,
      fileCount: files.length,
      totalBytes: bytes,
      files,
    });
    totalFiles += files.length;
    totalBytes += bytes;
  }

  const manifest: ExportManifest = {
    manifestVersion: 1,
    kind: 'omem-export',
    ts: startedAt.toISOString(),
    archiveId,
    omemVersion: input.omemVersion,
    platform: process.platform,
    node: process.versions.node,
    filters: input.since !== undefined ? { since: input.since.toISOString() } : {},
    sources: sourceEntries,
    summary: {
      sourceCount: sourceEntries.length,
      fileCount: totalFiles,
      totalBytes,
      skippedSources,
    },
  };

  await writeFile(
    join(stagingRoot, MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  await mkdir(dirname(resolve(input.outputPath)), { recursive: true });
  // We pass the staging root as `cwd` and then list its contents so the
  // archive's top level contains `manifest.json` + per-source dirs without
  // a wrapping folder name (which would force importers to special-case it).
  //
  // `follow: true` is required for top-level regular files to be packed on
  // Windows — without it tar's symlink-detection silently drops `manifest.json`.
  // We're packing real files (no symlinks), so dereferencing is a no-op cost.
  const entries = await readdir(stagingRoot);
  await create(
    {
      gzip: true,
      file: input.outputPath,
      cwd: stagingRoot,
      portable: true,
      follow: true,
    },
    entries,
  );

  return { manifest, outputPath: resolve(input.outputPath) };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function* walk(root: string): AsyncIterable<string> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function defaultIdFactory(): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}
