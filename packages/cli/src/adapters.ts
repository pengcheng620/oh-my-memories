import { join } from 'node:path';
import { ClaudeCodeAdapter } from '@oh-my-memories/adapter-claude-code';
import { CodexAdapter } from '@oh-my-memories/adapter-codex';
import { CursorAdapter } from '@oh-my-memories/adapter-cursor';
import type { AnyAdapter } from '@oh-my-memories/adapter-sdk';
import { SerenaAdapter } from '@oh-my-memories/adapter-serena';

// All M1 adapters. Lane E2 instantiates them here so commands share a single
// registry. Serena requires a projectRoot — we use cwd() as the default per
// spec.md §3.2 ("the project I'm in right now").
//
// `home` lets CLI tests bypass the real `os.homedir()` so they can be
// hermetic. When supplied, each IDE adapter's storageRoot is rebased
// underneath that path (mirroring the layout under a real home).

export interface CreateAdapterOptions {
  readonly cwd?: string;
  /** Override the user home root used to derive each adapter's storage. */
  readonly home?: string;
}

export function createAllAdapters(opts?: CreateAdapterOptions): AnyAdapter[] {
  const cwd = opts?.cwd ?? process.cwd();
  return [
    new ClaudeCodeAdapter(claudeCodeOpts(opts?.home)),
    new CursorAdapter(cursorOpts(opts?.home)),
    new CodexAdapter(codexOpts(opts?.home)),
    new SerenaAdapter({ projectRoot: cwd }),
  ];
}

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
