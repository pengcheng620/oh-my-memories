import { join } from 'node:path';
import { ClaudeCodeAdapter } from '@oh-my-memories/adapter-claude-code';
import { CodexAdapter } from '@oh-my-memories/adapter-codex';
import { CursorAdapter } from '@oh-my-memories/adapter-cursor';
import type { AnyAdapter } from '@oh-my-memories/adapter-sdk';
import { SerenaAdapter } from '@oh-my-memories/adapter-serena';
import type { ResolveHomeOptions } from './platform/home';
import { loadPlugins } from './platform/plugin-loader';

// All M1 adapters. Lane E2 instantiates them here so commands share a single
// registry. Serena requires a projectRoot — we use cwd() as the default per
// spec.md §3.2 ("the project I'm in right now").
//
// `home` lets CLI tests bypass the real `os.homedir()` so they can be
// hermetic. When supplied, each IDE adapter's storageRoot is rebased
// underneath that path (mirroring the layout under a real home).
//
// M4: async variants (`loadAllAdapters`, `loadAdapterById`) include plugin
// adapters discovered from ~/.omem/node_modules/@omem-adapter/*.
// The synchronous variants remain for callers that provably run before
// plugin discovery completes (no such callers remain after M4 wiring).

export interface CreateAdapterOptions {
  readonly cwd?: string;
  /** Override the user home root used to derive each adapter's storage. */
  readonly home?: string;
}

function builtinAdapters(opts?: CreateAdapterOptions): AnyAdapter[] {
  const cwd = opts?.cwd ?? process.cwd();
  return [
    new ClaudeCodeAdapter(claudeCodeOpts(opts?.home)),
    new CursorAdapter(cursorOpts(opts?.home)),
    new CodexAdapter(codexOpts(opts?.home)),
    new SerenaAdapter({ projectRoot: cwd }),
  ];
}

/** @deprecated Prefer `loadAllAdapters` to include plugin adapters. */
export function createAllAdapters(opts?: CreateAdapterOptions): AnyAdapter[] {
  return builtinAdapters(opts);
}

/** @deprecated Prefer `loadAdapterById` to include plugin adapters. */
export function createAdapterById(id: string, opts?: CreateAdapterOptions): AnyAdapter | undefined {
  const cwd = opts?.cwd ?? process.cwd();
  switch (id) {
    case 'claude-code':
      return new ClaudeCodeAdapter(claudeCodeOpts(opts?.home));
    case 'cursor':
      return new CursorAdapter(cursorOpts(opts?.home));
    case 'codex':
      return new CodexAdapter(codexOpts(opts?.home));
    case 'serena':
      return new SerenaAdapter({ projectRoot: cwd });
    default:
      return undefined;
  }
}

export const ALL_ADAPTER_IDS = ['claude-code', 'cursor', 'codex', 'serena'] as const;

export interface LoadAdapterOptions extends CreateAdapterOptions {
  /** Pass to loadPlugins for test isolation (OMEM_HOME override). */
  readonly omemHome?: ResolveHomeOptions;
  /**
   * Called for each plugin warning/error so callers can surface them to the
   * user. If omitted, warnings and errors are silently discarded.
   */
  readonly onPluginDiagnostic?: (
    level: 'warning' | 'error',
    code: string,
    message: string,
  ) => void;
}

/**
 * Returns all built-in adapters + any valid plugin adapters installed at
 * ~/.omem/node_modules/@omem-adapter/*.
 */
export async function loadAllAdapters(opts?: LoadAdapterOptions): Promise<AnyAdapter[]> {
  const builtins = builtinAdapters(opts);
  const pluginResult = await loadPlugins(opts?.omemHome);

  const builtinIds = new Set(builtins.map((a) => a.id));

  for (const w of pluginResult.warnings) {
    opts?.onPluginDiagnostic?.('warning', w.code, w.message);
  }
  for (const e of pluginResult.errors) {
    opts?.onPluginDiagnostic?.('error', e.code, e.message);
  }

  // Filter out plugins whose IDs collide with builtins (builtin always wins).
  const plugins = pluginResult.adapters.filter((a) => {
    if (builtinIds.has(a.id)) {
      opts?.onPluginDiagnostic?.(
        'warning',
        'OMEM-W02-PLUGIN-ID-COLLISION',
        `Plugin adapter ID '${a.id}' collides with a built-in adapter; ignoring the plugin.`,
      );
      return false;
    }
    return true;
  });

  return [...builtins, ...plugins];
}

/**
 * Returns the adapter with the given ID, checking built-ins first then plugins.
 * Returns undefined if no adapter with that ID is found.
 */
export async function loadAdapterById(
  id: string,
  opts?: LoadAdapterOptions,
): Promise<AnyAdapter | undefined> {
  // Check builtins first (fast path — no filesystem I/O needed).
  const builtin = createAdapterById(id, opts);
  if (builtin !== undefined) return builtin;

  // Not a builtin — scan plugins.
  const pluginResult = await loadPlugins(opts?.omemHome);
  for (const w of pluginResult.warnings) {
    opts?.onPluginDiagnostic?.('warning', w.code, w.message);
  }
  for (const e of pluginResult.errors) {
    opts?.onPluginDiagnostic?.('error', e.code, e.message);
  }

  return pluginResult.adapters.find((a) => a.id === id);
}

function claudeCodeOpts(home: string | undefined): { storageRoot?: string } | undefined {
  if (home === undefined) return undefined;
  return { storageRoot: join(home, '.claude', 'projects') };
}

function cursorOpts(home: string | undefined): { storageRoot?: string } | undefined {
  if (home === undefined) return undefined;
  return { storageRoot: join(home, '.cursor', 'projects') };
}

function codexOpts(home: string | undefined): { storageRoot?: string } | undefined {
  if (home === undefined) return undefined;
  return { storageRoot: join(home, '.codex', 'sessions') };
}
