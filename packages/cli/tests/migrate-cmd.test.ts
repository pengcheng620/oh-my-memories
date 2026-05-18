import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

function setup(
  extra: { stdinIsTty?: boolean; approve?: boolean; seedCursor?: boolean } = {},
): TestCtx {
  const fakeHome = mkdtempSync(join(tmpdir(), 'omem-migrate-cmd-'));
  mkdirSync(join(fakeHome, '.cursor', 'projects'), { recursive: true });
  mkdirSync(join(fakeHome, '.claude', 'projects'), { recursive: true });

  // Seed Cursor with a single transcript so 'omem migrate --from cursor'
  // has something to copy. The session id matches the filename per the
  // Cursor reader's contract. Tests that don't need source data can
  // skip this with `seedCursor: false`.
  if (extra.seedCursor !== false) {
    const sessDir = join(fakeHome, '.cursor', 'projects', 'demo', 'agent-transcripts', 'sess1');
    mkdirSync(sessDir, { recursive: true });
    writeFileSync(
      join(sessDir, 'sess1.jsonl'),
      `${JSON.stringify({ role: 'user', message: { content: [{ type: 'text', text: 'hello from cursor' }] } })}\n`,
    );
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

describe('omem migrate', () => {
  let ctx: TestCtx;
  afterEach(() => {
    if (ctx?.fakeHome) rmSync(ctx.fakeHome, { recursive: true, force: true });
  });

  test('rejects missing --from / --to with OMEM-E01-USAGE', async () => {
    ctx = setup();
    const code = await main(['migrate'], ctx.options);
    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E01-USAGE');
    expect(ctx.streams.stderr.text()).toContain("'--from <adapter>'");
  });

  test('rejects unknown destination adapter', async () => {
    ctx = setup();
    const code = await main(['migrate', '--from', 'cursor', '--to', 'nope'], ctx.options);
    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });

  test('rejects read-only destination (serena) with OMEM-E22-MIGRATE-NO-WRITER', async () => {
    ctx = setup();
    const code = await main(['migrate', '--from', 'cursor', '--to', 'serena'], ctx.options);
    expect(code).toBe(1);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E22-MIGRATE-NO-WRITER');
  });

  test('refuses --apply non-interactively without --i-approve-dest-writes', async () => {
    ctx = setup({ stdinIsTty: false });
    const code = await main(
      ['migrate', '--from', 'cursor', '--to', 'codex', '--apply'],
      ctx.options,
    );
    expect(code).toBe(1);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E25-MIGRATE-NO-APPROVE');
  });

  test('dry-run produces a manifest with simulate-write ops, no writes', async () => {
    ctx = setup();
    const code = await main(
      ['migrate', '--from', 'cursor', '--to', 'codex', '--json'],
      ctx.options,
    );
    expect(code).toBe(0);
    const manifest = JSON.parse(ctx.streams.stdout.text()) as {
      dryRun: boolean;
      from: string;
      to: string;
      summary: { written: number; simulated: number };
      manifestPath: string;
    };
    expect(manifest.dryRun).toBe(true);
    expect(manifest.from).toBe('cursor');
    expect(manifest.to).toBe('codex');
    expect(manifest.summary.simulated).toBeGreaterThan(0);
    expect(manifest.summary.written).toBe(0);
    expect(manifest.manifestPath).toContain('migrations');
  });

  test('apply mode with explicit env approval writes records and reports summary', async () => {
    ctx = setup({ stdinIsTty: false, approve: true });
    const code = await main(
      ['migrate', '--from', 'cursor', '--to', 'codex', '--apply', '--json'],
      ctx.options,
    );
    expect(code).toBe(0);
    const manifest = JSON.parse(ctx.streams.stdout.text()) as {
      dryRun: boolean;
      summary: { written: number; failed: number };
    };
    expect(manifest.dryRun).toBe(false);
    expect(manifest.summary.written).toBeGreaterThan(0);
    expect(manifest.summary.failed).toBe(0);
  });

  test('rejects --on-conflict=overwrite for claude-code (policy unsupported)', async () => {
    ctx = setup({ stdinIsTty: false, approve: true });
    const code = await main(
      [
        'migrate',
        '--from',
        'cursor',
        '--to',
        'claude-code',
        '--on-conflict',
        'overwrite',
        '--apply',
      ],
      ctx.options,
    );
    expect(code).toBe(1);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E24-MIGRATE-POLICY');
  });

  test('--strategy=link is rejected as M2.A unsupported', async () => {
    ctx = setup();
    const code = await main(
      ['migrate', '--from', 'cursor', '--to', 'codex', '--strategy', 'link'],
      ctx.options,
    );
    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });
});
