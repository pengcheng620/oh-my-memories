import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/index';

class MemoryStream {
  chunks: string[] = [];
  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }
  text(): string {
    return this.chunks.join('');
  }
}

interface TestCtx {
  fakeHome: string;
  options: {
    stdout: MemoryStream;
    stderr: MemoryStream;
    env: NodeJS.ProcessEnv;
    stdinIsTty: boolean;
  };
  streams: { stdout: MemoryStream; stderr: MemoryStream };
}

function setup(extra: { stdinIsTty?: boolean; approve?: boolean; seed?: boolean } = {}): TestCtx {
  const fakeHome = mkdtempSync(join(tmpdir(), 'omem-exp-imp-cmd-'));
  mkdirSync(join(fakeHome, '.cursor', 'projects'), { recursive: true });
  if (extra.seed !== false) {
    const sessDir = join(fakeHome, '.cursor', 'projects', 'demo', 'agent-transcripts', 'sess1');
    mkdirSync(sessDir, { recursive: true });
    writeFileSync(join(sessDir, 'sess1.jsonl'), 'HELLO\n', 'utf8');
  }

  const env: NodeJS.ProcessEnv = {
    NO_COLOR: '1',
    OMEM_HOME: join(fakeHome, '.omem'),
    OMEM_HOME_OVERRIDE: fakeHome,
    ...(extra.approve === true ? { OMEM_I_APPROVE_DEST_WRITES: '1' } : {}),
  };
  const streams = { stdout: new MemoryStream(), stderr: new MemoryStream() };
  return {
    fakeHome,
    options: {
      stdout: streams.stdout,
      stderr: streams.stderr,
      env,
      stdinIsTty: extra.stdinIsTty ?? true,
    },
    streams,
  };
}

describe('omem export', () => {
  let ctx: TestCtx;
  afterEach(() => {
    if (ctx?.fakeHome) rmSync(ctx.fakeHome, { recursive: true, force: true });
  });

  test('rejects missing --output with OMEM-E01-USAGE', async () => {
    ctx = setup();
    const code = await main(['export'], ctx.options);
    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E01-USAGE');
    expect(ctx.streams.stderr.text()).toContain("'--output");
  });

  test('rejects --all combined with --from', async () => {
    ctx = setup();
    const out = join(ctx.fakeHome, 'a.tar.gz');
    const code = await main(['export', '--all', '--from', 'cursor', '--output', out], ctx.options);
    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });

  test('produces a tar.gz with a populated manifest summary', async () => {
    ctx = setup();
    const out = join(ctx.fakeHome, 'backup.tar.gz');
    const code = await main(['export', '--output', out, '--json'], ctx.options);
    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const manifest = JSON.parse(ctx.streams.stdout.text());
    expect(manifest.kind).toBe('omem-export');
    expect(manifest.summary.fileCount).toBeGreaterThan(0);
    expect(manifest.outputPath).toBe(out);
  });

  test('--from with one adapter only packs that adapter', async () => {
    ctx = setup();
    const out = join(ctx.fakeHome, 'cursor-only.tar.gz');
    const code = await main(['export', '--from', 'cursor', '--output', out, '--json'], ctx.options);
    expect(code).toBe(0);
    const manifest = JSON.parse(ctx.streams.stdout.text());
    expect(manifest.sources.map((s: { id: string }) => s.id)).toEqual(['cursor']);
  });
});

describe('omem import', () => {
  let ctx: TestCtx;
  afterEach(() => {
    if (ctx?.fakeHome) rmSync(ctx.fakeHome, { recursive: true, force: true });
  });

  test('rejects missing archive arg with OMEM-E01-USAGE', async () => {
    ctx = setup();
    const code = await main(['import'], ctx.options);
    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });

  test('reports OMEM-E26 when archive does not exist', async () => {
    ctx = setup();
    const code = await main(['import', join(ctx.fakeHome, 'missing.tar.gz')], ctx.options);
    expect(code).toBe(1);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E26-IMPORT-ARCHIVE');
  });

  test('refuses --apply non-interactively without approval', async () => {
    ctx = setup({ stdinIsTty: false });
    const out = join(ctx.fakeHome, 'a.tar.gz');
    await main(['export', '--output', out], ctx.options);
    const code = await main(['import', out, '--apply'], ctx.options);
    expect(code).toBe(1);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E28-IMPORT-NO-APPROVE');
  });

  test('export → import dry-run round-trip JSON', async () => {
    ctx = setup();
    const out = join(ctx.fakeHome, 'rt.tar.gz');
    await main(['export', '--output', out], ctx.options);
    ctx.streams.stdout.chunks = [];
    const code = await main(['import', out, '--json'], ctx.options);
    expect(code).toBe(0);
    const manifest = JSON.parse(ctx.streams.stdout.text());
    expect(manifest.kind).toBe('omem-import-run');
    expect(manifest.mode).toBe('dry-run');
    expect(manifest.summary.simulated).toBeGreaterThan(0);
  });

  test('export → import --apply restores files into a fresh home', async () => {
    ctx = setup({ approve: true });
    const archive = join(ctx.fakeHome, 'a.tar.gz');
    await main(['export', '--output', archive], ctx.options);

    // Build a fresh empty home and import into it via --home.
    const restoreHome = mkdtempSync(join(tmpdir(), 'omem-restore-'));
    try {
      ctx.streams.stdout.chunks = [];
      const code = await main(
        ['import', archive, '--apply', '--home', restoreHome, '--json'],
        ctx.options,
      );
      expect(code).toBe(0);
      const manifest = JSON.parse(ctx.streams.stdout.text());
      expect(manifest.summary.restored).toBeGreaterThan(0);
      const restoredFile = join(
        restoreHome,
        '.cursor',
        'projects',
        'demo',
        'agent-transcripts',
        'sess1',
        'sess1.jsonl',
      );
      expect(existsSync(restoredFile)).toBe(true);
      expect(readFileSync(restoredFile, 'utf8')).toBe('HELLO\n');
    } finally {
      rmSync(restoreHome, { recursive: true, force: true });
    }
  });
});
