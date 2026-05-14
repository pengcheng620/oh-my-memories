import { describe, expect, it } from 'bun:test';

describe('bootstrap smoke', () => {
  it('test runner is wired', () => {
    expect(1 + 1).toBe(2);
  });
});
