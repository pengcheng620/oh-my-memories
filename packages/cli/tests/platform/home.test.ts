import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { resolveOmemHome } from '../../src/platform/home';

const FAKE_HOME = process.platform === 'win32' ? 'C:\\Users\\fake' : '/home/fake';

describe('resolveOmemHome', () => {
  test('defaults to <home>/.omem when OMEM_HOME is unset', () => {
    const got = resolveOmemHome({ env: {}, homeDir: () => FAKE_HOME });
    expect(got).toBe(resolve(FAKE_HOME, '.omem'));
  });

  test('OMEM_HOME fully overrides the default', () => {
    const override = process.platform === 'win32' ? 'D:\\custom' : '/tmp/custom';
    const got = resolveOmemHome({
      env: { OMEM_HOME: override },
      homeDir: () => FAKE_HOME,
    });
    expect(got).toBe(resolve(override));
  });

  test('blank OMEM_HOME is ignored', () => {
    const got = resolveOmemHome({
      env: { OMEM_HOME: '   ' },
      homeDir: () => FAKE_HOME,
    });
    expect(got).toBe(resolve(FAKE_HOME, '.omem'));
  });

  test('empty OMEM_HOME is ignored', () => {
    const got = resolveOmemHome({
      env: { OMEM_HOME: '' },
      homeDir: () => FAKE_HOME,
    });
    expect(got).toBe(resolve(FAKE_HOME, '.omem'));
  });

  test('relative OMEM_HOME is resolved to absolute', () => {
    const got = resolveOmemHome({
      env: { OMEM_HOME: 'relative/dir' },
      homeDir: () => FAKE_HOME,
    });
    // resolve() prepends process.cwd() — we just assert the result is absolute.
    expect(resolve(got)).toBe(got);
  });
});
