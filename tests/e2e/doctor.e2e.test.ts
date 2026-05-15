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

describe('e2e: doctor', () => {
  test('doctor --json returns health report', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['doctor', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(streams.stdout.text());
    expect(result.omemVersion).toBe('0.0.0');
    expect(typeof result.runtime).toBe('string');
    expect(typeof result.omemHome).toBe('string');
    expect(typeof result.configExists).toBe('boolean');
    expect(Array.isArray(result.adapters)).toBe(true);
    expect(Array.isArray(result.denylistPatterns)).toBe(true);
    for (const adapter of result.adapters) {
      expect(typeof adapter.id).toBe('string');
      expect(typeof adapter.present).toBe('boolean');
      expect(typeof adapter.schemaVersion).toBe('string');
    }
  });

  test('doctor text output includes header info', async () => {
    const { streams, options } = makeOpts();
    const code = await main(['doctor'], options);
    expect(code).toBe(0);
    const out = streams.stdout.text();
    expect(out).toContain('omem doctor');
    expect(out).toContain('Version:');
    expect(out).toContain('Runtime:');
    expect(out).toContain('SOURCE');
  });
});
