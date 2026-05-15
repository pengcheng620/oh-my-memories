import { describe, expect, test } from 'bun:test';
import { colorEnabled, isInteractive } from '../../src/platform/interactive';

describe('isInteractive', () => {
  test('returns true when stdin is a TTY and no overrides', () => {
    expect(isInteractive({ env: {}, stdinIsTty: true })).toBe(true);
  });

  test('returns false when stdin is not a TTY (piped input)', () => {
    expect(isInteractive({ env: {}, stdinIsTty: false })).toBe(false);
  });

  test('--non-interactive flag forces false even on a TTY', () => {
    expect(isInteractive({ env: {}, stdinIsTty: true, nonInteractiveFlag: true })).toBe(false);
  });

  for (const truthy of ['1', 'true', 'yes', 'Y', 'ON']) {
    test(`OMEM_NON_INTERACTIVE='${truthy}' forces false`, () => {
      expect(isInteractive({ env: { OMEM_NON_INTERACTIVE: truthy }, stdinIsTty: true })).toBe(
        false,
      );
    });
  }

  for (const falsy of ['', '0', 'false', 'no', 'off', 'maybe']) {
    test(`OMEM_NON_INTERACTIVE='${falsy}' is ignored`, () => {
      expect(isInteractive({ env: { OMEM_NON_INTERACTIVE: falsy }, stdinIsTty: true })).toBe(true);
    });
  }
});

describe('colorEnabled', () => {
  test('colour on by default', () => {
    expect(colorEnabled({})).toBe(true);
  });

  test('NO_COLOR=1 disables colour', () => {
    expect(colorEnabled({ NO_COLOR: '1' })).toBe(false);
  });

  test("NO_COLOR='' (defined empty) does NOT disable colour (per no-color.org)", () => {
    // Per https://no-color.org: "Command-line software which adds ANSI color
    // … should check for a NO_COLOR environment variable that, when present
    // and not an empty string (regardless of its value), prevents the
    // addition of ANSI color."
    expect(colorEnabled({ NO_COLOR: '' })).toBe(true);
  });

  test('NO_COLOR=anything-non-empty disables colour', () => {
    expect(colorEnabled({ NO_COLOR: 'true' })).toBe(false);
    expect(colorEnabled({ NO_COLOR: 'yes' })).toBe(false);
  });
});
