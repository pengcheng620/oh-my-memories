import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import { SerenaAdapter } from '../src';

const FIX = join(import.meta.dir, 'fixtures');

// PLAN.md §2 Lane D: Markdown adapter substitutes `corrupt.test.ts` (a
// JSONL-line concept) with `malformed-frontmatter.test.ts` because the
// resilience surface for Serena is the YAML frontmatter block, not a stream
// of JSON lines. The contract: malformed frontmatter must NOT crash the
// scan and the count must be exposed via `lastScanStats.corruptLines`
// (we reuse that field — see README schema-version note).

function withFixtureLayout(...fixtures: string[]): {
  projectRoot: string;
  cleanup: () => void;
} {
  const projectRoot = mkdtempSync(join(tmpdir(), 'omem-serena-malformed-'));
  const memoriesDir = join(projectRoot, '.serena', 'memories');
  mkdirSync(memoriesDir, { recursive: true });
  for (const fix of fixtures) {
    copyFileSync(join(FIX, fix), join(memoriesDir, fix));
  }
  return { projectRoot, cleanup: () => rmSync(projectRoot, { recursive: true, force: true }) };
}

describe('SerenaAdapter — malformed frontmatter tolerance (PLAN.md §2 Lane D)', () => {
  let projectRoot: string;
  let adapter: SerenaAdapter;
  let cleanup = () => {};

  beforeEach(() => {
    const r = withFixtureLayout('malformed-frontmatter.md');
    projectRoot = r.projectRoot;
    cleanup = r.cleanup;
    adapter = new SerenaAdapter({ projectRoot });
  });

  afterEach(() => cleanup());

  it('does NOT throw when scanning a file with broken YAML frontmatter', async () => {
    const records: MemoryRecord[] = [];
    let threw = false;
    try {
      for await (const r of adapter.scan()) records.push(r);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it('still emits a record (the body is preserved as text)', async () => {
    const records: MemoryRecord[] = [];
    for await (const r of adapter.scan()) records.push(r);
    expect(records).toHaveLength(1);
    const first = records[0];
    if (!first) throw new Error('expected the malformed file to still emit a record');
    expect(first.id).toBe('malformed-frontmatter');
    // text must contain the actual body — never lose user data, even on bad YAML.
    expect(first.text).toContain('Broken Note');
    expect(first.text).toContain('intentionally malformed');
  });

  it('exposes the malformed-frontmatter count via lastScanStats.corruptLines', async () => {
    for await (const _ of adapter.scan()) {
      // drain
    }
    expect(adapter.lastScanStats).not.toBeNull();
    expect(adapter.lastScanStats?.corruptLines).toBe(1);
    expect(adapter.lastScanStats?.recordCount).toBe(1);
    expect(adapter.lastScanStats?.filesScanned).toBe(1);
  });
});

describe('SerenaAdapter — unclosed frontmatter block', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('does not hang; treats unclosed --- as malformed and emits the file as-is', async () => {
    const { projectRoot, cleanup: c } = withFixtureLayout('unclosed-frontmatter.md');
    cleanup = c;
    const adapter = new SerenaAdapter({ projectRoot });
    const records: MemoryRecord[] = [];
    for await (const r of adapter.scan()) records.push(r);
    expect(records).toHaveLength(1);
    const first = records[0];
    if (!first) throw new Error('expected the unclosed file to still emit a record');
    // The opening --- is preserved in text because no close marker was found.
    expect(first.text).toContain('---');
    expect(first.text).toContain('Never Closed');
    expect(adapter.lastScanStats?.corruptLines).toBe(1);
  });
});

describe('SerenaAdapter — mixed valid + malformed in same scan', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('counts only the malformed file in corruptLines; both emit records', async () => {
    const { projectRoot, cleanup: c } = withFixtureLayout(
      'valid-with-frontmatter.md',
      'malformed-frontmatter.md',
    );
    cleanup = c;
    const adapter = new SerenaAdapter({ projectRoot });
    const records: MemoryRecord[] = [];
    for await (const r of adapter.scan()) records.push(r);
    expect(records).toHaveLength(2);
    expect(adapter.lastScanStats?.corruptLines).toBe(1);
    expect(adapter.lastScanStats?.recordCount).toBe(2);
    expect(adapter.lastScanStats?.filesScanned).toBe(2);
  });
});
