export const MANAGED_HOOK_MARKER = '<!-- omem-hooks:managed v1 -->';

export const SUPPORTED_HOOK_IDES = ['claude-code', 'cursor'] as const;
export type SupportedHookIde = (typeof SUPPORTED_HOOK_IDES)[number];

export interface HookDefinition {
  readonly ide: SupportedHookIde;
  readonly relativePath: string;
  readonly content: string;
}

export type HookState = 'missing' | 'installed' | 'stale' | 'conflict';
