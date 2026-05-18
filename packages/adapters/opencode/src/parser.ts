import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { MemoryRecord, MemoryRole } from '@oh-my-memories/adapter-sdk';

export interface ParseStats {
  recordCount: number;
  corruptLines: number;
}

interface MessageFile {
  id?: string;
  sessionID?: string;
  role?: string;
  time?: { created?: string; completed?: string };
}

interface PartFile {
  id?: string;
  sessionID?: string;
  messageID?: string;
  type?: string;
  text?: string;
  synthetic?: boolean;
  ignored?: boolean;
}

function isMemoryRole(role: unknown): role is MemoryRole {
  return role === 'user' || role === 'assistant' || role === 'system' || role === 'tool';
}

export async function* parseStorage(
  storageRoot: string,
  stats: ParseStats,
  source: string,
): AsyncIterable<MemoryRecord> {
  const messageDir = join(storageRoot, 'message');
  const partDir = join(storageRoot, 'part');

  let sessionDirs: string[];
  try {
    sessionDirs = await readdir(messageDir);
  } catch {
    return;
  }

  for (const sessionId of sessionDirs) {
    const sessionMsgDir = join(messageDir, sessionId);
    let msgFiles: string[];
    try {
      msgFiles = (await readdir(sessionMsgDir)).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }

    for (const msgFileName of msgFiles) {
      try {
        const msgRaw = await readFile(join(sessionMsgDir, msgFileName), 'utf8');
        const msg = JSON.parse(msgRaw) as MessageFile;

        const role = msg.role;
        if (!isMemoryRole(role)) continue;

        const messageId = msg.id ?? msgFileName.replace('.json', '');

        const texts = await collectTextParts(partDir, messageId);
        if (!texts) {
          stats.corruptLines++;
          continue;
        }
        if (texts.length === 0) continue;

        const text = texts.join('\n\n');
        const ts = msg.time?.created ?? msg.time?.completed;

        stats.recordCount++;

        const record: MemoryRecord = {
          id: messageId,
          source,
          timestamp: ts ? new Date(ts) : new Date(),
          role,
          text,
        };
        if (sessionId) {
          record.sessionId = sessionId;
        }
        yield record;
      } catch {
        stats.corruptLines++;
      }
    }
  }
}

async function collectTextParts(partDir: string, messageId: string): Promise<string[] | null> {
  const msgPartDir = join(partDir, messageId);
  let partFiles: string[];
  try {
    partFiles = (await readdir(msgPartDir)).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }

  const texts: string[] = [];
  for (const pf of partFiles) {
    try {
      const raw = await readFile(join(msgPartDir, pf), 'utf8');
      const part = JSON.parse(raw) as PartFile;

      if (part.type !== 'text') continue;
      if (part.synthetic || part.ignored) continue;
      if (typeof part.text === 'string' && part.text.trim()) {
        texts.push(part.text);
      }
    } catch {
      // skip individual corrupt parts
    }
  }
  return texts;
}
