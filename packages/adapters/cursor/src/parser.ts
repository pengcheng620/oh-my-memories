import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import {
  type ParseStats,
  extractTextBlocks,
  isMemoryRole,
  streamJsonl,
} from '@oh-my-memories/adapter-shared';

// Parser scope (M1, spec §3.1 + §7.2):
//   - Stream-parse one JSONL file via the shared streamJsonl primitive.
//   - Yield a MemoryRecord per user/assistant turn.
//   - Cursor's schema is structurally different from Claude Code's:
//       claude-code   {type, uuid, sessionId, timestamp, message:{role,content}}
//       cursor        {role, message:{content:[{type,text|...}]}}
//     Specifically, cursor:
//       - has the role at the top level (not nested under .message.role)
//       - has no per-line uuid           -> id is derived from (sessionId, lineIndex)
//       - has no per-line timestamp      -> timestamp is the file mtime (caller injects)
//       - has no per-line sessionId      -> sessionId is derived from filename (caller injects)
//   - On a malformed JSON line: increment stats.corruptLines (the shared
//     primitive surfaces this via { ok: false }).
//   - Skip every other unknown role silently — schema-drift forward-compat
//     per spec §3.1.

export type { ParseStats } from '@oh-my-memories/adapter-shared';

export interface ParseContext {
  source: string;
  sessionId: string;
  fileTimestamp: Date;
}

interface RawLine {
  role?: string;
  message?: { content?: unknown };
}

export async function* parseJsonl(
  filePath: string,
  stats: ParseStats,
  ctx: ParseContext,
): AsyncIterable<MemoryRecord> {
  let lineIndex = -1;
  for await (const line of streamJsonl(filePath)) {
    lineIndex++;
    if (!line.ok) {
      stats.corruptLines++;
      continue;
    }
    const parsed = line.value as RawLine;

    if (!isMemoryRole(parsed.role)) continue;

    const text = extractTextBlocks(parsed.message?.content);
    if (text === null) continue;

    stats.recordCount++;
    yield {
      id: `${ctx.sessionId}#${lineIndex}`,
      source: ctx.source,
      sessionId: ctx.sessionId,
      timestamp: ctx.fileTimestamp,
      role: parsed.role,
      text,
      metadata: { filePath },
    };
  }
}
