// Shared content-block extraction for Anthropic / OpenAI-style content arrays.
//
// All three Cat A JSONL adapters (claude-code, cursor, codex) wrap their
// per-turn text in a `content` field that is either:
//   1. A bare string  ->  use it verbatim
//   2. An array of `{ type, text, ... }` blocks  ->  pick the text-bearing
//      ones, drop tool_use / tool_result / image / reasoning_text / ...
// Adapters differ only in *which* block types they accept:
//   - claude-code, cursor : { 'text' }
//   - codex               : { 'input_text', 'output_text' }
// Hence the optional `allowedTypes` set.

const DEFAULT_TEXT_BLOCK_TYPES: ReadonlySet<string> = new Set(['text']);

interface ContentBlockShape {
  type?: unknown;
  text?: unknown;
}

/**
 * Extracts user-visible text from a `message.content` value of unknown shape.
 *
 * - String input passes through untouched (preserves empty string — callers
 *   are expected to filter empties themselves if they want to).
 * - Array input is reduced to the concatenated `text` of every block whose
 *   `type` is in `allowedTypes`.
 * - Returns `null` when nothing usable was found (so callers can `continue`
 *   without producing an empty MemoryRecord).
 *
 * Forward-compat: any unrecognised entry (non-object, missing fields,
 * non-string `text`, unknown `type`) is silently skipped per spec §3.1.
 */
export function extractTextBlocks(
  content: unknown,
  allowedTypes: ReadonlySet<string> = DEFAULT_TEXT_BLOCK_TYPES,
): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as ContentBlockShape;
    if (typeof b.type !== 'string') continue;
    if (!allowedTypes.has(b.type)) continue;
    if (typeof b.text !== 'string') continue;
    texts.push(b.text);
  }
  return texts.length > 0 ? texts.join('') : null;
}
