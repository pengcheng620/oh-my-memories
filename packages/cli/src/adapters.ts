import { ClaudeCodeAdapter } from '@oh-my-memories/adapter-claude-code';
import { CodexAdapter } from '@oh-my-memories/adapter-codex';
import { CursorAdapter } from '@oh-my-memories/adapter-cursor';
import type { AnyAdapter } from '@oh-my-memories/adapter-sdk';
import { SerenaAdapter } from '@oh-my-memories/adapter-serena';

// All M1 adapters. Lane E2 instantiates them here so commands share a single
// registry. Serena requires a projectRoot — we use cwd() as the default per
// spec.md §3.2 ("the project I'm in right now").

export function createAllAdapters(opts?: { cwd?: string }): AnyAdapter[] {
  const cwd = opts?.cwd ?? process.cwd();
  return [
    new ClaudeCodeAdapter(),
    new CursorAdapter(),
    new CodexAdapter(),
    new SerenaAdapter({ projectRoot: cwd }),
  ];
}

export function createAdapterById(id: string, opts?: { cwd?: string }): AnyAdapter | undefined {
  const cwd = opts?.cwd ?? process.cwd();
  switch (id) {
    case 'claude-code':
      return new ClaudeCodeAdapter();
    case 'cursor':
      return new CursorAdapter();
    case 'codex':
      return new CodexAdapter();
    case 'serena':
      return new SerenaAdapter({ projectRoot: cwd });
    default:
      return undefined;
  }
}

export const ALL_ADAPTER_IDS = ['claude-code', 'cursor', 'codex', 'serena'] as const;
