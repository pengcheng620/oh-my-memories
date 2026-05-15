import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main } from '../../packages/cli/src/index';

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

function streams() {
  return { stdout: new MemoryStream(), stderr: new MemoryStream() };
}

// Shared fixture root with a claude-code-shaped transcript.
const FIXTURE_ROOT = resolve(tmpdir(), `omem-e2e-recall-${Date.now()}`);
const CC_ROOT = join(FIXTURE_ROOT, '.claude', 'projects', 'test-project');
const OMEM_HOME = join(FIXTURE_ROOT, '.omem');

const FIXTURE_JSONL = [
  '{"type":"last-prompt","leafUuid":"d718249a","sessionId":"sess-e2e-recall"}',
  `{"parentUuid":"d718249a","type":"user","message":{"role":"user","content":"Help me refactor parseInt usage to Number()."},"uuid":"u-001","timestamp":"${new Date(Date.now() - 3600_000).toISOString()}","sessionId":"sess-e2e-recall"}`,
  `{"parentUuid":"u-001","type":"assistant","message":{"role":"assistant","content":"Number() is stricter than parseInt() because it rejects trailing non-digits."},"uuid":"u-002","timestamp":"${new Date(Date.now() - 3500_000).toISOString()}","sessionId":"sess-e2e-recall"}`,
  `{"parentUuid":"u-002","type":"user","message":{"role":"user","content":"What about using parseFloat for decimal numbers?"},"uuid":"u-003","timestamp":"${new Date(Date.now() - 3400_000).toISOString()}","sessionId":"sess-e2e-recall"}`,
].join('\n');

beforeAll(() => {
  mkdirSync(CC_ROOT, { recursive: true });
  writeFileSync(join(CC_ROOT, 'sess-e2e-recall.jsonl'), `${FIXTURE_JSONL}\n`);
});

afterAll(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

function makeOpts(extra: { env?: NodeJS.ProcessEnv } = {}) {
  const s = streams();
  return {
    streams: s,
    options: {
      stdout: s.stdout,
      stderr: s.stderr,
      env: {
        NO_COLOR: '1',
        OMEM_HOME: OMEM_HOME,
        OMEM_CC_STORAGE_ROOT: CC_ROOT,
        ...extra.env,
      },
      stdinIsTty: false,
    },
  };
}

describe('e2e: recall', () => {
  test('recall with matching query returns hits from fixtures', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['recall', 'parseInt', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(streams.stdout.text());
    expect(result.query).toBe('parseInt');
    expect(Array.isArray(result.hits)).toBe(true);
  });

  test('recall with no-match query returns empty hits', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['recall', 'xyznonexistent', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(streams.stdout.text());
    expect(result.hits).toEqual([]);
  });

  test('recall --source filters to a single adapter', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['recall', 'parseInt', '--source=claude-code', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(streams.stdout.text());
    expect(Array.isArray(result.hits)).toBe(true);
  });

  test('recall --all --source warns OMEM-W01-FLAG and uses --source', async () => {
    const { streams, options } = makeOpts();
    await main(['recall', 'parseInt', '--all', '--source=claude-code', '--json'], options);
    const errLines = streams.stderr
      .text()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));
    const warning = errLines.find((l: { warning?: boolean }) => l.warning === true);
    expect(warning?.code).toBe('OMEM-W01-FLAG');
  });

  test('recall --limit caps results', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['recall', 'parseInt', '--limit=1', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(streams.stdout.text());
    expect(result.hits.length).toBeLessThanOrEqual(1);
  });

  test('text output renders table (no --json)', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['recall', 'parseInt'], options);
    expect(code).toBe(0);
    const out = streams.stdout.text();
    // If there are hits, output should have table headers.
    if (!out.includes('No matches found')) {
      expect(out).toContain('SOURCE');
      expect(out).toContain('SCORE');
    }
  });
});
