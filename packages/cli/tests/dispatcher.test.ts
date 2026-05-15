import { describe, expect, test } from 'bun:test';
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

function streams() {
  return { stdout: new MemoryStream(), stderr: new MemoryStream() };
}

const opts = (extra: { env?: NodeJS.ProcessEnv; stdinIsTty?: boolean } = {}) => {
  const s = streams();
  return {
    streams: s,
    options: {
      stdout: s.stdout,
      stderr: s.stderr,
      env: extra.env ?? { NO_COLOR: '1' }, // strip ANSI in tests by default
      stdinIsTty: extra.stdinIsTty ?? false, // default to non-interactive in tests
    },
  };
};

describe('dispatcher — discovery', () => {
  test('bare `omem` prints global help and exits 0', async () => {
    const { streams, options } = opts();
    const code = await main([], options);
    expect(code).toBe(0);
    expect(streams.stdout.text()).toContain('omem - manage AI memories');
    expect(streams.stderr.text()).toBe('');
  });

  test('`omem --help` prints global help', async () => {
    const { streams, options } = opts();
    const code = await main(['--help'], options);
    expect(code).toBe(0);
    expect(streams.stdout.text()).toContain('GLOBAL OPTIONS');
  });

  test('`omem -v` and `omem --version` print version', async () => {
    const { streams: s1, options: o1 } = opts();
    expect(await main(['-v'], o1)).toBe(0);
    expect(s1.stdout.text()).toBe('0.0.0\n');
    const { streams: s2, options: o2 } = opts();
    expect(await main(['--version'], o2)).toBe(0);
    expect(s2.stdout.text()).toBe('0.0.0\n');
  });

  test('`omem --version --json` emits structured output', async () => {
    const { streams, options } = opts();
    const code = await main(['--version', '--json'], options);
    expect(code).toBe(0);
    expect(JSON.parse(streams.stdout.text())).toEqual({ version: '0.0.0' });
  });
});

describe('dispatcher — subcommand-specific help (F3.3)', () => {
  for (const cmd of ['init', 'scan', 'recall', 'doctor', 'config', 'skills']) {
    test(`'omem ${cmd} --help' prints '${cmd}'-specific help`, async () => {
      const { streams, options } = opts();
      const code = await main([cmd, '--help'], options);
      expect(code).toBe(0);
      expect(streams.stdout.text()).toContain(`omem ${cmd}`);
    });
  }
});

describe('dispatcher — unknown commands', () => {
  test('emits OMEM-E02 + exit 2 for unknown command', async () => {
    const { streams, options } = opts();
    const code = await main(['nope'], options);
    expect(code).toBe(2);
    expect(streams.stderr.text()).toContain('OMEM-E02-UNKNOWN-COMMAND');
    expect(streams.stderr.text()).toContain("'nope'");
  });

  test('mentions M2+ for migrate / export / import / remember', async () => {
    for (const cmd of ['migrate', 'export', 'import', 'remember']) {
      const { streams, options } = opts();
      await main([cmd], options);
      expect(streams.stderr.text()).toContain('M2+');
    }
  });

  test('mentions M1.1+ for mcp / upgrade', async () => {
    for (const cmd of ['mcp', 'upgrade']) {
      const { streams, options } = opts();
      await main([cmd], options);
      expect(streams.stderr.text()).toContain('M1.1+');
    }
  });

  test('--json mode emits NDJSON error on stderr', async () => {
    const { streams, options } = opts();
    await main(['nope', '--json'], options);
    const parsed = JSON.parse(streams.stderr.text().trim());
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe('OMEM-E02-UNKNOWN-COMMAND');
  });
});

describe('dispatcher — recall arg parsing (D2 / F2.2)', () => {
  test('--source=cursor with --all warns OMEM-W01-FLAG and continues', async () => {
    const { streams, options } = opts();
    await main(['recall', 'foo', '--all', '--source=cursor', '--json'], options);
    const lines = streams.stderr
      .text()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));
    const warning = lines.find((l: { warning?: boolean; code?: string }) => l.warning === true);
    expect(warning?.code).toBe('OMEM-W01-FLAG');
  });

  test('--source NAME (space form) is accepted (F2.2)', async () => {
    const { streams, options } = opts();
    const code = await main(['recall', 'foo', '--source', 'cursor', '--json'], options);
    // Stub returns 1; what we care about is we DIDN'T get OMEM-E01.
    expect(code).toBe(1);
    const errLines = streams.stderr
      .text()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));
    const usageError = errLines.find((l: { code?: string }) => l.code === 'OMEM-E01-USAGE');
    expect(usageError).toBeUndefined();
  });

  test('missing query → OMEM-E01-USAGE + exit 2', async () => {
    const { streams, options } = opts();
    const code = await main(['recall'], options);
    expect(code).toBe(2);
    expect(streams.stderr.text()).toContain('OMEM-E01-USAGE');
    expect(streams.stderr.text()).toContain('<query>');
  });

  test('invalid --since → OMEM-E20-DURATION + exit 2', async () => {
    const { streams, options } = opts();
    const code = await main(['recall', 'foo', '--since', 'tomorrow'], options);
    expect(code).toBe(2);
    expect(streams.stderr.text()).toContain('OMEM-E20-DURATION');
  });

  test('--limit=abc → OMEM-E01-USAGE + exit 2', async () => {
    const { streams, options } = opts();
    const code = await main(['recall', 'foo', '--limit=abc'], options);
    expect(code).toBe(2);
    expect(streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });
});

describe('dispatcher — config arg parsing', () => {
  test("'omem config' with no subcommand → OMEM-E01-USAGE + exit 2", async () => {
    const { streams, options } = opts();
    const code = await main(['config'], options);
    expect(code).toBe(2);
    expect(streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });

  test("'omem config get' without key → OMEM-E01-USAGE", async () => {
    const { streams, options } = opts();
    const code = await main(['config', 'get'], options);
    expect(code).toBe(2);
    expect(streams.stderr.text()).toContain('OMEM-E01-USAGE');
  });
});

describe('dispatcher — skills install', () => {
  test('rejects unknown ide', async () => {
    const { streams, options } = opts();
    const code = await main(['skills', 'install', '--ide=zed'], options);
    expect(code).toBe(2);
    expect(streams.stderr.text()).toContain("Unsupported IDE 'zed'");
  });

  test('accepts both --ide=NAME and --ide NAME (F2.2)', async () => {
    for (const argv of [
      ['skills', 'install', '--ide=cursor'],
      ['skills', 'install', '--ide', 'cursor'],
    ]) {
      const { streams, options } = opts();
      const code = await main(argv, options);
      // Stub exits with 1, not a usage error; we just check we passed parsing.
      expect(code).toBe(1);
      expect(streams.stderr.text()).not.toContain('OMEM-E01-USAGE');
    }
  });
});

describe('dispatcher — init', () => {
  test('non-interactive (default in tests) returns 1 with stub error', async () => {
    const { streams, options } = opts();
    const code = await main(['init'], options);
    expect(code).toBe(1);
    expect(streams.stderr.text()).toContain('OMEM-E21-NON-INTERACTIVE');
  });

  test('--json emits structured error + result', async () => {
    const { streams, options } = opts();
    await main(['init', '--json'], options);
    const errLines = streams.stderr
      .text()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));
    expect(errLines[0]?.code).toBe('OMEM-E21-NON-INTERACTIVE');
    expect(JSON.parse(streams.stdout.text())).toEqual({ ok: false, command: 'init' });
  });
});
