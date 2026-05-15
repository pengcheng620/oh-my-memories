import { describe, expect, test } from 'bun:test';
import { createOmemError } from '../../src/output/error';
import { writeJsonError, writeJsonResult, writeJsonWarning } from '../../src/output/json';

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

describe('writeJsonResult', () => {
  test('emits a single line of compact JSON terminated by \\n', () => {
    const s = streams();
    writeJsonResult(s, { ok: true, sources: [] });
    expect(s.stdout.text()).toBe('{"ok":true,"sources":[]}\n');
    expect(s.stderr.text()).toBe('');
  });

  test('pretty=true uses 2-space indentation', () => {
    const s = streams();
    writeJsonResult(s, { a: 1 }, { pretty: true });
    expect(s.stdout.text()).toBe('{\n  "a": 1\n}\n');
  });

  test('meta is merged at the top level', () => {
    const s = streams();
    writeJsonResult(s, { rows: [1] }, { meta: { duration_ms: 42 } });
    const parsed = JSON.parse(s.stdout.text());
    expect(parsed).toEqual({ rows: [1], meta: { duration_ms: 42 } });
  });

  test('non-object body is emitted verbatim (no meta merge)', () => {
    const s = streams();
    writeJsonResult(s, 'hello', { meta: { x: 1 } });
    expect(s.stdout.text()).toBe('"hello"\n');
  });
});

describe('writeJsonError', () => {
  test('emits NDJSON to stderr with error: true marker', () => {
    const s = streams();
    const err = createOmemError({ code: 'OMEM-E01-USAGE' });
    writeJsonError(s, err);
    expect(s.stdout.text()).toBe('');
    const parsed = JSON.parse(s.stderr.text().trim());
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe('OMEM-E01-USAGE');
    expect(parsed.message).toBeDefined();
  });

  test('preserves cause + helpUrl in the JSON payload', () => {
    const s = streams();
    writeJsonError(
      s,
      createOmemError({
        code: 'OMEM-E11-IO',
        cause: { errno: 'ENOENT' },
        helpUrl: 'https://example.com/io',
      }),
    );
    const parsed = JSON.parse(s.stderr.text().trim());
    expect(parsed.cause).toEqual({ errno: 'ENOENT' });
    expect(parsed.helpUrl).toBe('https://example.com/io');
  });
});

describe('writeJsonWarning', () => {
  test('emits NDJSON to stderr with warning: true marker', () => {
    const s = streams();
    writeJsonWarning(s, { code: 'OMEM-W01-FLAG', message: 'redundant flag' });
    const parsed = JSON.parse(s.stderr.text().trim());
    expect(parsed.warning).toBe(true);
    expect(parsed.code).toBe('OMEM-W01-FLAG');
    expect(parsed.message).toBe('redundant flag');
  });
});
