import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/index';

// CLI-level integration tests for `omem recall` — focused on the M3 wiring:
// - cold-start safety (no canonical.db ⇒ no canonical hits, no errors)
// - canonical-store hits surface with origin:"canonical"
// - origin field is present in JSON output

class MemoryStream {
  chunks: string[] = [];
  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }
  text(): string {
    return this.chunks.join('');
  }
}

let omemHome: string;
let fakeUserHome: string;

beforeEach(() => {
  omemHome = mkdtempSync(join(tmpdir(), 'omem-recall-home-'));
  // OMEM_HOME_OVERRIDE rebases adapter roots so the test stays hermetic.
  fakeUserHome = mkdtempSync(join(tmpdir(), 'omem-recall-user-'));
});

afterEach(() => {
  for (const dir of [omemHome, fakeUserHome]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows handle release lag; non-fatal. */
    }
  }
});

const opts = () => {
  const stdout = new MemoryStream();
  const stderr = new MemoryStream();
  return {
    stdout,
    stderr,
    streams: { stdout, stderr },
    options: {
      stdout,
      stderr,
      env: {
        NO_COLOR: '1',
        OMEM_HOME: omemHome,
        OMEM_HOME_OVERRIDE: fakeUserHome,
      } as NodeJS.ProcessEnv,
      stdinIsTty: false,
    },
  };
};

describe('omem recall (M3 canonical-store wiring)', () => {
  test('cold start: canonical.db missing ⇒ recall succeeds and returns 0 hits', async () => {
    const ctx = opts();
    const code = await main(['recall', 'typescript', '--json'], ctx.options);
    // No canonical.db AND no adapter records ⇒ empty result, exit 0.
    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text());
    expect(result.hits).toEqual([]);
  });

  test('after `omem remember`: recall surfaces the memory with origin:"canonical"', async () => {
    {
      const ctx = opts();
      const code = await main(
        ['remember', 'always use TypeScript strict mode', '--json'],
        ctx.options,
      );
      expect(code).toBe(0);
    }

    const ctx = opts();
    const code = await main(['recall', 'typescript', '--json'], ctx.options);
    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text());
    expect(result.hits.length).toBe(1);
    expect(result.hits[0].origin).toBe('canonical');
    expect(result.hits[0].text).toContain('TypeScript');
  });

  test('multiple `omem remember` rounds: best BM25 match ranks first', async () => {
    const remembers = [
      'always use TypeScript strict mode',
      'prefer Bun over Node for new projects',
      'TypeScript is good but JavaScript is fine too',
      'shell scripts should be POSIX-compatible',
    ];
    for (const text of remembers) {
      const ctx = opts();
      const code = await main(['remember', text, '--json'], ctx.options);
      expect(code).toBe(0);
    }

    const ctx = opts();
    const code = await main(['recall', 'typescript', '--json'], ctx.options);
    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text());
    expect(result.hits.length).toBe(2);
    for (const hit of result.hits) {
      expect(hit.origin).toBe('canonical');
      expect(hit.text.toLowerCase()).toContain('typescript');
    }
  });

  test('text output: human table works without JSON flag', async () => {
    {
      const ctx = opts();
      await main(['remember', 'use bun:sqlite for the canonical store'], ctx.options);
    }
    const ctx = opts();
    const code = await main(['recall', 'sqlite'], ctx.options);
    expect(code).toBe(0);
    const out = ctx.streams.stdout.text();
    expect(out).toContain('SOURCE');
    expect(out).toContain('SCORE');
    expect(out).toContain('PREVIEW');
    expect(out.toLowerCase()).toContain('sqlite');
  });

  test('--limit caps total result count after fusion', async () => {
    for (let i = 0; i < 5; i++) {
      const ctx = opts();
      await main(['remember', `typescript fact #${i}`, '--json'], ctx.options);
    }
    const ctx = opts();
    const code = await main(['recall', 'typescript', '--limit', '2', '--json'], ctx.options);
    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text());
    expect(result.hits.length).toBe(2);
  });
});

describe('omem recall (M7 provenance)', () => {
  test('JSON output includes provenance with matchReason', async () => {
    {
      const ctx = opts();
      await main(['remember', 'use jwt for authentication', '--json'], ctx.options);
    }
    const ctx = opts();
    const code = await main(['recall', 'jwt', '--json'], ctx.options);
    expect(code).toBe(0);
    const result = JSON.parse(ctx.streams.stdout.text());
    expect(result.hits.length).toBe(1);

    const hit = result.hits[0];
    expect(hit.provenance).toBeDefined();
    expect(hit.provenance.source).toBe('omem');
    expect(hit.provenance.timestamp).toBeDefined();
    expect(Array.isArray(hit.provenance.matchReason)).toBe(true);
    expect(hit.provenance.matchReason.length).toBeGreaterThanOrEqual(1);

    const bm25 = hit.provenance.matchReason.find((r: { type: string }) => r.type === 'bm25');
    expect(bm25).toBeDefined();
  });

  test('text output shows MATCHED BY column', async () => {
    {
      const ctx = opts();
      await main(['remember', 'always use strict typescript'], ctx.options);
    }
    const ctx = opts();
    const code = await main(['recall', 'typescript'], ctx.options);
    expect(code).toBe(0);
    const out = ctx.streams.stdout.text();
    expect(out).toContain('MATCHED BY');
    expect(out).toContain('bm25:');
  });

  test('--verbose shows SESSION and FILE columns', async () => {
    {
      const ctx = opts();
      await main(['remember', 'use bun runtime'], ctx.options);
    }
    const ctx = opts();
    const code = await main(['recall', 'bun', '--verbose'], ctx.options);
    expect(code).toBe(0);
    const out = ctx.streams.stdout.text();
    expect(out).toContain('SESSION');
    expect(out).toContain('FILE');
    expect(out).toContain('MATCHED BY');
  });

  test('--verbose is a global flag (not per-command)', async () => {
    {
      const ctx = opts();
      await main(['remember', 'use bun runtime'], ctx.options);
    }
    const ctx = opts();
    const code = await main(['recall', '--verbose', 'bun'], ctx.options);
    expect(code).toBe(0);
    const out = ctx.streams.stdout.text();
    expect(out).toContain('SESSION');
    expect(out).toContain('FILE');
  });
});
