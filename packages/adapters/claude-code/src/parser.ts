import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { MemoryRecord, MemoryRole } from '@oh-my-memories/adapter-sdk';

// Parser scope (M1, spec §3.1 + §7.2):
//   - Stream-parse one JSONL file line-by-line; never load the whole file into memory.
//   - Yield a MemoryRecord per user/assistant turn.
//   - Skip every other `type` value (last-prompt, permission-mode, attachment,
//     file-history-snapshot, ...) silently — schema-drift forward-compat per spec §3.1.
//   - Skip lines flagged `isMeta: true` (local-command-caveat etc. — internal noise).
//   - On a malformed JSON line: increment stats.corruptLines, do NOT throw.

export interface ParseStats {
  recordCount: number;
  corruptLines: number;
}

interface RawLine {
  type?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
  isMeta?: boolean;
}

interface ContentBlock {
  type?: string;
  text?: string;
}

function extractText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  // Anthropic content-block array: pick text blocks, drop tool calls / images / etc.
  const texts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object') {
      const b = block as ContentBlock;
      if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text);
    }
  }
  return texts.length > 0 ? texts.join('') : null;
}

function isMemoryRole(value: unknown): value is MemoryRole {
  return value === 'user' || value === 'assistant' || value === 'system' || value === 'tool';
}

export async function* parseJsonl(
  filePath: string,
  stats: ParseStats,
  source: string,
): AsyncIterable<MemoryRecord> {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;

      let parsed: RawLine;
      try {
        parsed = JSON.parse(line) as RawLine;
      } catch {
        stats.corruptLines++;
        continue;
      }

      if (parsed.type !== 'user' && parsed.type !== 'assistant') continue;
      if (parsed.isMeta) continue;

      const role = parsed.message?.role;
      if (!isMemoryRole(role)) continue;

      const text = extractText(parsed.message?.content);
      if (text === null) continue;

      if (typeof parsed.uuid !== 'string' || typeof parsed.timestamp !== 'string') continue;

      stats.recordCount++;

      // Build the record with only the fields we have, to satisfy
      // exactOptionalPropertyTypes. sessionId is optional in MemoryRecord,
      // so omit the property entirely when the source line lacks it.
      const record: MemoryRecord = {
        id: parsed.uuid,
        source,
        timestamp: new Date(parsed.timestamp),
        role,
        text,
      };
      if (typeof parsed.sessionId === 'string') {
        record.sessionId = parsed.sessionId;
      }
      yield record;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}
