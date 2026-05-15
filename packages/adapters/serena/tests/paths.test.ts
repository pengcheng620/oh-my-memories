import { describe, expect, it } from 'bun:test';
import { sep } from 'node:path';
import { resolveStorageRoot } from '../src/paths';

describe('resolveStorageRoot(projectRoot)', () => {
  it('joins projectRoot with .serena/memories using OS separator', () => {
    const root = resolveStorageRoot('/home/lup/code/myproj');
    const normalized = root.replace(/\\/g, '/');
    expect(normalized.endsWith('/myproj/.serena/memories')).toBe(true);
  });

  it('does not treat ~ specially — projectRoot must be absolute already', () => {
    // Serena memories are per-project; tilde expansion is the caller's job.
    // The adapter must not silently expand it (would mask bugs in callers).
    const root = resolveStorageRoot('~/myproj');
    expect(root.startsWith('~')).toBe(true);
    expect(root.includes('.serena')).toBe(true);
  });

  it('uses the OS-native separator (backslash on Windows, forward elsewhere)', () => {
    // sep is '\\' on Windows, '/' on POSIX. We only assert that the resolved
    // root contains the OS sep — never hard-code one.
    const root = resolveStorageRoot('/some/proj');
    expect(root.includes(sep)).toBe(true);
  });
});
