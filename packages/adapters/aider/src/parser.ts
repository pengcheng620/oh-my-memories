import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';

export interface ParseStats {
  recordCount: number;
  corruptLines: number;
}

// Aider chat history format:
//   # aider chat started at YYYY-MM-DD HH:MM:SS
//   #### <user message or /command>
//   > <tool output>
//   <assistant response (no prefix)>
//
// We emit one MemoryRecord per user turn (#### line + following assistant text).

const SESSION_RE = /^# aider chat started at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;
const USER_TURN_RE = /^#### (.+)/;
const TOOL_OUTPUT_RE = /^> /;

interface RawTurn {
  userText: string;
  assistantText: string;
  timestamp: Date;
  sessionTimestamp: string;
}

export function parseChatHistory(
  filePath: string,
  content: string,
  source: string,
  stats: ParseStats,
): MemoryRecord[] {
  const lines = content.split('\n');
  const records: MemoryRecord[] = [];
  let sessionTs = '';
  let currentTurn: RawTurn | null = null;
  let collectingAssistant = false;
  const assistantLines: string[] = [];

  function flushTurn() {
    if (!currentTurn) return;
    const aText = assistantLines.join('\n').trim();
    if (aText) {
      currentTurn.assistantText = aText;
    }

    const text = currentTurn.assistantText
      ? `User: ${currentTurn.userText}\n\nAssistant: ${currentTurn.assistantText}`
      : `User: ${currentTurn.userText}`;

    if (currentTurn.userText.startsWith('/') && !currentTurn.assistantText) {
      currentTurn = null;
      assistantLines.length = 0;
      collectingAssistant = false;
      return;
    }

    stats.recordCount++;
    records.push({
      id: `${filePath}:${sessionTs}:${stats.recordCount}`,
      source,
      timestamp: currentTurn.timestamp,
      role: 'user',
      text,
      sessionId: sessionTs,
      metadata: { path: filePath },
    });

    currentTurn = null;
    assistantLines.length = 0;
    collectingAssistant = false;
  }

  for (const line of lines) {
    const sessionMatch = SESSION_RE.exec(line);
    if (sessionMatch) {
      flushTurn();
      sessionTs = sessionMatch[1]!;
      continue;
    }

    const userMatch = USER_TURN_RE.exec(line);
    if (userMatch) {
      flushTurn();
      const userText = userMatch[1]!.trim();
      currentTurn = {
        userText,
        assistantText: '',
        timestamp: sessionTs ? new Date(sessionTs.replace(' ', 'T') + 'Z') : new Date(),
        sessionTimestamp: sessionTs,
      };
      collectingAssistant = true;
      continue;
    }

    if (TOOL_OUTPUT_RE.test(line)) {
      continue;
    }

    if (collectingAssistant && currentTurn) {
      assistantLines.push(line);
    }
  }

  flushTurn();
  return records;
}
