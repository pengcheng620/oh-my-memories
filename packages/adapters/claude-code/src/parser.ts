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
//   - Skip every other `type` value (last-prompt, permission-mode, attachment,
//     file-history-snapshot, ...) silently — schema-drift forward-compat per
//     spec §3.1.
//   - Skip lines flagged `isMeta: true` (local-command-caveat etc. — internal
//     noise).
//   - On a malformed JSON line: increment stats.corruptLines (the shared
//     primitive surfaces this via { ok: false }).

export type { ParseStats } from '@oh-my-memories/adapter-shared';

interface RawLine {
  type?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
  isMeta?: boolean;
}

export async function* parseJsonl(
  filePath: string,
  stats: ParseStats,
  source: string,
): AsyncIterable<MemoryRecord> {
  for await (const line of streamJsonl(filePath)) {
    if (!line.ok) {
      stats.corruptLines++;
      continue;
    }
    const parsed = line.value as RawLine;

    if (parsed.type !== 'user' && parsed.type !== 'assistant') continue;
    if (parsed.isMeta) continue;

    const role = parsed.message?.role;
    if (!isMemoryRole(role)) continue;

    const text = extractTextBlocks(parsed.message?.content);
    if (text === null) continue;

    if (typeof parsed.uuid !== 'string' || typeof parsed.timestamp !== 'string') continue;

    stats.recordCount++;

    // exactOptionalPropertyTypes: only set sessionId when the source line had
    // one — never spread an `undefined` into the record.
    const record: MemoryRecord = {
      id: parsed.uuid,
      source,
      timestamp: new Date(parsed.timestamp),
      role,
      text,
      metadata: { filePath },
    };
    if (typeof parsed.sessionId === 'string') {
      record.sessionId = parsed.sessionId;
    }
    yield record;
  }
}
