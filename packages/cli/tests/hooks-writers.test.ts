import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getHooksStatus, installHooks, uninstallHooks } from '../src/hooks';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'omem-hooks-project-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('hook file writers', () => {
  test('install creates the Cursor auto-recall rule', () => {
    const result = installHooks({ ide: 'cursor', projectRoot });

    expect(result.created).toBe(true);
    expect(result.alreadyInstalled).toBe(false);
    expect(result.configPath.endsWith(join('.cursor', 'rules', 'omem-recall.mdc'))).toBe(true);
    const content = readFileSync(result.configPath, 'utf8');
    expect(content).toContain('<!-- omem-hooks:managed v1 -->');
    expect(content).toContain('omem recall --context');
  });

  test('install is idempotent for already-managed Cursor rule', () => {
    installHooks({ ide: 'cursor', projectRoot });
    const result = installHooks({ ide: 'cursor', projectRoot });

    expect(result.created).toBe(false);
    expect(result.updated).toBe(false);
    expect(result.alreadyInstalled).toBe(true);
  });

  test('install refuses to overwrite an unmanaged Cursor rule', () => {
    const unmanagedPath = join(projectRoot, '.cursor', 'rules', 'omem-recall.mdc');
    mkdirSync(join(projectRoot, '.cursor', 'rules'), { recursive: true });
    writeFileSync(unmanagedPath, 'user-owned rule', { encoding: 'utf8', flag: 'wx' });

    expect(() => installHooks({ ide: 'cursor', projectRoot })).toThrow('already exists');
  });

  test('uninstall removes only managed hook files', () => {
    const installed = installHooks({ ide: 'claude-code', projectRoot });
    const removed = uninstallHooks({ ide: 'claude-code', projectRoot });

    expect(removed.removed).toBe(true);
    expect(existsSync(installed.configPath)).toBe(false);
  });

  test('status reports missing, installed, and conflict states', () => {
    installHooks({ ide: 'cursor', projectRoot });
    mkdirSync(join(projectRoot, '.claude', 'hooks'), { recursive: true });
    writeFileSync(join(projectRoot, '.claude', 'hooks', 'session-start.md'), 'user hook', {
      encoding: 'utf8',
      flag: 'wx',
    });

    const status = getHooksStatus({ projectRoot });
    expect(status.find((s) => s.ide === 'cursor')?.state).toBe('installed');
    expect(status.find((s) => s.ide === 'claude-code')?.state).toBe('conflict');
  });
});
