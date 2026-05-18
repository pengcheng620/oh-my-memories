import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';

/**
 * VS Code Copilot Chat JSONL operation log:
 *   kind=0: base snapshot (full session state)
 *   kind=1: set (patch a key-value)
 *   kind=2: push (append to an array)
 *   kind=3: delete (remove a key)
 *
 * After replaying all ops on top of the base, we get the full session.
 */

export interface ParseStats {
  totalFiles: number;
  totalRecords: number;
  corruptLines: number;
}

interface CopilotRequest {
  message?: { text?: string };
  response?: Array<{ value?: string }>;
  result?: { metadata?: { timeElapsed?: number } };
}

interface CopilotSession {
  sessionId?: string;
  creationDate?: string;
  customTitle?: string;
  requests?: CopilotRequest[];
}

/**
 * Reconstruct a Copilot session from a JSONL operation log.
 * Returns the merged session object.
 */
export function reconstructSession(lines: string[], stats: ParseStats): CopilotSession | null {
  let session: Record<string, unknown> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('\uFEFF')) {
      const cleaned = trimmed.replace(/^\uFEFF/, '').trim();
      if (cleaned === '') continue;
      try {
        const op = JSON.parse(cleaned) as Record<string, unknown>;
        applyOp(op, session, (s) => { session = s; });
      } catch {
        stats.corruptLines++;
      }
      continue;
    }
    try {
      const op = JSON.parse(trimmed) as Record<string, unknown>;
      applyOp(op, session, (s) => { session = s; });
    } catch {
      stats.corruptLines++;
    }
  }

  return session as CopilotSession | null;
}

function applyOp(
  op: Record<string, unknown>,
  session: Record<string, unknown> | null,
  setSession: (s: Record<string, unknown>) => void,
): void {
  const kind = op.kind as number | undefined;

  if (kind === 0) {
    setSession(op);
    return;
  }

  if (session === null) return;

  if (kind === 1) {
    const key = op.key as string | undefined;
    const value = op.value;
    if (key !== undefined) {
      session[key] = value;
    }
    return;
  }

  if (kind === 2) {
    const key = op.key as string | undefined;
    const value = op.value;
    if (key !== undefined) {
      const arr = session[key];
      if (Array.isArray(arr)) {
        arr.push(value);
      } else {
        session[key] = [value];
      }
    }
    return;
  }

  if (kind === 3) {
    const key = op.key as string | undefined;
    if (key !== undefined) {
      delete session[key];
    }
  }
}

/**
 * Extract MemoryRecords from a reconstructed Copilot session.
 */
export function extractRecords(
  session: CopilotSession,
  filePath: string,
  stats: ParseStats,
): MemoryRecord[] {
  const records: MemoryRecord[] = [];
  const requests = session.requests;
  if (!Array.isArray(requests)) return records;

  const sessionId = session.sessionId ?? filePath;
  const baseTs = session.creationDate ? new Date(session.creationDate) : new Date(0);

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i] as CopilotRequest | undefined;
    if (!req) continue;

    const userText = req.message?.text;
    if (userText && userText.trim() !== '') {
      records.push({
        id: `copilot-chat:${sessionId}:${i}:user`,
        source: 'copilot-chat',
        timestamp: new Date(baseTs.getTime() + i * 1000),
        role: 'user',
        text: userText,
        sessionId,
        metadata: session.customTitle ? { title: session.customTitle } : undefined,
      });
      stats.totalRecords++;
    }

    const responseParts = req.response;
    if (Array.isArray(responseParts)) {
      const assistantText = responseParts
        .map((p) => p?.value ?? '')
        .filter((v) => v.trim() !== '')
        .join('\n');

      if (assistantText.trim() !== '') {
        records.push({
          id: `copilot-chat:${sessionId}:${i}:assistant`,
          source: 'copilot-chat',
          timestamp: new Date(baseTs.getTime() + i * 1000 + 500),
          role: 'assistant',
          text: assistantText,
          sessionId,
          metadata: session.customTitle ? { title: session.customTitle } : undefined,
        });
        stats.totalRecords++;
      }
    }
  }

  return records;
}
