import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { MemoryRecord, MemoryRole } from '@oh-my-memories/adapter-sdk';

// Parser scope (M1, spec §3.1 + §7.2):
//   - Stream-parse one JSONL file line-by-line; never load the whole file.
//   - Codex's schema (codex_cli_rs ≥ 0.116.0):
//       { timestamp: ISO8601, type: <kind>, payload: { ... } }
//     Top-level types observed in the wild:
//       session_meta, event_msg, response_item, turn_context
//     We ONLY care about response_item with payload.type === 'message'.
//     Within those, payload.role can be user / assistant / developer / etc.
//     `developer` is system-instruction noise (skill list, sandbox policy,
//     base instructions) and is dropped — we never want to surface that
//     as user-visible memory.
//   - payload.content is an array of content blocks. Block types:
//       input_text, output_text  -> include
//       input_image              -> drop (no text payload)
//       reasoning_text           -> drop (model's internal monologue, not memory)
//   - Per-line `timestamp` is real ISO-8601, so we use it directly (unlike
//     the cursor adapter which has to fall back to file mtime).
//   - On a malformed JSON line: increment stats.corruptLines, do NOT throw.
//   - Skip every other unknown role / payload-type / block-type silently —
//     schema-drift forward-compat per spec §3.1. Codex CLI is very young and
//     ships breaking schema changes mid-release; this adapter MUST tolerate
//     fields we haven't seen yet.

export interface ParseStats {
  recordCount: number;
  corruptLines: number;
}

export interface ParseContext {
  source: string;
  sessionId: string;
}

interface RawLine {
  timestamp?: string;
  type?: string;
  payload?: { type?: string; role?: string; content?: unknown };
}

interface ContentBlock {
  type?: string;
  text?: string;
}

const TEXT_BLOCK_TYPES = new Set(['input_text', 'output_text']);

function extractText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object') {
      const b = block as ContentBlock;
      if (
        typeof b.type === 'string' &&
        TEXT_BLOCK_TYPES.has(b.type) &&
        typeof b.text === 'string'
      ) {
        texts.push(b.text);
      }
    }
  }
  return texts.length > 0 ? texts.join('') : null;
}

function isMemoryRole(value: unknown): value is MemoryRole {
  return value === 'user' || value === 'assistant' || value === 'system' || value === 'tool';
}

function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

export async function* parseJsonl(
  filePath: string,
  stats: ParseStats,
  ctx: ParseContext,
): AsyncIterable<MemoryRecord> {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  let lineIndex = -1;
  try {
    for await (const line of rl) {
      lineIndex++;
      if (!line.trim()) continue;

      let parsed: RawLine;
      try {
        parsed = JSON.parse(line) as RawLine;
      } catch {
        stats.corruptLines++;
        continue;
      }

      // Filter to response_item / message only — every other top-level type
      // (session_meta, event_msg, turn_context) and every other payload type
      // (reasoning, function_call, web_search_call, custom_tool_call, ...)
      // is structural noise, not user-recallable memory.
      if (parsed.type !== 'response_item') continue;
      if (parsed.payload?.type !== 'message') continue;

      // Drop developer-role messages — they're system instructions surfaced
      // by the codex runtime (skill list, sandbox policy, base prompt). The
      // user did not author them and would not recognize them as memories.
      if (!isMemoryRole(parsed.payload.role)) continue;

      const text = extractText(parsed.payload.content);
      if (text === null) continue;

      const timestamp = parseTimestamp(parsed.timestamp);
      if (timestamp === null) {
        // A message line with no parseable timestamp is technically schema-
        // valid but useless for recall (recency-weighted scoring needs a
        // real Date). Count it under corruptLines so doctor flags it.
        stats.corruptLines++;
        continue;
      }

      stats.recordCount++;
      yield {
        id: `${ctx.sessionId}#${lineIndex}`,
        source: ctx.source,
        sessionId: ctx.sessionId,
        timestamp,
        role: parsed.payload.role,
        text,
      };
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}
