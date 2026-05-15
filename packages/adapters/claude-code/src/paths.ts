import { homedir } from 'node:os';
import { join } from 'node:path';

// Claude Code stores sessions under <home>/.claude/projects/<project-slug>/<session>.jsonl
// on every supported OS (macOS, Linux, Windows). We resolve via os.homedir() so that
// paths.test.ts holds on every platform — never hard-code "~" or HOME-string interpolation.
export function resolveDefaultStorageRoot(): string {
  return join(homedir(), '.claude', 'projects');
}
