import { describe, expect, it } from 'bun:test';
import { extractTextBlocks } from '../src';

describe('extractTextBlocks', () => {
  it('returns the string verbatim when content is a plain string', () => {
    expect(extractTextBlocks('hello world')).toBe('hello world');
    expect(extractTextBlocks('')).toBe(''); // empty string is still a string
  });

  it('returns null for non-string non-array values (silent schema-drift tolerance)', () => {
    expect(extractTextBlocks(null)).toBeNull();
    expect(extractTextBlocks(undefined)).toBeNull();
    expect(extractTextBlocks(42)).toBeNull();
    expect(extractTextBlocks({ type: 'text', text: 'oops' })).toBeNull();
  });

  it('returns null for empty arrays', () => {
    expect(extractTextBlocks([])).toBeNull();
  });

  it('returns null when no blocks match the allowed types', () => {
    expect(
      extractTextBlocks([
        { type: 'image', source: { url: 'x' } },
        { type: 'tool_use', id: 'abc' },
      ]),
    ).toBeNull();
  });

  it('default allowed type is "text" — matches Anthropic content blocks', () => {
    const result = extractTextBlocks([
      { type: 'text', text: 'hello ' },
      { type: 'tool_use', id: 'abc' },
      { type: 'text', text: 'world' },
    ]);
    expect(result).toBe('hello world');
  });

  it('honours a custom allowedTypes set (codex case)', () => {
    const allowed = new Set(['input_text', 'output_text']);
    const result = extractTextBlocks(
      [
        { type: 'input_text', text: 'user said ' },
        { type: 'reasoning_text', text: 'IGNORED model thinking' },
        { type: 'output_text', text: 'assistant replied' },
      ],
      allowed,
    );
    expect(result).toBe('user said assistant replied');
  });

  it('skips blocks where text is not a string', () => {
    const result = extractTextBlocks([
      { type: 'text', text: 'kept ' },
      { type: 'text', text: 42 },
      { type: 'text' },
      { type: 'text', text: null },
      { type: 'text', text: 'tail' },
    ]);
    expect(result).toBe('kept tail');
  });

  it('skips entries that are not objects (forward-compat with schema drift)', () => {
    const result = extractTextBlocks([
      'a raw string in the middle',
      null,
      42,
      { type: 'text', text: 'kept' },
    ]);
    expect(result).toBe('kept');
  });
});
