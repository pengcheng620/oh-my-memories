import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import {
  type ParseStats,
  extractTextBlocks,
  isMemoryRole,
  streamJsonl,
} from '@oh-my-memories/adapter-shared';

export type { ParseStats } from '@oh-my-memories/adapter-shared';

// Gemini CLI JSONL format (post-migration to JSONL):
//   {"type":"session_metadata","sessionId":"...","projectHash":"...","startTime":"..."}
//   {"type":"user","id":"...","content":[{"type":"text","text":"..."}],...}
//   {"type":"gemini","id":"...","content":[{"type":"text","text":"..."}],...}
//   {"type":"message_update","id":"...","tokens":{...}}
//
// We emit MemoryRecords for "user" and "gemini" turns only. "gemini" maps to
// role "assistant". "session_metadata" and "message_update" are skipped silently.

interface RawLine {
  type?: string;
  id?: string;
  sessionId?: string;
  startTime?: string;
  timestamp?: string;
  content?: unknown;
  message?: { role?: string; content?: unknown };
}

export async function* parseJsonl(
  filePath: string,
  stats: ParseStats,
  source: string,
): AsyncIterable<MemoryRecord> {
  let sessionId: string | undefined;

  for await (const line of streamJsonl(filePath)) {
    if (!line.ok) {
      stats.corruptLines++;
      continue;
    }
    const parsed = line.value as RawLine;

    if (parsed.type === 'session_metadata') {
      sessionId = parsed.sessionId;
      continue;
    }

    if (parsed.type !== 'user' && parsed.type !== 'gemini') continue;

    const role = parsed.type === 'gemini' ? 'assistant' : 'user';
    if (!isMemoryRole(role)) continue;

    // Gemini CLI uses either top-level `content` or `message.content`
    const content = parsed.content ?? parsed.message?.content;
    const text = extractTextBlocks(content);
    if (text === null) continue;

    if (typeof parsed.id !== 'string') continue;

    const ts = parsed.timestamp ?? parsed.startTime;

    stats.recordCount++;

    const record: MemoryRecord = {
      id: parsed.id,
      source,
      timestamp: typeof ts === 'string' ? new Date(ts) : new Date(),
      role,
      text,
      metadata: { filePath },
    };
    if (sessionId !== undefined) {
      record.sessionId = sessionId;
    }
    yield record;
  }
}
