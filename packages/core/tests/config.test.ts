import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getConfigValue, listConfig, loadConfig, saveConfig, setConfigValue } from '../src/config';

let tempDirs: string[] = [];

function freshDir(): string {
  const dir = resolve(
    tmpdir(),
    `omem-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  tempDirs = [];
});

describe('config', () => {
  test('loadConfig returns defaults when no file exists', () => {
    const cfg = loadConfig('/nonexistent/config.json');
    expect(cfg.sources).toEqual([]);
    expect(cfg.defaultLimit).toBe(50);
  });

  test('saveConfig creates directory and writes JSON', () => {
    const dir = freshDir();
    const path = join(dir, 'sub', 'config.json');
    const cfg = setConfigValue(loadConfig('/nonexistent'), 'sources', 'claude-code');
    const cfg2 = setConfigValue(cfg, 'defaultLimit', '25');
    saveConfig(path, cfg2);
    expect(existsSync(path)).toBe(true);
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    expect(raw.sources).toEqual(['claude-code']);
    expect(raw.defaultLimit).toBe(25);
  });

  test('loadConfig round-trips with saveConfig', () => {
    const dir = freshDir();
    const path = join(dir, 'config.json');
    let original = loadConfig('/nonexistent');
    original = setConfigValue(original, 'sources', 'cursor, codex');
    original = setConfigValue(original, 'defaultLimit', '10');
    saveConfig(path, original);
    const loaded = loadConfig(path);
    expect(loaded.sources).toEqual(['cursor', 'codex']);
    expect(loaded.defaultLimit).toBe(10);
  });

  test('loadConfig handles corrupt JSON gracefully', () => {
    const dir = freshDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, 'not json!!!', 'utf8');
    const cfg = loadConfig(path);
    expect(cfg.sources).toEqual([]);
    expect(cfg.defaultLimit).toBe(50);
  });

  test('setConfigValue updates sources as comma-separated', () => {
    const cfg = loadConfig('/nonexistent');
    const updated = setConfigValue(cfg, 'sources', 'claude-code, cursor');
    expect(updated.sources).toEqual(['claude-code', 'cursor']);
  });

  test('setConfigValue updates defaultLimit', () => {
    const cfg = loadConfig('/nonexistent');
    const updated = setConfigValue(cfg, 'defaultLimit', '25');
    expect(updated.defaultLimit).toBe(25);
  });

  test('getConfigValue returns correct value', () => {
    const cfg = loadConfig('/nonexistent/config.json');
    const updated = setConfigValue(cfg, 'sources', 'a');
    expect(getConfigValue(updated, 'sources')).toEqual(['a']);
    expect(getConfigValue(updated, 'defaultLimit')).toBe(50);
    expect(getConfigValue(updated, 'embedding.enabled')).toBe(false);
    expect(getConfigValue(updated, 'embedding.model')).toBe('all-MiniLM-L6-v2');
  });

  test('listConfig marks source correctly', () => {
    const cfg = loadConfig('/nonexistent/config.json');
    const updated = setConfigValue(cfg, 'sources', 'claude-code');
    const entries = listConfig(updated, true);
    const sourcesEntry = entries.find((e) => e.key === 'sources');
    expect(sourcesEntry?.source).toBe('config');
    const limitEntry = entries.find((e) => e.key === 'defaultLimit');
    expect(limitEntry?.source).toBe('default');
    const embEntry = entries.find((e) => e.key === 'embedding.enabled');
    expect(embEntry?.source).toBe('default');
  });
});
