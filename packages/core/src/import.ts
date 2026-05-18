import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { type ExportManifest, MANIFEST_FILENAME } from './export';

// `omem import <archive>` reverses `omem export`: extract the tar.gz to a
// staging dir, validate the manifest, then materialize each source's files
// back under a destination home root.
//
// Defaults:
//   - dryRun = true (mirrors migrate)
//   - conflict policy = `skip` (do not overwrite existing files)
//   - destinationHomeRoot = os.homedir() (so `cursor/...` files land in
//     `<home>/.cursor/projects/...`)

export const ADAPTER_HOME_SUBPATHS: Record<string, readonly string[]> = {
  'claude-code': ['.claude', 'projects'],
  cursor: ['.cursor', 'projects'],
  codex: ['.codex', 'sessions'],
  serena: ['.serena'],
};

export interface ImportInput {
  readonly archivePath: string;
  /** Where to materialize files. Defaults to os.homedir(). */
  readonly destinationHomeRoot: string;
  readonly mode: 'dry-run' | 'apply';
  /** What to do when a destination file already exists. */
  readonly onConflict?: 'skip' | 'overwrite';
  /** Override the staging dir (tests). Default: `tmpdir/omem-import-<id>`. */
  readonly stagingDir?: string;
  /** Override `randomUUID()` for deterministic tests. */
  readonly idFactory?: () => string;
  /** Override `new Date()` for deterministic tests. */
  readonly clock?: () => Date;
}

export interface ImportFileResult {
  readonly archiveRelPath: string;
  readonly destPath: string;
  readonly status: 'restored' | 'skipped' | 'simulated' | 'failed';
  readonly reason?: string;
}

export interface ImportResult {
  readonly manifest: ImportRunManifest;
}

export interface ImportRunManifest {
  readonly manifestVersion: 1;
  readonly kind: 'omem-import-run';
  readonly ts: string;
  readonly runId: string;
  readonly archivePath: string;
  readonly archive: ExportManifest;
  readonly mode: 'dry-run' | 'apply';
  readonly onConflict: 'skip' | 'overwrite';
  readonly destinationHomeRoot: string;
  readonly results: readonly ImportFileResult[];
  readonly summary: {
    readonly restored: number;
    readonly skipped: number;
    readonly simulated: number;
    readonly failed: number;
  };
}

export class ImportError extends Error {
  constructor(
    public readonly code: 'OMEM-E26-IMPORT-ARCHIVE' | 'OMEM-E27-IMPORT-MANIFEST',
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export async function runImport(input: ImportInput): Promise<ImportResult> {
  const idFactory = input.idFactory ?? defaultIdFactory;
  const clock = input.clock ?? (() => new Date());
  const runId = idFactory().slice(0, 8);
  const startedAt = clock();
  const onConflict = input.onConflict ?? 'skip';

  if (!(await pathExists(input.archivePath))) {
    throw new ImportError('OMEM-E26-IMPORT-ARCHIVE', `Archive not found: ${input.archivePath}`);
  }

  const stagingRoot = input.stagingDir ?? join(tmpdir(), `omem-import-${runId}`);
  await mkdir(stagingRoot, { recursive: true });

  try {
    await extractArchive(input.archivePath, stagingRoot);
  } catch (err) {
    await safeRm(stagingRoot);
    throw new ImportError(
      'OMEM-E26-IMPORT-ARCHIVE',
      `Failed to extract archive: ${(err as Error).message}`,
    );
  }

  const manifestPath = join(stagingRoot, MANIFEST_FILENAME);
  if (!(await pathExists(manifestPath))) {
    await safeRm(stagingRoot);
    throw new ImportError(
      'OMEM-E27-IMPORT-MANIFEST',
      `Archive missing required '${MANIFEST_FILENAME}'.`,
    );
  }
  let archiveManifest: ExportManifest;
  try {
    archiveManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ExportManifest;
  } catch (err) {
    await safeRm(stagingRoot);
    throw new ImportError(
      'OMEM-E27-IMPORT-MANIFEST',
      `Failed to parse '${MANIFEST_FILENAME}': ${(err as Error).message}`,
    );
  }
  if (archiveManifest.kind !== 'omem-export' || archiveManifest.manifestVersion !== 1) {
    await safeRm(stagingRoot);
    throw new ImportError(
      'OMEM-E27-IMPORT-MANIFEST',
      `Unsupported archive (kind=${archiveManifest.kind}, version=${archiveManifest.manifestVersion}).`,
    );
  }

  const results: ImportFileResult[] = [];
  for (const source of archiveManifest.sources) {
    const homeSub = ADAPTER_HOME_SUBPATHS[source.id];
    if (homeSub === undefined) {
      for (const file of source.files) {
        results.push({
          archiveRelPath: file,
          destPath: '',
          status: 'failed',
          reason: `unknown-adapter:${source.id}`,
        });
      }
      continue;
    }
    const destRoot = join(input.destinationHomeRoot, ...homeSub);
    for (const archiveRel of source.files) {
      const stagedPath = join(stagingRoot, archiveRel.split('/').join(sep));
      const relWithinSource = archiveRel.slice(`${source.id}/`.length);
      const destPath = join(destRoot, relWithinSource.split('/').join(sep));

      if (input.mode === 'dry-run') {
        results.push({ archiveRelPath: archiveRel, destPath, status: 'simulated' });
        continue;
      }

      const destExists = await pathExists(destPath);
      if (destExists && onConflict === 'skip') {
        results.push({
          archiveRelPath: archiveRel,
          destPath,
          status: 'skipped',
          reason: 'exists',
        });
        continue;
      }

      try {
        await mkdir(dirname(destPath), { recursive: true });
        const buf = await Bun.file(stagedPath).arrayBuffer();
        await writeFile(destPath, Buffer.from(buf));
        results.push({ archiveRelPath: archiveRel, destPath, status: 'restored' });
      } catch (err) {
        results.push({
          archiveRelPath: archiveRel,
          destPath,
          status: 'failed',
          reason: (err as Error).message,
        });
      }
    }
  }

  await safeRm(stagingRoot);

  const summary = {
    restored: results.filter((r) => r.status === 'restored').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    simulated: results.filter((r) => r.status === 'simulated').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };

  const manifest: ImportRunManifest = {
    manifestVersion: 1,
    kind: 'omem-import-run',
    ts: startedAt.toISOString(),
    runId,
    archivePath: resolve(input.archivePath),
    archive: archiveManifest,
    mode: input.mode,
    onConflict,
    destinationHomeRoot: input.destinationHomeRoot,
    results,
    summary,
  };

  return { manifest };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function safeRm(p: string): Promise<void> {
  try {
    await rm(p, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Extract a .tar.gz to `cwd` by shelling out to system `tar`.
 *
 * Why not the npm `tar` package? Bun on Windows silently drops files during
 * `tar.extract()` because of incomplete `UV_FS_O_FILEMAP` support
 * (oven-sh/bun#27974). Working around this in JS with `tar.list()` + manual
 * piping has its own stream-timing pitfalls. Every supported platform ships
 * a tar that understands `-xzf`:
 *   - macOS/Linux: GNU tar or bsdtar (preinstalled)
 *   - Windows 10+: bsdtar (preinstalled at C:\Windows\System32\tar.exe)
 * Falling back to spawn keeps extraction simple and bug-free across hosts.
 */
async function extractArchive(archivePath: string, cwd: string): Promise<void> {
  await mkdir(cwd, { recursive: true });
  return new Promise<void>((resolveExtract, rejectExtract) => {
    const proc = spawn('tar', ['-xzf', archivePath, '-C', cwd], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', rejectExtract);
    proc.on('close', (code) => {
      if (code === 0) resolveExtract();
      else rejectExtract(new Error(`tar exited with ${code}: ${stderr.trim()}`));
    });
  });
}

function defaultIdFactory(): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}
