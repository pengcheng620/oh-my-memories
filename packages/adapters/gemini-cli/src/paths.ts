import { homedir } from 'node:os';
import { join } from 'node:path';

// Gemini CLI stores sessions under <home>/.gemini/tmp/<project_hash>/chats/*.jsonl
// The global memory file is at <home>/.gemini/GEMINI.md
// We scan the tmp/ tree for JSONL chat files and also read GEMINI.md if present.
export function resolveDefaultStorageRoot(): string {
  return join(homedir(), '.gemini');
}
