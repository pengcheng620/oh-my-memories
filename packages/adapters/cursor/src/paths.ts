import { homedir } from 'node:os';
import { join } from 'node:path';

// Cursor stores agent transcripts under
//   <home>/.cursor/projects/<encoded-cwd>/agent-transcripts/<sessionId>/<sessionId>.jsonl
// on macOS, Linux, and Windows. We resolve via os.homedir() so that
// paths.test.ts holds on every platform — never hard-code "~" or HOME-string interpolation.
export function resolveDefaultStorageRoot(): string {
  return join(homedir(), '.cursor', 'projects');
}
