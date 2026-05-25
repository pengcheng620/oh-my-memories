import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { claudeCodeHookDefinition } from './claude-code';
import { cursorHookDefinition } from './cursor';
import {
  type HookState,
  MANAGED_HOOK_MARKER,
  SUPPORTED_HOOK_IDES,
  type SupportedHookIde,
} from './types';

export type { HookState, SupportedHookIde };
export { SUPPORTED_HOOK_IDES };

const HOOK_DEFINITIONS = {
  'claude-code': claudeCodeHookDefinition,
  cursor: cursorHookDefinition,
} satisfies Record<SupportedHookIde, typeof claudeCodeHookDefinition>;

export interface HookInstallOptions {
  readonly ide: SupportedHookIde;
  readonly projectRoot: string;
}

export interface HookInstallResult {
  readonly ide: SupportedHookIde;
  readonly configPath: string;
  readonly created: boolean;
  readonly updated: boolean;
  readonly alreadyInstalled: boolean;
}

export interface HookUninstallResult {
  readonly ide: SupportedHookIde;
  readonly configPath: string;
  readonly removed: boolean;
}

export interface HookStatus {
  readonly ide: SupportedHookIde;
  readonly configPath: string;
  readonly state: HookState;
}

export function installHooks(options: HookInstallOptions): HookInstallResult {
  const hook = hookForIde(options.ide);
  const configPath = join(options.projectRoot, hook.relativePath);

  if (!existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, hook.content, { encoding: 'utf8', flag: 'wx' });
    return { ide: hook.ide, configPath, created: true, updated: false, alreadyInstalled: false };
  }

  const existing = readFileSync(configPath, 'utf8');
  if (existing === hook.content) {
    return { ide: hook.ide, configPath, created: false, updated: false, alreadyInstalled: true };
  }
  if (existing.includes(MANAGED_HOOK_MARKER)) {
    writeFileSync(configPath, hook.content, { encoding: 'utf8' });
    return { ide: hook.ide, configPath, created: false, updated: true, alreadyInstalled: false };
  }

  throw new Error(`Hook file already exists and is not managed by omem: ${configPath}`);
}

export function uninstallHooks(options: HookInstallOptions): HookUninstallResult {
  const hook = hookForIde(options.ide);
  const configPath = join(options.projectRoot, hook.relativePath);
  if (!existsSync(configPath)) return { ide: hook.ide, configPath, removed: false };

  const existing = readFileSync(configPath, 'utf8');
  if (!existing.includes(MANAGED_HOOK_MARKER)) return { ide: hook.ide, configPath, removed: false };

  rmSync(configPath);
  return { ide: hook.ide, configPath, removed: true };
}

export function getHooksStatus(options: { readonly projectRoot: string }): HookStatus[] {
  return SUPPORTED_HOOK_IDES.map((ide) => {
    const hook = hookForIde(ide);
    const configPath = join(options.projectRoot, hook.relativePath);
    return { ide, configPath, state: getHookState(configPath, hook.content) };
  });
}

function getHookState(configPath: string, expectedContent: string): HookState {
  if (!existsSync(configPath)) return 'missing';
  const existing = readFileSync(configPath, 'utf8');
  if (existing === expectedContent) return 'installed';
  if (existing.includes(MANAGED_HOOK_MARKER)) return 'stale';
  return 'conflict';
}

function hookForIde(ide: SupportedHookIde) {
  return HOOK_DEFINITIONS[ide];
}
