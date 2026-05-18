import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ExportableAdapter, runExport } from '../src/export';
import { ImportError, runImport } from '../src/import';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'omem-import-test-'));
}

function deterministicIdFactory(): () => string {
  let n = 0;
  return () => `id-${(++n).toString(16).padStart(8, '0')}`;
}

function adapter(id: string, root: string): ExportableAdapter {
  return { id, schemaId: `${id}/test`, storageRoot: () => root };
}

async function makeArchive(workdir: string, files: Record<string, string>): Promise<string> {
  const cursorRoot = join(workdir, 'cursor-source');
  mkdirSync(cursorRoot, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(cursorRoot, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  const out = join(workdir, 'archive.tar.gz');
  await runExport({
    sources: [adapter('cursor', cursorRoot)],
    outputPath: out,
    idFactory: deterministicIdFactory(),
    clock: () => new Date('2026-05-15T18:00:00Z'),
    omemVersion: '0.0.0-test',
  });
  return out;
}

describe('runImport', () => {
  let workdir: string;
  beforeEach(() => {
    workdir = tmp();
  });
  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  test('throws OMEM-E26 when archive is missing', async () => {
    let err: unknown;
    try {
      await runImport({
        archivePath: join(workdir, 'nope.tar.gz'),
        destinationHomeRoot: join(workdir, 'home'),
        mode: 'dry-run',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).code).toBe('OMEM-E26-IMPORT-ARCHIVE');
  });

  test('throws OMEM-E27 when archive lacks manifest.json', async () => {
    const out = join(workdir, 'nomanifest.tar.gz');
    const stage = join(workdir, 'stage');
    mkdirSync(stage, { recursive: true });
    writeFileSync(join(stage, 'random.txt'), 'hi', 'utf8');
    const tar = await import('tar');
    await tar.create({ gzip: true, file: out, cwd: stage, follow: true }, ['random.txt']);

    let err: unknown;
    try {
      await runImport({
        archivePath: out,
        destinationHomeRoot: join(workdir, 'home'),
        mode: 'dry-run',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).code).toBe('OMEM-E27-IMPORT-MANIFEST');
  });

  test('dry-run produces simulated results without writing', async () => {
    // Files inside Cursor's storageRoot live at <encoded-cwd>/agent-transcripts/<sess>/<sess>.jsonl
    const archive = await makeArchive(workdir, {
      'demo/agent-transcripts/sess1/sess1.jsonl': '{"role":"user"}\n',
    });
    const home = join(workdir, 'home');
    const result = await runImport({
      archivePath: archive,
      destinationHomeRoot: home,
      mode: 'dry-run',
    });
    expect(result.manifest.mode).toBe('dry-run');
    expect(result.manifest.summary.simulated).toBe(1);
    expect(result.manifest.summary.restored).toBe(0);
    expect(
      existsSync(
        join(home, '.cursor', 'projects', 'demo', 'agent-transcripts', 'sess1', 'sess1.jsonl'),
      ),
    ).toBe(false);
  });

  test('apply writes files into destination home and reports restored count', async () => {
    const archive = await makeArchive(workdir, {
      'demo/agent-transcripts/sess1/sess1.jsonl': 'CONTENT\n',
    });
    const home = join(workdir, 'home');
    const result = await runImport({
      archivePath: archive,
      destinationHomeRoot: home,
      mode: 'apply',
    });
    expect(result.manifest.mode).toBe('apply');
    expect(result.manifest.summary.restored).toBe(1);
    const restored = join(
      home,
      '.cursor',
      'projects',
      'demo',
      'agent-transcripts',
      'sess1',
      'sess1.jsonl',
    );
    expect(existsSync(restored)).toBe(true);
    expect(readFileSync(restored, 'utf8')).toBe('CONTENT\n');
  });

  test('skip-on-conflict leaves existing destination files intact', async () => {
    const archive = await makeArchive(workdir, {
      'demo/agent-transcripts/sess1/sess1.jsonl': 'NEW\n',
    });
    const home = join(workdir, 'home');
    const dest = join(
      home,
      '.cursor',
      'projects',
      'demo',
      'agent-transcripts',
      'sess1',
      'sess1.jsonl',
    );
    mkdirSync(join(dest, '..'), { recursive: true });
    writeFileSync(dest, 'EXISTING\n', 'utf8');

    const result = await runImport({
      archivePath: archive,
      destinationHomeRoot: home,
      mode: 'apply',
      onConflict: 'skip',
    });
    expect(result.manifest.summary.skipped).toBe(1);
    expect(result.manifest.summary.restored).toBe(0);
    expect(readFileSync(dest, 'utf8')).toBe('EXISTING\n');
  });

  test('overwrite replaces existing destination files', async () => {
    const archive = await makeArchive(workdir, {
      'demo/agent-transcripts/sess1/sess1.jsonl': 'NEW\n',
    });
    const home = join(workdir, 'home');
    const dest = join(
      home,
      '.cursor',
      'projects',
      'demo',
      'agent-transcripts',
      'sess1',
      'sess1.jsonl',
    );
    mkdirSync(join(dest, '..'), { recursive: true });
    writeFileSync(dest, 'EXISTING\n', 'utf8');

    const result = await runImport({
      archivePath: archive,
      destinationHomeRoot: home,
      mode: 'apply',
      onConflict: 'overwrite',
    });
    expect(result.manifest.summary.restored).toBe(1);
    expect(readFileSync(dest, 'utf8')).toBe('NEW\n');
  });

  test('reports unknown-adapter for ids omem does not know how to restore', async () => {
    // Hand-craft a manifest claiming an unknown adapter id and pack it.
    const stage = join(workdir, 'stage');
    mkdirSync(stage, { recursive: true });
    const fake = {
      manifestVersion: 1,
      kind: 'omem-export',
      ts: '2026-05-15T18:00:00Z',
      archiveId: 'id-00000001',
      omemVersion: '0.0.0-test',
      platform: 'linux',
      node: '22.0.0',
      filters: {},
      sources: [
        {
          id: 'mystery-ide',
          schemaId: 'mystery/1',
          storageRoot: '/x',
          fileCount: 1,
          totalBytes: 1,
          files: ['mystery-ide/foo.jsonl'],
        },
      ],
      summary: { sourceCount: 1, fileCount: 1, totalBytes: 1, skippedSources: [] },
    };
    writeFileSync(join(stage, 'manifest.json'), JSON.stringify(fake), 'utf8');
    mkdirSync(join(stage, 'mystery-ide'), { recursive: true });
    writeFileSync(join(stage, 'mystery-ide', 'foo.jsonl'), 'x', 'utf8');
    const tar = await import('tar');
    const out = join(workdir, 'mystery.tar.gz');
    await tar.create({ gzip: true, file: out, cwd: stage, follow: true }, [
      'manifest.json',
      'mystery-ide',
    ]);

    const result = await runImport({
      archivePath: out,
      destinationHomeRoot: join(workdir, 'home'),
      mode: 'apply',
    });
    expect(result.manifest.summary.failed).toBe(1);
    expect(result.manifest.results[0]?.reason).toContain('unknown-adapter');
  });
});
