import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { MemoryRecord, MemoryRole } from '@oh-my-memories/adapter-sdk';

// Parser scope (M1, spec §3.1 + §7.2):
//   - Stream-parse one JSONL file line-by-line; never load the whole file into memory.
//   - Yield a MemoryRecord per user/assistant turn.
//   - Cursor's schema is structurally different from Claude Code's:
//       claude-code   {type, uuid, sessionId, timestamp, message:{role,content}}
//       cursor        {role, message:{content:[{type,text|...}]}}
//     Specifically, cursor:
//       - has the role at the top level (not nested under .message.role)
//       - has no per-line uuid           -> id is derived from (sessionId, lineIndex)
//       - has no per-line timestamp      -> timestamp is the file mtime (caller injects)
//       - has no per-line sessionId      -> sessionId is derived from filename (caller injects)
//   - On a malformed JSON line: increment stats.corruptLines, do NOT throw.
//   - Skip every other unknown role silently — schema-drift forward-compat per spec §3.1.

export interface ParseStats {
  recordCount: number;
  corruptLines: number;
}

export interface ParseContext {
  source: string;
  sessionId: string;
  fileTimestamp: Date;
}

interface RawLine {
  role?: string;
  message?: { content?: unknown };
}

interface ContentBlock {
  type?: string;
  text?: string;
}

function extractText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  // Anthropic-style content-block array: pick text blocks, drop tool_use / tool_result / images.
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

      if (!isMemoryRole(parsed.role)) continue;

      const text = extractText(parsed.message?.content);
      if (text === null) continue;

      stats.recordCount++;
      yield {
        id: `${ctx.sessionId}#${lineIndex}`,
        source: ctx.source,
        sessionId: ctx.sessionId,
        timestamp: ctx.fileTimestamp,
        role: parsed.role,
        text,
      };
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}
