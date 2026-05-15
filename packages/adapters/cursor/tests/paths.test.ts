import { describe, expect, it } from 'bun:test';
import { homedir } from 'node:os';
import { resolveDefaultStorageRoot } from '../src/paths';

describe('resolveDefaultStorageRoot()', () => {
  it('points inside the user home directory (cross-platform)', () => {
    const root = resolveDefaultStorageRoot();
    expect(root.startsWith(homedir())).toBe(true);
  });

  it('ends with .cursor/projects (the canonical Cursor agent-transcripts root)', () => {
    const root = resolveDefaultStorageRoot();
    // path.join normalizes separators per OS, so we need the OS-specific tail.
    // On Windows the joined path uses '\\', on POSIX it uses '/'. We accept both.
    const tail = root.replace(homedir(), '');
    const normalized = tail.replace(/\\/g, '/');
    expect(normalized.endsWith('/.cursor/projects')).toBe(true);
  });

  it('does not contain a literal tilde (must use os.homedir(), not "~")', () => {
    const root = resolveDefaultStorageRoot();
    expect(root.includes('~')).toBe(false);
  });
});
