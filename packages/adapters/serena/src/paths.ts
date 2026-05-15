import { join } from 'node:path';

// Serena MCP stores memories at <projectRoot>/.serena/memories/*.md.
// Unlike Cat A adapters (claude-code, cursor, codex), Serena is per-project,
// so callers MUST pass an absolute projectRoot — we deliberately do not
// expand `~` here, to keep tilde-handling bugs in callers visible.
export function resolveStorageRoot(projectRoot: string): string {
  return join(projectRoot, '.serena', 'memories');
}
