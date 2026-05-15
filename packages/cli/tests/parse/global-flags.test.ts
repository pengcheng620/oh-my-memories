import { describe, expect, test } from 'bun:test';
import { parseGlobalFlags } from '../../src/parse/global-flags';

describe('parseGlobalFlags', () => {
  test('all flags default to false on empty argv', () => {
    const { flags, rest } = parseGlobalFlags([]);
    expect(flags).toEqual({
      json: false,
      verbose: false,
      nonInteractive: false,
      noColor: false,
      help: false,
      version: false,
    });
    expect(rest).toEqual([]);
  });

  test('extracts --json and removes from rest', () => {
    const { flags, rest } = parseGlobalFlags(['scan', '--json']);
    expect(flags.json).toBe(true);
    expect(rest).toEqual(['scan']);
  });

  test('extracts every flag in one call', () => {
    const { flags, rest } = parseGlobalFlags([
      'recall',
      '--json',
      'foo',
      '--verbose',
      '--non-interactive',
      '--no-color',
    ]);
    expect(flags).toEqual({
      json: true,
      verbose: true,
      nonInteractive: true,
      noColor: true,
      help: false,
      version: false,
    });
    expect(rest).toEqual(['recall', 'foo']);
  });

  test('preserves residual argv order', () => {
    const { rest } = parseGlobalFlags(['recall', '--json', 'a', 'b', '--verbose', 'c']);
    expect(rest).toEqual(['recall', 'a', 'b', 'c']);
  });

  test('-h and --help both set help=true', () => {
    expect(parseGlobalFlags(['-h']).flags.help).toBe(true);
    expect(parseGlobalFlags(['--help']).flags.help).toBe(true);
  });

  test('-v and --version both set version=true', () => {
    expect(parseGlobalFlags(['-v']).flags.version).toBe(true);
    expect(parseGlobalFlags(['--version']).flags.version).toBe(true);
  });

  test('unknown long flags pass through to rest (subcommand decides)', () => {
    const { rest } = parseGlobalFlags(['scan', '--unknown', '--source=cursor']);
    expect(rest).toEqual(['scan', '--unknown', '--source=cursor']);
  });
});
