import { homedir } from 'node:os';
import { join } from 'node:path';

// Codex CLI rollouts live at:
//   <homedir>/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<iso-ts>-<thread-uuid>.jsonl
// We return the top-level sessions root; the recursive walker in index.ts
// finds every .jsonl under it regardless of date partitioning, so future
// codex CLI versions that change the layout (e.g. by-session-id instead of
// by-date) keep working without an adapter change.
export function resolveDefaultStorageRoot(): string {
  return join(homedir(), '.codex', 'sessions');
}
