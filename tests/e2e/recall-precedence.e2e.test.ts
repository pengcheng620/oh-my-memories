import { describe, expect, test } from 'bun:test';
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

function makeOpts() {
  const s = streams();
  return {
    streams: s,
    options: {
      stdout: s.stdout,
      stderr: s.stderr,
      env: { NO_COLOR: '1' },
      stdinIsTty: false,
    },
  };
}

describe('e2e: recall precedence (D2)', () => {
  test('--source overrides default all-sources behaviour', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['recall', 'test', '--source=claude-code', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(streams.stdout.text());
    for (const hit of result.hits) {
      expect(hit.source).toBe('claude-code');
    }
  });

  test('--all --source=claude-code emits W01 warning and uses --source', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['recall', 'test', '--all', '--source=claude-code', '--json'], options);
    expect(code).toBe(0);
    const errLines = streams.stderr
      .text()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));
    const warning = errLines.find((l: { warning?: boolean; code?: string }) => l.warning === true);
    expect(warning).toBeDefined();
    expect(warning?.code).toBe('OMEM-W01-FLAG');
    expect(warning?.message).toContain('--source=claude-code');
  });

  test('recall without --source queries all adapters', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['recall', 'test', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(streams.stdout.text());
    expect(Array.isArray(result.hits)).toBe(true);
  });
});
