import { describe, expect, it } from 'bun:test';
import { homedir } from 'node:os';
import { resolveDefaultStorageRoot } from '../src/paths';

describe('resolveDefaultStorageRoot()', () => {
  it('points inside the user home directory (cross-platform)', () => {
    const root = resolveDefaultStorageRoot();
    expect(root.startsWith(homedir())).toBe(true);
  });

  it('ends with .claude/projects (the canonical Claude Code root)', () => {
    const root = resolveDefaultStorageRoot();
    const tail = root.replace(/\\/g, '/');
    expect(tail.endsWith('/.claude/projects')).toBe(true);
  });

  it('does not contain a literal tilde (must use os.homedir(), not "~")', () => {
    const root = resolveDefaultStorageRoot();
    expect(root.includes('~')).toBe(false);
  });
});
