import { join } from 'node:path';
import type { HookDefinition } from './types';

export const claudeCodeHookDefinition: HookDefinition = {
  ide: 'claude-code',
  relativePath: join('.claude', 'hooks', 'session-start.md'),
  content: `<!-- omem-hooks:managed v1 -->

# oh-my-memories session-start recall

Run this command when starting or resuming work in this repository:

\`\`\`bash
omem recall --context "$(basename "$PWD")" --limit=5
\`\`\`

Use any returned lines as project memory context before making changes.
`,
};
