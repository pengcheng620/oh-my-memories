import { describe, expect, it } from 'bun:test';
import { createFingerprint, stableKey } from '../src/fingerprint';

describe('createFingerprint', () => {
  it('produces a stable lowercase 64-char hex digest', () => {
    const fp = createFingerprint({
      text: 'hello world',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
      sessionId: 'abc',
    });
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces identical digests for identical logical records', () => {
    const a = createFingerprint({
      text: 'hi',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
      sessionId: 'abc',
    });
    const b = createFingerprint({
      text: 'hi',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
      sessionId: 'abc',
    });
    expect(a).toBe(b);
  });

  it('treats CRLF and LF as equivalent', () => {
    const a = createFingerprint({
      text: 'hello\r\nworld',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
    });
    const b = createFingerprint({
      text: 'hello\nworld',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
    });
    expect(a).toBe(b);
  });

  it('strips trailing whitespace before each newline and at EOF', () => {
    const a = createFingerprint({
      text: 'hello   \nworld   ',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
    });
    const b = createFingerprint({
      text: 'hello\nworld',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
    });
    expect(a).toBe(b);
  });

  it('does NOT collapse interior whitespace (different memories stay distinct)', () => {
    const a = createFingerprint({
      text: 'hello  world',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
    });
    const b = createFingerprint({
      text: 'hello world',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
    });
    expect(a).not.toBe(b);
  });

  it('changes when timestamp differs by even 1 ms', () => {
    const a = createFingerprint({
      text: 'hi',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
    });
    const b = createFingerprint({
      text: 'hi',
      timestamp: new Date('2026-05-15T17:00:00.001Z'),
      role: 'user',
    });
    expect(a).not.toBe(b);
  });

  it('changes when role or sessionId differs', () => {
    const base = {
      text: 'hi',
      timestamp: new Date('2026-05-15T17:00:00.000Z'),
      role: 'user',
      sessionId: 'a',
    } as const;
    const fp = createFingerprint(base);
    expect(fp).not.toBe(createFingerprint({ ...base, role: 'assistant' }));
    expect(fp).not.toBe(createFingerprint({ ...base, sessionId: 'b' }));
  });
});

describe('stableKey', () => {
  it('joins source and id with a colon', () => {
    expect(stableKey({ source: 'cursor', id: 'abc' })).toBe('cursor:abc');
  });
});
