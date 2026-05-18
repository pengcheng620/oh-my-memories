import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ExportableAdapter, MANIFEST_FILENAME, runExport } from '../src/export';

// Tests use system tar to extract (mirrors the production import path) — see
// packages/core/src/import.ts `extractArchive` for why we don't use npm tar's
// extract on Bun/Windows.
async function extractToDir(archive: string, cwd: string): Promise<void> {
  await mkdir(cwd, { recursive: true });
  await new Promise<void>((resolveX, rejectX) => {
    const proc = spawn('tar', ['-xzf', archive, '-C', cwd], { windowsHide: true });
    proc.on('error', rejectX);
    proc.on('close', (code) => {
      if (code === 0) resolveX();
      else rejectX(new Error(`tar exited with ${code}`));
    });
  });
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'omem-export-test-'));
}

function makeAdapter(id: string, schemaId: string, root: string): ExportableAdapter {
  return {
    id,
    schemaId,
    storageRoot() {
      return root;
    },
  };
}

function deterministicIdFactory(): () => string {
  let n = 0;
  return () => `id-${(++n).toString(16).padStart(8, '0')}`;
}

describe('runExport', () => {
  let workdir: string;
  beforeEach(() => {
    workdir = tmp();
  });
  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  test('skips adapters whose storage root does not exist', async () => {
    const ghost = makeAdapter('ghost', 'ghost/1', join(workdir, 'nonexistent'));
    const result = await runExport({
      sources: [ghost],
      outputPath: join(workdir, 'out.tar.gz'),
      idFactory: deterministicIdFactory(),
      clock: () => new Date('2026-05-15T18:00:00Z'),
      omemVersion: '0.0.0-test',
    });
    expect(result.manifest.summary.skippedSources).toEqual(['ghost']);
    expect(result.manifest.summary.fileCount).toBe(0);
    expect(existsSync(result.outputPath)).toBe(true);
  });

  test('packs raw files, manifest sits at archive root, totals match', async () => {
    const root = join(workdir, 'cursor-root');
    mkdirSync(join(root, 'projects', 'demo', 'agent-transcripts', 'sess1'), { recursive: true });
    const filePath = join(root, 'projects', 'demo', 'agent-transcripts', 'sess1', 'sess1.jsonl');
    writeFileSync(filePath, '{"role":"user"}\n', 'utf8');

    const out = join(workdir, 'export.tar.gz');
    const result = await runExport({
      sources: [makeAdapter('cursor', 'cursor/2026-05', root)],
      outputPath: out,
      idFactory: deterministicIdFactory(),
      clock: () => new Date('2026-05-15T18:00:00Z'),
      omemVersion: '0.0.0-test',
    });

    expect(result.manifest.summary.fileCount).toBe(1);
    expect(result.manifest.summary.totalBytes).toBeGreaterThan(0);
    expect(result.manifest.sources[0]?.files).toEqual([
      'cursor/projects/demo/agent-transcripts/sess1/sess1.jsonl',
    ]);

    const extractDir = join(workdir, 'unpacked');
    mkdirSync(extractDir, { recursive: true });
    await extractToDir(out, extractDir);

    expect(existsSync(join(extractDir, MANIFEST_FILENAME))).toBe(true);
    expect(
      existsSync(
        join(extractDir, 'cursor', 'projects', 'demo', 'agent-transcripts', 'sess1', 'sess1.jsonl'),
      ),
    ).toBe(true);

    const manifest = JSON.parse(readFileSync(join(extractDir, MANIFEST_FILENAME), 'utf8'));
    expect(manifest.kind).toBe('omem-export');
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.archiveId).toBe('id-00000');
  });

  test('--since filter excludes files older than threshold', async () => {
    const root = join(workdir, 'src');
    mkdirSync(root, { recursive: true });
    const oldFile = join(root, 'old.jsonl');
    writeFileSync(oldFile, 'x', 'utf8');
    // Force the file's mtime to two days ago so the since filter excludes it.
    const old = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const fs = require('node:fs') as typeof import('node:fs');
    fs.utimesSync(oldFile, old / 1000, old / 1000);

    const newFile = join(root, 'new.jsonl');
    writeFileSync(newFile, 'y', 'utf8');

    const result = await runExport({
      sources: [makeAdapter('codex', 'codex/2026-04', root)],
      outputPath: join(workdir, 'a.tar.gz'),
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
      idFactory: deterministicIdFactory(),
      clock: () => new Date('2026-05-15T18:00:00Z'),
      omemVersion: '0.0.0-test',
    });
    expect(result.manifest.summary.fileCount).toBe(1);
    expect(result.manifest.sources[0]?.files).toEqual(['codex/new.jsonl']);
  });

  test('records adapter schemaId in source entry', async () => {
    const root = join(workdir, 'cc');
    mkdirSync(join(root, 'projects', 'demo'), { recursive: true });
    writeFileSync(join(root, 'projects', 'demo', 'a.jsonl'), 'a\n', 'utf8');
    const result = await runExport({
      sources: [makeAdapter('claude-code', 'claude-code/2026-05', root)],
      outputPath: join(workdir, 'cc.tar.gz'),
      idFactory: deterministicIdFactory(),
      clock: () => new Date('2026-05-15T18:00:00Z'),
      omemVersion: '0.0.0-test',
    });
    expect(result.manifest.sources[0]?.schemaId).toBe('claude-code/2026-05');
  });
});
