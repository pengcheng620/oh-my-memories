import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installForIde, uninstallForIde } from '../src/installer';

// Per-IDE config writer tests. Each test gets its own scratch HOME so
// production config files are never touched.

describe('installForIde — JSON-based IDEs', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'omem-mcp-install-'));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('creates the config file when none exists (claude-code)', () => {
    const result = installForIde({ ide: 'claude-code', home });
    expect(result.created).toBe(true);
    expect(result.updated).toBe(true);
    expect(result.alreadyInstalled).toBe(false);
    const text = readFileSync(result.configPath, 'utf8');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const servers = parsed.mcpServers as Record<string, unknown>;
    expect(servers['oh-my-memories']).toEqual({ command: 'omem', args: ['mcp', 'serve'] });
  });

  it('creates the config file when none exists (cursor)', () => {
    const result = installForIde({ ide: 'cursor', home });
    expect(result.created).toBe(true);
    expect(result.configPath).toBe(resolve(home, '.cursor', 'mcp.json'));
    const parsed = JSON.parse(readFileSync(result.configPath, 'utf8'));
    expect(parsed.mcpServers['oh-my-memories'].command).toBe('omem');
  });

  it('merges into an existing JSON config without trampling other servers', () => {
    const configPath = resolve(home, '.claude.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          mcpServers: { other: { command: 'other-bin', args: [] } },
          unrelated: 'data',
        },
        null,
        2,
      ),
    );
    const result = installForIde({ ide: 'claude-code', home });
    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.mcpServers.other).toEqual({ command: 'other-bin', args: [] });
    expect(parsed.mcpServers['oh-my-memories'].command).toBe('omem');
    expect(parsed.unrelated).toBe('data');
  });

  it('is idempotent — re-running with the same config leaves alreadyInstalled=true', () => {
    installForIde({ ide: 'claude-code', home });
    const second = installForIde({ ide: 'claude-code', home });
    expect(second.alreadyInstalled).toBe(true);
    expect(second.updated).toBe(false);
  });

  it('creates the config file when none exists (gemini)', () => {
    const result = installForIde({ ide: 'gemini', home });
    expect(result.created).toBe(true);
    expect(result.configPath).toBe(resolve(home, '.gemini', 'settings.json'));
    const parsed = JSON.parse(readFileSync(result.configPath, 'utf8'));
    expect(parsed.mcpServers['oh-my-memories']).toEqual({ command: 'omem', args: ['mcp', 'serve'] });
  });

  it('rewrites the stanza when overwrite=true', () => {
    installForIde({ ide: 'claude-code', home, command: { command: 'omem-old', args: [] } });
    const result = installForIde({
      ide: 'claude-code',
      home,
      overwrite: true,
    });
    expect(result.alreadyInstalled).toBe(false);
    expect(result.updated).toBe(true);
    const parsed = JSON.parse(readFileSync(result.configPath, 'utf8'));
    expect(parsed.mcpServers['oh-my-memories'].command).toBe('omem');
  });
});

describe('installForIde — codex (TOML)', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'omem-mcp-install-'));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('creates ~/.codex/config.toml when none exists', () => {
    const result = installForIde({ ide: 'codex', home });
    expect(result.created).toBe(true);
    expect(result.configPath).toBe(resolve(home, '.codex', 'config.toml'));
    const text = readFileSync(result.configPath, 'utf8');
    expect(text).toContain('[mcp_servers.oh-my-memories]');
    expect(text).toContain('command = "omem"');
    expect(text).toContain('args = ["mcp", "serve"]');
  });

  it('appends to an existing config.toml without breaking other stanzas', () => {
    const codexDir = resolve(home, '.codex');
    mkdirSync(codexDir, { recursive: true });
    const configPath = resolve(codexDir, 'config.toml');
    writeFileSync(
      configPath,
      `# header comment\n[mcp_servers.other]\ncommand = "other-bin"\nargs = []\n`,
    );
    const result = installForIde({ ide: 'codex', home });
    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
    const text = readFileSync(configPath, 'utf8');
    expect(text).toContain('[mcp_servers.other]');
    expect(text).toContain('[mcp_servers.oh-my-memories]');
    expect(text).toContain('# header comment');
  });

  it('is idempotent for codex', () => {
    installForIde({ ide: 'codex', home });
    const second = installForIde({ ide: 'codex', home });
    expect(second.alreadyInstalled).toBe(true);
  });
});

describe('uninstallForIde', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'omem-mcp-install-'));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('removes the omem stanza from claude-code without touching siblings', () => {
    installForIde({ ide: 'claude-code', home });
    const configPath = resolve(home, '.claude.json');
    const before = JSON.parse(readFileSync(configPath, 'utf8'));
    before.mcpServers.other = { command: 'x', args: [] };
    writeFileSync(configPath, JSON.stringify(before, null, 2));

    const result = uninstallForIde({ ide: 'claude-code', home });
    expect(result.removed).toBe(true);
    const after = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(after.mcpServers['oh-my-memories']).toBeUndefined();
    expect(after.mcpServers.other).toEqual({ command: 'x', args: [] });
  });

  it('returns removed=false when omem isn’t installed for that IDE', () => {
    const configPath = resolve(home, '.claude.json');
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));
    const result = uninstallForIde({ ide: 'claude-code', home });
    expect(result.removed).toBe(false);
  });

  it('returns removed=false when the config file doesn’t exist', () => {
    const result = uninstallForIde({ ide: 'cursor', home });
    expect(result.removed).toBe(false);
    expect(existsSync(result.configPath)).toBe(false);
  });

  it('removes the omem stanza from codex TOML', () => {
    installForIde({ ide: 'codex', home });
    const result = uninstallForIde({ ide: 'codex', home });
    expect(result.removed).toBe(true);
    const text = readFileSync(result.configPath, 'utf8');
    expect(text).not.toContain('[mcp_servers.oh-my-memories]');
  });
});
