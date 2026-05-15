import { describe, expect, test } from 'bun:test';
import { createOmemError, isOmemError } from '../../src/output/error';
import { ERROR_CATALOG, isErrorCode, listCatalog } from '../../src/output/error-catalog';

describe('error-catalog', () => {
  test('every code is well-formed (OMEM-{E|W}NN-NAME)', () => {
    const pattern = /^OMEM-[EW]\d{2}-[A-Z][A-Z0-9-]*$/;
    for (const entry of listCatalog()) {
      expect(entry.code).toMatch(pattern);
    }
  });

  test('every catalog key matches its entry.code (no drift)', () => {
    for (const [key, entry] of Object.entries(ERROR_CATALOG)) {
      // entry.code is the literal union; cast to string for the comparison
      // because Object.entries widens the key to string.
      expect(entry.code as string).toBe(key);
    }
  });

  test('error codes start with OMEM-E and warnings with OMEM-W', () => {
    for (const entry of listCatalog()) {
      if (entry.kind === 'error') expect(entry.code.startsWith('OMEM-E')).toBe(true);
      else expect(entry.code.startsWith('OMEM-W')).toBe(true);
    }
  });

  test('isErrorCode narrows correctly', () => {
    expect(isErrorCode('OMEM-E01-USAGE')).toBe(true);
    expect(isErrorCode('OMEM-E99-DOES-NOT-EXIST')).toBe(false);
    expect(isErrorCode('not-a-code')).toBe(false);
  });

  test('codes are unique', () => {
    const codes = listCatalog().map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('createOmemError', () => {
  test('uses catalog summary + default hint when no overrides supplied', () => {
    const err = createOmemError({ code: 'OMEM-E20-DURATION' });
    expect(err.code).toBe('OMEM-E20-DURATION');
    expect(err.message).toBe(ERROR_CATALOG['OMEM-E20-DURATION'].summary);
    expect(err.hint).toBe(ERROR_CATALOG['OMEM-E20-DURATION'].defaultHint);
  });

  test('caller-supplied message overrides catalog summary', () => {
    const err = createOmemError({
      code: 'OMEM-E04-PERM',
      message: "Cannot read '/secret/path'.",
    });
    expect(err.message).toBe("Cannot read '/secret/path'.");
  });

  test('caller-supplied hint overrides default', () => {
    const err = createOmemError({
      code: 'OMEM-E04-PERM',
      hint: 'Try chmod a+r.',
    });
    expect(err.hint).toBe('Try chmod a+r.');
  });

  test('falls back to catalog defaultHint when caller does not supply one', () => {
    // No catalog entry today lacks a defaultHint, but createOmemError must
    // still be safe (no `hint: undefined` attached) under
    // exactOptionalPropertyTypes when a future code has none.
    const err = createOmemError({ code: 'OMEM-E11-IO' });
    expect(err.hint).toBe(ERROR_CATALOG['OMEM-E11-IO'].defaultHint);
  });

  test('preserves cause for --verbose rendering', () => {
    const cause = new Error('underlying ENOENT');
    const err = createOmemError({ code: 'OMEM-E11-IO', cause });
    expect(err.cause).toBe(cause);
  });

  test('attaches helpUrl when provided', () => {
    const err = createOmemError({
      code: 'OMEM-E12-CONFIG-INVALID',
      helpUrl: 'https://example.com/config',
    });
    expect(err.helpUrl).toBe('https://example.com/config');
  });

  test('emits a JSON-serialisable POJO (no class instance, no functions)', () => {
    const err = createOmemError({ code: 'OMEM-E01-USAGE', cause: { ctx: 1 } });
    const round = JSON.parse(JSON.stringify(err));
    expect(round.code).toBe('OMEM-E01-USAGE');
    expect(round.message).toBe(ERROR_CATALOG['OMEM-E01-USAGE'].summary);
    expect(round.cause).toEqual({ ctx: 1 });
  });
});

describe('isOmemError', () => {
  test('accepts a real OmemError', () => {
    expect(isOmemError(createOmemError({ code: 'OMEM-E01-USAGE' }))).toBe(true);
  });

  test('rejects null / undefined / primitives / wrong shapes', () => {
    expect(isOmemError(null)).toBe(false);
    expect(isOmemError(undefined)).toBe(false);
    expect(isOmemError('OMEM-E01-USAGE')).toBe(false);
    expect(isOmemError({ code: 'OMEM-E01-USAGE' })).toBe(false); // missing message
    expect(isOmemError({ message: 'hi' })).toBe(false); // missing code
  });
});
