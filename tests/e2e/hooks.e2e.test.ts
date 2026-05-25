import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../packages/cli/src/index';

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
  projectRoot = mkdtempSync(join(tmpdir(), 'omem-e2e-hooks-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function makeOpts() {
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

describe('e2e: hooks', () => {
  test('install, status, and uninstall round-trip for Cursor hooks', async () => {
    const installCtx = makeOpts();
    const installCode = await main(
      ['hooks', 'install', '--ide=cursor', '--json'],
      installCtx.options,
    );
    expect(installCode).toBe(0);
    const installResult = JSON.parse(installCtx.streams.stdout.text()) as { configPath: string };
    expect(readFileSync(installResult.configPath, 'utf8')).toContain('omem recall --context');

    const statusCtx = makeOpts();
    const statusCode = await main(['hooks', 'status', '--json'], statusCtx.options);
    expect(statusCode).toBe(0);
    const statusResult = JSON.parse(statusCtx.streams.stdout.text()) as {
      hooks: Array<{ ide: string; state: string }>;
    };
    expect(statusResult.hooks).toContainEqual(
      expect.objectContaining({ ide: 'cursor', state: 'installed' }),
    );

    const uninstallCtx = makeOpts();
    const uninstallCode = await main(
      ['hooks', 'uninstall', '--ide=cursor', '--json'],
      uninstallCtx.options,
    );
    expect(uninstallCode).toBe(0);
    expect(existsSync(installResult.configPath)).toBe(false);
  });
});
