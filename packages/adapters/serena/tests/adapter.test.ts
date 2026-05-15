import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SerenaAdapter } from '../src';

describe('SerenaAdapter — identity surface', () => {
  it('declares stable id, category, displayName', () => {
    const a = new SerenaAdapter({ projectRoot: '/tmp/anywhere' });
    expect(a.id).toBe('serena');
    expect(a.category).toBe('mcp');
    expect(a.displayName).toBe('Serena MCP');
  });
});

describe('SerenaAdapter.detect()', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'omem-serena-detect-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns present:false when .serena/memories does not exist', async () => {
    const a = new SerenaAdapter({ projectRoot });
    const r = await a.detect();
    expect(r.present).toBe(false);
    // storageRoot must still be reported so doctor/scan can show "we looked here"
    expect(r.storageRoot).toContain('.serena');
    expect(r.storageRoot).toContain('memories');
  });

  it('returns present:true when .serena/memories exists', async () => {
    mkdirSync(join(projectRoot, '.serena', 'memories'), { recursive: true });
    const a = new SerenaAdapter({ projectRoot });
    const r = await a.detect();
    expect(r.present).toBe(true);
    expect(r.storageRoot).toBe(join(projectRoot, '.serena', 'memories'));
  });

  it('returns present:false when .serena exists but memories subdir is missing', async () => {
    // Serena CLI sometimes drops a `.serena/project.yml` without ever creating
    // memories — that's a configured-but-empty project, not a memory source.
    mkdirSync(join(projectRoot, '.serena'), { recursive: true });
    const a = new SerenaAdapter({ projectRoot });
    const r = await a.detect();
    expect(r.present).toBe(false);
  });
});
