import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';

// Per-IDE MCP install. Each IDE has a slightly different config shape; we keep
// them isolated here so neither the CLI nor the server has to know.
//
// Spec §3.3: target IDEs for M1.1 are Claude Code, Cursor, Codex. Each writes
// to its own config file (~/.claude.json, ~/.cursor/mcp.json, ~/.codex/config.toml)
// and registers a server named `oh-my-memories`.
//
// All writes are idempotent and surgical — we read the existing file, merge our
// stanza, and write back. If the file is missing we create a minimal one.
// Comments in TOML are preserved by treating the file as text and only editing
// the [mcp_servers.oh-my-memories] block.

export const SUPPORTED_IDES = ['claude-code', 'cursor', 'codex'] as const;
export type SupportedIde = (typeof SUPPORTED_IDES)[number];

export interface InstallTarget {
  /** Absolute path to the config file we will modify. */
  readonly configPath: string;
  /** Where in the file the omem stanza lives ("mcpServers.oh-my-memories" etc). */
  readonly stanzaPath: string;
}

export interface InstallOptions {
  readonly ide: SupportedIde;
  /** Override $HOME. Tests pass a tmp dir here. */
  readonly home?: string;
  /** Override the command we tell the IDE to spawn. Defaults to `omem mcp serve`. */
  readonly command?: { command: string; args: string[] };
  /** Force-overwrite an existing stanza. Default false (idempotent merge). */
  readonly overwrite?: boolean;
}

export interface InstallResult {
  readonly ide: SupportedIde;
  readonly configPath: string;
  readonly created: boolean;
  readonly updated: boolean;
  readonly alreadyInstalled: boolean;
  readonly stanza: Record<string, unknown>;
}

export interface UninstallResult {
  readonly ide: SupportedIde;
  readonly configPath: string;
  readonly removed: boolean;
}

const SERVER_KEY = 'oh-my-memories';

export function detectIde(env: NodeJS.ProcessEnv = process.env): SupportedIde | null {
  if (env.CURSOR_TRACE_ID !== undefined || env.CURSOR_USER !== undefined) return 'cursor';
  if (env.CLAUDE_CODE_VERSION !== undefined || env.ANTHROPIC_HOSTED === '1') return 'claude-code';
  if (env.CODEX_HOME !== undefined) return 'codex';
  return null;
}

export function expandHome(p: string, home: string = homedir()): string {
  if (p === '~') return home;
  if (p.startsWith('~/') || p.startsWith('~\\')) return resolve(home, p.slice(2));
  return p;
}

/**
 * Default command the IDE should use to launch the MCP server. Resolves to
 * the `omem` binary on PATH; users can override this via `command` if they
 * vendored a custom build.
 */
export function serverEntryFor(): { command: string; args: string[] } {
  return { command: 'omem', args: ['mcp', 'serve'] };
}

export function installForIde(opts: InstallOptions): InstallResult {
  const home = opts.home ?? homedir();
  const target = targetFor(opts.ide, home);
  const command = opts.command ?? serverEntryFor();

  switch (opts.ide) {
    case 'claude-code':
    case 'cursor':
      return installJsonServer(opts.ide, target, command, opts.overwrite ?? false, 'mcpServers');
    case 'codex':
      return installCodexToml(target, command, opts.overwrite ?? false);
  }
}

export function uninstallForIde(opts: { ide: SupportedIde; home?: string }): UninstallResult {
  const home = opts.home ?? homedir();
  const target = targetFor(opts.ide, home);
  if (!existsSync(target.configPath)) {
    return { ide: opts.ide, configPath: target.configPath, removed: false };
  }

  switch (opts.ide) {
    case 'claude-code':
    case 'cursor':
      return uninstallJsonServer(opts.ide, target, 'mcpServers');
    case 'codex':
      return uninstallCodexToml(opts.ide, target);
  }
}

function targetFor(ide: SupportedIde, home: string): InstallTarget {
  switch (ide) {
    // Claude Code reads `~/.claude.json` for global MCP servers (newer CLIs)
    // and `~/Library/Application Support/Claude/claude_desktop_config.json`
    // for Claude Desktop. The CLI form is more portable across platforms;
    // users who only have Desktop can `omem mcp install --ide=claude-code`
    // and then point Desktop at the same stanza by symlink or copy.
    case 'claude-code':
      return {
        configPath: resolve(home, '.claude.json'),
        stanzaPath: `mcpServers.${SERVER_KEY}`,
      };
    case 'cursor':
      return {
        configPath: resolve(home, '.cursor', 'mcp.json'),
        stanzaPath: `mcpServers.${SERVER_KEY}`,
      };
    case 'codex':
      return {
        configPath: resolve(home, '.codex', 'config.toml'),
        stanzaPath: `mcp_servers.${SERVER_KEY}`,
      };
  }
}

function installJsonServer(
  ide: SupportedIde,
  target: InstallTarget,
  command: { command: string; args: string[] },
  overwrite: boolean,
  containerKey: 'mcpServers',
): InstallResult {
  let raw: Record<string, unknown> = {};
  let created = false;
  if (existsSync(target.configPath)) {
    try {
      const text = readFileSync(target.configPath, 'utf8');
      raw = text.trim() === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
    } catch (err) {
      throw new Error(
        `Failed to parse ${target.configPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    created = true;
    ensureDir(dirname(target.configPath));
  }

  const container = (raw[containerKey] ?? {}) as Record<string, Record<string, unknown>>;
  const existing = container[SERVER_KEY] as Record<string, unknown> | undefined;
  const desired: Record<string, unknown> = {
    command: command.command,
    args: command.args,
  };

  let updated = false;
  let alreadyInstalled = false;

  if (existing === undefined) {
    container[SERVER_KEY] = desired;
    updated = true;
  } else if (overwrite || !shallowEqualCommand(existing, desired)) {
    container[SERVER_KEY] = desired;
    updated = true;
  } else {
    alreadyInstalled = true;
  }

  raw[containerKey] = container;

  if (updated || created) {
    writeFileSync(target.configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  }

  return {
    ide,
    configPath: target.configPath,
    created,
    updated,
    alreadyInstalled,
    stanza: desired,
  };
}

function uninstallJsonServer(
  ide: SupportedIde,
  target: InstallTarget,
  containerKey: 'mcpServers',
): UninstallResult {
  const text = readFileSync(target.configPath, 'utf8');
  if (text.trim() === '') return { ide, configPath: target.configPath, removed: false };
  const raw = JSON.parse(text) as Record<string, unknown>;
  const container = raw[containerKey] as Record<string, unknown> | undefined;
  if (container === undefined || container[SERVER_KEY] === undefined) {
    return { ide, configPath: target.configPath, removed: false };
  }
  delete container[SERVER_KEY];
  raw[containerKey] = container;
  writeFileSync(target.configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  return { ide, configPath: target.configPath, removed: true };
}

function installCodexToml(
  target: InstallTarget,
  command: { command: string; args: string[] },
  overwrite: boolean,
): InstallResult {
  let body = '';
  let created = false;
  if (existsSync(target.configPath)) {
    body = readFileSync(target.configPath, 'utf8');
  } else {
    created = true;
    ensureDir(dirname(target.configPath));
  }

  const desiredStanza =
    `\n[mcp_servers.${SERVER_KEY}]\n` +
    `command = ${tomlString(command.command)}\n` +
    `args = ${tomlStringArray(command.args)}\n`;

  // Match the entire `[mcp_servers.oh-my-memories]` block: the header line
  // plus all subsequent lines until the next section header (line starting
  // with `[`) or end-of-file. We can't use `[^\[]*` because TOML array
  // values contain `[` characters (e.g. `args = ["mcp", "serve"]`).
  const headerRe = new RegExp(
    `(^|\\n)\\[mcp_servers\\.${escapeRegex(SERVER_KEY)}\\][^\\n]*\\n(?:[^\\n]*(?:\\n|$))*?(?=\\n\\[|$)`,
  );
  const existing = body.match(headerRe);

  let updated = false;
  let alreadyInstalled = false;
  let next = body;

  if (!existing) {
    next =
      body.endsWith('\n') || body === '' ? `${body}${desiredStanza}` : `${body}\n${desiredStanza}`;
    updated = true;
  } else {
    const currentBlock = existing[0];
    if (
      !overwrite &&
      currentBlock.includes(`command = ${tomlString(command.command)}`) &&
      currentBlock.includes(`args = ${tomlStringArray(command.args)}`)
    ) {
      alreadyInstalled = true;
    } else {
      next = body.replace(headerRe, desiredStanza);
      updated = true;
    }
  }

  if (updated || created) {
    writeFileSync(target.configPath, next, 'utf8');
  }

  return {
    ide: 'codex',
    configPath: target.configPath,
    created,
    updated,
    alreadyInstalled,
    stanza: { command: command.command, args: command.args },
  };
}

function uninstallCodexToml(ide: SupportedIde, target: InstallTarget): UninstallResult {
  const body = readFileSync(target.configPath, 'utf8');
  const headerRe = new RegExp(
    `(^|\\n)\\[mcp_servers\\.${escapeRegex(SERVER_KEY)}\\][^\\n]*\\n(?:[^\\n]*(?:\\n|$))*?(?=\\n\\[|$)`,
  );
  if (!headerRe.test(body)) return { ide, configPath: target.configPath, removed: false };
  const next = body.replace(headerRe, '\n').replace(/\n{3,}/g, '\n\n');
  writeFileSync(target.configPath, next, 'utf8');
  return { ide, configPath: target.configPath, removed: true };
}

function ensureDir(d: string): void {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function shallowEqualCommand(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a.command !== b.command) return false;
  const aa = a.args;
  const bb = b.args;
  if (!Array.isArray(aa) || !Array.isArray(bb)) return false;
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

function tomlString(s: string): string {
  return JSON.stringify(s);
}

function tomlStringArray(arr: readonly string[]): string {
  return `[${arr.map((s) => JSON.stringify(s)).join(', ')}]`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Re-exported for tests.
export function _internal_targetFor(ide: SupportedIde, home: string): InstallTarget {
  return targetFor(ide, home);
}

export function _internal_isAbsolute(p: string): boolean {
  return isAbsolute(p);
}
