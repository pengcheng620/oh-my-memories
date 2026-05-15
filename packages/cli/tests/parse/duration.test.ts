import { describe, expect, test } from 'bun:test';
import { parseDuration } from '../../src/parse/duration';

const NOW = new Date('2026-05-15T12:00:00Z').getTime();

describe('parseDuration — relative formats', () => {
  // Each row: [input, expected delta in ms]
  const cases: ReadonlyArray<readonly [string, number]> = [
    ['1s', 1_000],
    ['30s', 30 * 1_000],
    ['1m', 60_000],
    ['90m', 90 * 60_000],
    ['1h', 3_600_000],
    ['12h', 12 * 3_600_000],
    ['1d', 86_400_000],
    ['7d', 7 * 86_400_000],
    ['1w', 604_800_000],
    ['4w', 4 * 604_800_000],
    ['1M', 30 * 86_400_000],
    ['6M', 6 * 30 * 86_400_000],
    ['1y', 365 * 86_400_000],
    ['2y', 2 * 365 * 86_400_000],
  ];
  for (const [input, deltaMs] of cases) {
    test(`accepts '${input}'`, () => {
      const result = parseDuration(input, { now: NOW });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.date.getTime()).toBe(NOW - deltaMs);
      }
    });
  }
});

describe('parseDuration — ISO-8601 absolute', () => {
  test("accepts '2026-01-01' (date only)", () => {
    const result = parseDuration('2026-01-01');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.date.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    }
  });

  test("accepts '2026-05-15T12:34:56Z' (full datetime)", () => {
    const result = parseDuration('2026-05-15T12:34:56Z');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.date.toISOString()).toBe('2026-05-15T12:34:56.000Z');
    }
  });
});

describe('parseDuration — rejections', () => {
  const rejected: readonly string[] = [
    '', // empty
    '0d', // zero is meaningless for --since
    '-1d', // negative
    '1', // missing unit
    'd', // missing number
    '1.5d', // fractional
    '1ms', // millisecond unit not supported (we round to seconds)
    '1S', // capital S not in catalog (M=month, but S != s)
    '1D', // capital D not in catalog
    '1week', // long form
    '1 d', // whitespace
    'tomorrow', // English keyword
    '1d ago', // mixed
    '99999d', // > 4 digits — out of range guard
    '2026-13-99', // bogus ISO date
    '2026/01/01', // not ISO
    'now', // not a recognised keyword
  ];
  for (const input of rejected) {
    test(`rejects ${JSON.stringify(input)}`, () => {
      const result = parseDuration(input, { now: NOW });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('OMEM-E20-DURATION');
        expect(result.error.message).toContain(input);
      }
    });
  }
});

describe('parseDuration — error shape', () => {
  test('rejection produces an OmemError with default hint', () => {
    const result = parseDuration('garbage');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('OMEM-E20-DURATION');
      expect(typeof result.error.hint).toBe('string');
      expect(result.error.hint).toContain('<n>');
    }
  });
});
