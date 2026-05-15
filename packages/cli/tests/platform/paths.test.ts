import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { configPath, indexPath, logsDir } from '../../src/platform/paths';

const FAKE_HOME = process.platform === 'win32' ? 'C:\\Users\\fake' : '/home/fake';

describe('platform/paths', () => {
  test('configPath = <home>/.omem/config.json', () => {
    expect(configPath({ env: {}, homeDir: () => FAKE_HOME })).toBe(
      resolve(FAKE_HOME, '.omem', 'config.json'),
    );
  });

  test('indexPath = <home>/.omem/index.sqlite', () => {
    expect(indexPath({ env: {}, homeDir: () => FAKE_HOME })).toBe(
      resolve(FAKE_HOME, '.omem', 'index.sqlite'),
    );
  });

  test('logsDir = <home>/.omem/logs', () => {
    expect(logsDir({ env: {}, homeDir: () => FAKE_HOME })).toBe(
      resolve(FAKE_HOME, '.omem', 'logs'),
    );
  });

  test('OMEM_HOME flows through to all derived paths', () => {
    const override = process.platform === 'win32' ? 'D:\\elsewhere' : '/tmp/elsewhere';
    const opts = { env: { OMEM_HOME: override }, homeDir: () => FAKE_HOME };
    expect(configPath(opts)).toBe(resolve(override, 'config.json'));
    expect(indexPath(opts)).toBe(resolve(override, 'index.sqlite'));
    expect(logsDir(opts)).toBe(resolve(override, 'logs'));
  });
});
