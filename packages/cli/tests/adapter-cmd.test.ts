import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/index';

// CLI-level tests for `omem adapter` subcommands.
// Tests focus on the list command (no network needed) and the argument
// validation paths for install / uninstall.

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
  omemHome = mkdtempSync(join(tmpdir(), 'omem-adapter-cmd-'));
});

afterEach(() => {
  try {
    rmSync(omemHome, { recursive: true, force: true });
  } catch {
    /* Windows handle release lag; non-fatal. */
  }
});

function opts(extraEnv: Record<string, string> = {}) {
  const stdout = new MemoryStream();
  const stderr = new MemoryStream();
  return {
    stdout,
    stderr,
    streams: { stdout, stderr },
    options: {
      stdout,
      stderr,
      env: { OMEM_HOME: omemHome, ...extraEnv },
    },
  };
}

describe('omem adapter list', () => {
  test('lists built-in adapters in text mode', async () => {
    const { streams, options } = opts();
    const code = await main(['adapter', 'list'], options);
    expect(code).toBe(0);
    const out = streams.stdout.text();
    expect(out).toMatch(/claude-code/);
    expect(out).toMatch(/cursor/);
    expect(out).toMatch(/codex/);
    expect(out).toMatch(/serena/);
  });

  test('lists built-in adapters in JSON mode', async () => {
    const { streams, options } = opts();
    const code = await main(['adapter', 'list', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(streams.stdout.text()) as {
      adapters: Array<{ id: string; builtin: boolean }>;
    };
    expect(result.adapters.length).toBeGreaterThanOrEqual(4);
    const builtinIds = result.adapters.filter((a) => a.builtin).map((a) => a.id);
    expect(builtinIds).toContain('claude-code');
    expect(builtinIds).toContain('cursor');
    expect(builtinIds).toContain('codex');
    expect(builtinIds).toContain('serena');
  });

  test('marks built-ins as builtin=true', async () => {
    const { streams, options } = opts();
    await main(['adapter', 'list', '--json'], options);
    const result = JSON.parse(streams.stdout.text()) as {
      adapters: Array<{ id: string; builtin: boolean }>;
    };
    for (const a of result.adapters) {
      if (['claude-code', 'cursor', 'codex', 'serena'].includes(a.id)) {
        expect(a.builtin).toBe(true);
      }
    }
  });

  test('bare `omem adapter` defaults to list', async () => {
    const { streams, options } = opts();
    const code = await main(['adapter'], options);
    expect(code).toBe(0);
    expect(streams.stdout.text()).toMatch(/claude-code/);
  });
});

describe('omem adapter install — argument validation', () => {
  test('missing package spec returns exit 2 with OMEM-E01', async () => {
    const { streams, options } = opts();
    const code = await main(['adapter', 'install'], options);
    expect(code).toBe(2);
    expect(streams.stderr.text()).toMatch(/OMEM-E01-USAGE/);
  });

  test('flag passed as package spec returns exit 2', async () => {
    const { options } = opts();
    const code = await main(['adapter', 'install', '--json'], options);
    expect(code).toBe(2);
  });
});

describe('omem adapter uninstall — argument validation', () => {
  test('missing adapter id returns exit 2 with OMEM-E01', async () => {
    const { streams, options } = opts();
    const code = await main(['adapter', 'uninstall'], options);
    expect(code).toBe(2);
    expect(streams.stderr.text()).toMatch(/OMEM-E01-USAGE/);
  });

  test('non-existent plugin returns exit 1 with OMEM-E43', async () => {
    const { streams, options } = opts();
    const code = await main(['adapter', 'uninstall', 'does-not-exist'], options);
    expect(code).toBe(1);
    expect(streams.stderr.text()).toMatch(/OMEM-E43-PLUGIN-NOT-FOUND/);
  });

  test('unknown subcommand returns exit 2', async () => {
    const { streams, options } = opts();
    const code = await main(['adapter', 'frobnicate'], options);
    expect(code).toBe(2);
    expect(streams.stderr.text()).toMatch(/OMEM-E01-USAGE/);
  });
});
