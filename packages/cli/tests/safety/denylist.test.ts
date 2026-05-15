import { describe, expect, test } from 'bun:test';
import { denylistPatternIds, denylistReason, isDenylisted } from '../../src/safety/denylist';

describe('isDenylisted — positive matches (each spec.md §7.1 pattern)', () => {
  const denied: ReadonlyArray<readonly [string, string]> = [
    // [path, expected reason id]
    ['cert.pem', 'pem'],
    ['/abs/path/to/cert.pem', 'pem'],
    ['client.PEM', 'pem'], // case insensitive

    ['.env', 'env'],
    ['.env.local', 'env'],
    ['.env.production', 'env'],

    ['auth.json', 'auth-json'],
    ['/etc/auth.json', 'auth-json'],

    ['my-credentials.txt', 'credentials'],
    ['CREDENTIALS', 'credentials'],
    ['db_credentials.json', 'credentials'],

    ['secret.txt', 'secret'],
    ['top-secret-file', 'secret'],
    ['SECRET-key', 'secret'],

    ['private.key', 'key'],
    ['ssh.KEY', 'key'],

    ['token.json', 'token-json'],
  ];
  for (const [path, reason] of denied) {
    test(`denylists ${JSON.stringify(path)} as '${reason}'`, () => {
      expect(isDenylisted(path)).toBe(true);
      expect(denylistReason(path)).toBe(reason);
    });
  }
});

describe('isDenylisted — negative matches', () => {
  const allowed: readonly string[] = [
    'session.jsonl',
    'memory.md',
    'config.toml',
    '.envrc', // direnv config — NOT a dotenv (no leading `.env.` or exact `.env`)
    'README.md',
    'env.json', // doesn't start with leading dot
    'authentication.md', // contains 'auth' but not the exact name
    'tokens.txt', // plural, not the exact 'token.json'
    'pem-notes.md', // contains 'pem' but doesn't END with .pem
    'keynote.md', // contains 'key' but doesn't end with .key
    'foo/secret-dir/notes.md', // dir contains 'secret' but basename does not
  ];
  for (const path of allowed) {
    test(`allows ${JSON.stringify(path)}`, () => {
      expect(isDenylisted(path)).toBe(false);
      expect(denylistReason(path)).toBeUndefined();
    });
  }
});

describe('denylistPatternIds', () => {
  test('exposes 7 stable ids', () => {
    expect(denylistPatternIds()).toEqual([
      'pem',
      'env',
      'auth-json',
      'credentials',
      'secret',
      'key',
      'token-json',
    ]);
  });
});
