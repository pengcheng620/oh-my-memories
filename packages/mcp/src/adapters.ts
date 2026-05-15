import { ClaudeCodeAdapter } from '@oh-my-memories/adapter-claude-code';
import { CodexAdapter } from '@oh-my-memories/adapter-codex';
import { CursorAdapter } from '@oh-my-memories/adapter-cursor';
import type { AnyAdapter } from '@oh-my-memories/adapter-sdk';
import { SerenaAdapter } from '@oh-my-memories/adapter-serena';

// Mirror of `packages/cli/src/adapters.ts` so the MCP server is self-contained
// and can be embedded without pulling the CLI bundle. Spec §3.2: Serena gets
// `projectRoot` from cwd. The MCP server's cwd is the IDE's project root by
// default (the IDE launches us from that directory), so this matches the CLI
// behavior.

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
