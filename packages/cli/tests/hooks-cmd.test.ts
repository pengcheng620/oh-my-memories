import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'omem-hooks-cli-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function opts() {
  const stdout = new MemoryStream();
  const stderr = new MemoryStream();
  return {
    streams: { stdout, stderr },
    options: {
      stdout,
      stderr,
      env: {
        NO_COLOR: '1',
        OMEM_PROJECT_ROOT: projectRoot,
      } as NodeJS.ProcessEnv,
      stdinIsTty: false,
    },
  };
}

describe('omem hooks command', () => {
  test('install --ide=cursor writes the Cursor rule', async () => {
    const ctx = opts();
    const code = await main(['hooks', 'install', '--ide=cursor', '--json'], ctx.options);

    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text()) as Record<string, unknown>;
    expect(result.command).toBe('hooks install');
    expect(result.ide).toBe('cursor');
    const configPath = result.configPath as string;
    expect(configPath.endsWith(join('.cursor', 'rules', 'omem-recall.mdc'))).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain('omem recall --context');
  });

  test('status reports all supported IDE hook states', async () => {
    await main(['hooks', 'install', '--ide=claude-code', '--json'], opts().options);

    const ctx = opts();
    const code = await main(['hooks', 'status', '--json'], ctx.options);

    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text()) as {
      hooks: Array<{ ide: string; state: string }>;
    };
    expect(result.hooks).toContainEqual(
      expect.objectContaining({ ide: 'claude-code', state: 'installed' }),
    );
    expect(result.hooks).toContainEqual(
      expect.objectContaining({ ide: 'cursor', state: 'missing' }),
    );
  });

  test('uninstall removes the installed hook file', async () => {
    const installCtx = opts();
    await main(['hooks', 'install', '--ide=cursor', '--json'], installCtx.options);
    const configPath = (JSON.parse(installCtx.streams.stdout.text()) as { configPath: string })
      .configPath;

    const uninstallCtx = opts();
    const code = await main(['hooks', 'uninstall', '--ide=cursor', '--json'], uninstallCtx.options);

    expect(code).toBe(0);
    expect(existsSync(configPath)).toBe(false);
  });

  test('install rejects unsupported IDEs', async () => {
    const ctx = opts();
    const code = await main(['hooks', 'install', '--ide=neovim'], ctx.options);

    expect(code).toBe(2);
    expect(ctx.streams.stderr.text()).toContain('Unsupported IDE');
  });
});
