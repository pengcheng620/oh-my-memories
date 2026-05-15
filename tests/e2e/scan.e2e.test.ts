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

describe('e2e: scan', () => {
  test('scan --json returns sources array with expected shape', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['scan', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(streams.stdout.text());
    expect(Array.isArray(result.sources)).toBe(true);
    for (const source of result.sources) {
      expect(typeof source.id).toBe('string');
      expect(typeof source.displayName).toBe('string');
      expect(typeof source.present).toBe('boolean');
      expect(typeof source.schemaVersion).toBe('string');
      expect(typeof source.healthy).toBe('boolean');
    }
  });

  test('scan text output renders table', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['scan'], options);
    expect(code).toBe(0);
    const out = streams.stdout.text();
    expect(out).toContain('SOURCE');
    expect(out).toContain('PRESENT');
  });

  test('scan --source=claude-code filters to single adapter', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['scan', '--source=claude-code', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(streams.stdout.text());
    expect(result.sources.length).toBe(1);
    expect(result.sources[0].id).toBe('claude-code');
  });

  test('scan --source=unknown reports error', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['scan', '--source=unknown', '--json'], options);
    expect(code).toBe(1);
    expect(streams.stderr.text()).toContain('OMEM-E03-NO-SOURCES');
  });
});
