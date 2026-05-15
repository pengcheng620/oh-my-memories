import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

function streams() {
  return { stdout: new MemoryStream(), stderr: new MemoryStream() };
}

// Each test gets its own temp OMEM_HOME so config.json writes don't collide.
let tempDirs: string[] = [];
function freshHome(): string {
  const dir = resolve(
    tmpdir(),
    `omem-e2e-init-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  tempDirs = [];
});

describe('e2e: init', () => {
  test('non-interactive init creates config.json with detected sources', async () => {
    const home = freshHome();
    const s = streams();
    const code = await main(['init'], {
      stdout: s.stdout,
      stderr: s.stderr,
      env: { NO_COLOR: '1', OMEM_HOME: home },
      stdinIsTty: false,
    });

    // Might exit 0 (sources detected) or 1 (no sources on this machine).
    if (code === 0) {
      const cfgPath = join(home, 'config.json');
      expect(existsSync(cfgPath)).toBe(true);
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
      expect(Array.isArray(cfg.sources)).toBe(true);
      expect(cfg.sources.length).toBeGreaterThan(0);
    }
    // Either way, no crash.
    expect(code === 0 || code === 1).toBe(true);
  });

  test('--json emits structured success when sources detected', async () => {
    const home = freshHome();
    const s = streams();
    const code = await main(['init', '--json'], {
      stdout: s.stdout,
      stderr: s.stderr,
      env: { NO_COLOR: '1', OMEM_HOME: home },
      stdinIsTty: false,
    });

    if (code === 0) {
      const result = JSON.parse(s.stdout.text());
      expect(result.ok).toBe(true);
      expect(result.command).toBe('init');
      expect(result.omemHome).toBe(home);
      expect(Array.isArray(result.sources)).toBe(true);
    }
  });

  test('OMEM_HOME override is honoured', async () => {
    const home = freshHome();
    const s = streams();
    await main(['init'], {
      stdout: s.stdout,
      stderr: s.stderr,
      env: { NO_COLOR: '1', OMEM_HOME: home },
      stdinIsTty: false,
    });
    // Config should be under the custom home, not ~/.omem.
    const cfgPath = join(home, 'config.json');
    // May or may not exist depending on whether adapters were detected.
    if (existsSync(cfgPath)) {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
      expect(typeof cfg).toBe('object');
    }
  });
});
