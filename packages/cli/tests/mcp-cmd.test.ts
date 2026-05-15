import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

function streams() {
  return { stdout: new MemoryStream(), stderr: new MemoryStream() };
}

// `omem mcp install/uninstall` redirects HOME via the OMEM_TEST_HOME env var
// in tests to keep the user's real config untouched. The installer reads
// `homedir()` directly, so we replace HOME in the env passed to dispatcher.
function withHome(home: string) {
  const env: NodeJS.ProcessEnv = {
    NO_COLOR: '1',
    HOME: home,
    USERPROFILE: home,
  };
  const s = streams();
  return {
    s,
    options: {
      stdout: s.stdout,
      stderr: s.stderr,
      env,
      stdinIsTty: false,
    },
  };
}

describe('omem mcp install/uninstall', () => {
  test('install --ide=cursor writes ~/.cursor/mcp.json', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omem-cli-mcp-'));
    try {
      const { s, options } = withHome(home);
      const code = await main(['mcp', 'install', '--ide=cursor', '--json'], options);
      expect(code).toBe(0);
      const parsed = JSON.parse(s.stdout.text().trim()) as Record<string, unknown>;
      expect(parsed.command).toBe('mcp install');
      expect(parsed.ide).toBe('cursor');
      expect(parsed.created).toBe(true);
      const configPath = parsed.configPath as string;
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
        mcpServers: Record<string, { command: string; args: string[] }>;
      };
      expect(config.mcpServers['oh-my-memories']?.command).toBe('omem');
      expect(config.mcpServers['oh-my-memories']?.args).toEqual(['mcp', 'serve']);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('install rejects unsupported --ide value', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omem-cli-mcp-'));
    try {
      const { s, options } = withHome(home);
      const code = await main(['mcp', 'install', '--ide=neovim'], options);
      expect(code).toBe(2);
      expect(s.stderr.text()).toContain('OMEM-E01-USAGE');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('install requires --ide', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omem-cli-mcp-'));
    try {
      const { s, options } = withHome(home);
      const code = await main(['mcp', 'install'], options);
      expect(code).toBe(2);
      expect(s.stderr.text()).toContain("'--ide'");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('install is idempotent', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omem-cli-mcp-'));
    try {
      const first = withHome(home);
      const code1 = await main(['mcp', 'install', '--ide=cursor', '--json'], first.options);
      expect(code1).toBe(0);

      const second = withHome(home);
      const code2 = await main(['mcp', 'install', '--ide=cursor', '--json'], second.options);
      expect(code2).toBe(0);
      const parsed = JSON.parse(second.s.stdout.text().trim()) as Record<string, unknown>;
      expect(parsed.alreadyInstalled).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('uninstall reports removed=false when nothing is installed', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omem-cli-mcp-'));
    try {
      const { s, options } = withHome(home);
      const code = await main(['mcp', 'uninstall', '--ide=cursor', '--json'], options);
      expect(code).toBe(0);
      const parsed = JSON.parse(s.stdout.text().trim()) as Record<string, unknown>;
      expect(parsed.removed).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('install then uninstall round-trips cleanly', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omem-cli-mcp-'));
    try {
      const a = withHome(home);
      await main(['mcp', 'install', '--ide=codex', '--json'], a.options);
      const b = withHome(home);
      const code = await main(['mcp', 'uninstall', '--ide=codex', '--json'], b.options);
      expect(code).toBe(0);
      const parsed = JSON.parse(b.s.stdout.text().trim()) as Record<string, unknown>;
      expect(parsed.removed).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('omem mcp --help shows mcp-specific help', async () => {
    const { s, options } = withHome(mkdtempSync(join(tmpdir(), 'omem-cli-mcp-')));
    try {
      const code = await main(['mcp', '--help'], options);
      expect(code).toBe(0);
      expect(s.stdout.text()).toContain('omem mcp serve');
      expect(s.stdout.text()).toContain('omem mcp install --ide');
    } finally {
      // home cleanup not strictly needed (no FS writes here) but harmless.
    }
  });
});
