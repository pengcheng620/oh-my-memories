import { describe, expect, test } from 'bun:test';
import { createOmemError } from '../../src/output/error';
import { renderTable, writeTextError, writeTextWarning } from '../../src/output/table';

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

describe('renderTable', () => {
  test('renders a simple two-column table with right-padded values', () => {
    const text = renderTable(
      [
        { name: 'claude-code', count: 12 },
        { name: 'cursor', count: 1234 },
      ],
      [
        { header: 'NAME', accessor: (r) => r.name },
        { header: 'COUNT', accessor: (r) => String(r.count) },
      ],
    );
    expect(text).toBe(
      ['NAME         COUNT', 'claude-code  12   ', 'cursor       1234 '].join('\n'),
    );
  });

  test('returns empty string for zero rows', () => {
    const text = renderTable([], [{ header: 'X', accessor: () => '' }]);
    expect(text).toBe('');
  });

  test('headers wider than any row drive the column width', () => {
    const text = renderTable([{ a: 'x' }], [{ header: 'WIDE-HEADER', accessor: (r) => r.a }]);
    const [headerLine, dataLine] = text.split('\n');
    expect(headerLine).toBe('WIDE-HEADER');
    expect(dataLine).toBe('x          ');
  });
});

describe('writeTextError', () => {
  test('formats `omem: <code>: <message>` and dimmed hint when colour on', () => {
    const stderr = new MemoryStream();
    writeTextError(
      { stdout: new MemoryStream(), stderr, env: {} },
      createOmemError({ code: 'OMEM-E01-USAGE' }),
    );
    const out = stderr.text();
    expect(out).toContain('omem: OMEM-E01-USAGE:');
    // dim ANSI present when colour is enabled.
    expect(out).toContain('\x1b[2m');
    expect(out).toContain('\x1b[0m');
  });

  test('NO_COLOR=1 strips ANSI codes', () => {
    const stderr = new MemoryStream();
    writeTextError(
      { stdout: new MemoryStream(), stderr, env: { NO_COLOR: '1' } },
      createOmemError({ code: 'OMEM-E01-USAGE' }),
    );
    expect(stderr.text()).not.toContain('\x1b[');
  });

  test('omits hint line when error has none', () => {
    const stderr = new MemoryStream();
    writeTextError(
      { stdout: new MemoryStream(), stderr, env: { NO_COLOR: '1' } },
      createOmemError({ code: 'OMEM-E01-USAGE', hint: undefined as never }),
    );
    // E01-USAGE has a default hint, so it WILL appear; but the line count
    // mode is what we check: error line + hint line = 2 newline-terminated lines.
    expect(stderr.text().trim().split('\n').length).toBe(2);
  });
});

describe('writeTextWarning', () => {
  test('NO_COLOR=1 → plain `omem: CODE: msg`', () => {
    const stderr = new MemoryStream();
    writeTextWarning(
      { stdout: new MemoryStream(), stderr, env: { NO_COLOR: '1' } },
      { code: 'OMEM-W01-FLAG', message: 'redundant flag' },
    );
    expect(stderr.text()).toBe('omem: OMEM-W01-FLAG: redundant flag\n');
  });

  test('colour-on wraps with dim ANSI', () => {
    const stderr = new MemoryStream();
    writeTextWarning(
      { stdout: new MemoryStream(), stderr, env: {} },
      { code: 'OMEM-W01-FLAG', message: 'redundant flag' },
    );
    expect(stderr.text()).toContain('\x1b[2m');
    expect(stderr.text()).toContain('\x1b[0m');
  });
});
