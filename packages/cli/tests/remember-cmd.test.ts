import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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

let omemHome: string;

beforeEach(() => {
  omemHome = mkdtempSync(join(tmpdir(), 'omem-remember-'));
});

afterEach(() => {
  try {
    rmSync(omemHome, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const opts = () => {
  const stdout = new MemoryStream();
  const stderr = new MemoryStream();
  return {
    stdout,
    stderr,
    streams: { stdout, stderr },
    options: {
      stdout,
      stderr,
      env: { NO_COLOR: '1', OMEM_HOME: omemHome } as NodeJS.ProcessEnv,
      stdinIsTty: false,
    },
  };
};

describe('omem remember', () => {
  test('rejects missing positional arg with OMEM-E01-USAGE', async () => {
    const ctx = opts();
    const code = await main(['remember'], ctx.options);
    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });

  test('rejects whitespace-only text with OMEM-E29-REMEMBER-EMPTY', async () => {
    const ctx = opts();
    const code = await main(['remember', '   '], ctx.options);
    expect(code).toBe(1);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E29-REMEMBER-EMPTY');
  });

  test('rejects malformed --metadata with OMEM-E30-REMEMBER-METADATA', async () => {
    const ctx = opts();
    const code = await main(['remember', 'note', '--metadata', 'not-json'], ctx.options);
    expect(code).toBe(1);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E30-REMEMBER-METADATA');
  });

  test('rejects --metadata that is JSON but not an object', async () => {
    const ctx = opts();
    const code = await main(['remember', 'note', '--metadata', '[1,2,3]'], ctx.options);
    expect(code).toBe(1);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E30-REMEMBER-METADATA');
  });

  test('rejects --role outside the enum', async () => {
    const ctx = opts();
    const code = await main(['remember', 'note', '--role', 'admin'], ctx.options);
    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });

  test('writes a record and creates the canonical.db on first call', async () => {
    const ctx = opts();
    const code = await main(['remember', 'always run tests', '--json'], ctx.options);
    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text());
    expect(result.created).toBe(true);
    expect(result.id).toMatch(/^[0-9a-f]{8}-/);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.dbPath).toBe(join(omemHome, 'canonical.db'));
    expect(existsSync(result.dbPath)).toBe(true);
  });

  test('second remember of identical text returns created:false', async () => {
    const ctx = opts();
    const ts = '2026-05-15T12:00:00Z';
    const codeA = await main(['remember', 'one truth', '--timestamp', ts, '--json'], ctx.options);
    expect(codeA).toBe(0);
    const idA = JSON.parse(ctx.streams.stdout.text()).id;

    const ctx2 = opts();
    ctx2.options.env = ctx.options.env; // same OMEM_HOME
    const codeB = await main(['remember', 'one truth', '--timestamp', ts, '--json'], ctx2.options);
    expect(codeB).toBe(0);
    const result = JSON.parse(ctx2.streams.stdout.text());
    expect(result.created).toBe(false);
    expect(result.id).toBe(idA);
  });

  test('human output: created vs already-known', async () => {
    {
      const ctx = opts();
      const code = await main(
        ['remember', 'human note', '--timestamp', '2026-05-15T12:00:00Z'],
        ctx.options,
      );
      expect(code).toBe(0);
      expect(ctx.streams.stdout.text()).toContain('(created)');
    }
    {
      const ctx = opts();
      const code = await main(
        ['remember', 'human note', '--timestamp', '2026-05-15T12:00:00Z'],
        ctx.options,
      );
      expect(code).toBe(0);
      expect(ctx.streams.stdout.text()).toContain('(already known)');
    }
  });

  test('accepts metadata + session + role together', async () => {
    const ctx = opts();
    const code = await main(
      [
        'remember',
        'meeting summary',
        '--source',
        'omem',
        '--session',
        'sprint-25',
        '--role',
        'user',
        '--metadata',
        '{"tag":"meeting"}',
        '--json',
      ],
      ctx.options,
    );
    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text());
    expect(result.created).toBe(true);
  });
});
