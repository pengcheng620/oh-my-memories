import { describe, expect, it } from 'bun:test';
import { homedir } from 'node:os';
import { resolveDefaultStorageRoot } from '../src/paths';

describe('resolveDefaultStorageRoot()', () => {
  it('points inside the user home directory (cross-platform)', () => {
    const root = resolveDefaultStorageRoot();
    expect(root.startsWith(homedir())).toBe(true);
  });

  it('ends with .codex/sessions (Codex CLI stores rollouts under sessions/<YYYY>/<MM>/<DD>)', () => {
    const root = resolveDefaultStorageRoot();
    const tail = root.replace(homedir(), '');
    const normalized = tail.replace(/\\/g, '/');
    expect(normalized.endsWith('/.codex/sessions')).toBe(true);
  });

  it('does not contain a literal tilde (must use os.homedir(), not "~")', () => {
    const root = resolveDefaultStorageRoot();
    expect(root.includes('~')).toBe(false);
  });
});
