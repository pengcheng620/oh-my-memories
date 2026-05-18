import { afterEach, describe, expect, test } from 'bun:test';
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

const baseOpts = () => {
  const stdout = new MemoryStream();
  const stderr = new MemoryStream();
  return {
    stdout,
    stderr,
    streams: { stdout, stderr },
    options: {
      stdout,
      stderr,
      env: { NO_COLOR: '1' } as NodeJS.ProcessEnv,
      stdinIsTty: false,
    },
  };
};

const REAL_FETCH = globalThis.fetch;

interface FetchMock {
  status: number;
  body: unknown;
  throws?: Error;
}

function installFetchMock(mock: FetchMock | null): void {
  if (mock === null) {
    globalThis.fetch = REAL_FETCH;
    return;
  }
  globalThis.fetch = (async () => {
    if (mock.throws) throw mock.throws;
    return new Response(JSON.stringify(mock.body), {
      status: mock.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('omem upgrade', () => {
  afterEach(() => {
    installFetchMock(null);
  });

  test('rejects positional arg with OMEM-E01-USAGE', async () => {
    const ctx = baseOpts();
    const code = await main(['upgrade', 'nope'], ctx.options);
    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });

  test('rejects --check + --apply combination', async () => {
    const ctx = baseOpts();
    const code = await main(['upgrade', '--check', '--apply'], ctx.options);
    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });

  test('reports up-to-date when registry returns same version (JSON)', async () => {
    installFetchMock({ status: 200, body: { version: '0.1.0-alpha.1' } });
    const ctx = baseOpts();
    const code = await main(['upgrade', '--check', '--json'], ctx.options);
    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text());
    expect(result.upToDate).toBe(true);
    expect(result.current).toBe('0.1.0-alpha.1');
    expect(result.latest).toBe('0.1.0-alpha.1');
    expect(result.applied).toBe(false);
  });

  test('reports newer version available when registry returns one (JSON)', async () => {
    installFetchMock({ status: 200, body: { version: '99.0.0' } });
    const ctx = baseOpts();
    const code = await main(['upgrade', '--check', '--json'], ctx.options);
    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text());
    expect(result.upToDate).toBe(false);
    expect(result.latest).toBe('99.0.0');
    expect(result.npmInstallCommand).toBe('bun install -g oh-my-memories@99.0.0');
    expect(result.binaryReleasesUrl).toContain('github.com');
    expect(result.applied).toBe(false);
  });

  test('returns exit 1 with registryError when registry is unreachable (JSON)', async () => {
    installFetchMock({ status: 0, body: null, throws: new Error('ENOTFOUND registry.npmjs.org') });
    const ctx = baseOpts();
    const code = await main(['upgrade', '--json'], ctx.options);
    expect(code).toBe(1);
    const result = JSON.parse(ctx.streams.stdout.text());
    expect(result.registryError).toContain('ENOTFOUND');
  });

  test('human output when up to date does not mention install command', async () => {
    installFetchMock({ status: 200, body: { version: '0.1.0-alpha.1' } });
    const ctx = baseOpts();
    const code = await main(['upgrade'], ctx.options);
    expect(code).toBe(0);
    expect(ctx.streams.stdout.text()).toContain('omem is up to date');
    expect(ctx.streams.stdout.text()).not.toContain('bun install');
  });

  test('human output when out of date prints both install paths', async () => {
    installFetchMock({ status: 200, body: { version: '99.0.0' } });
    const ctx = baseOpts();
    const code = await main(['upgrade'], ctx.options);
    expect(code).toBe(0);
    const out = ctx.streams.stdout.text();
    expect(out).toContain('A newer version is available');
    expect(out).toContain('bun install -g oh-my-memories@99.0.0');
    expect(out).toContain('github.com');
  });
});
