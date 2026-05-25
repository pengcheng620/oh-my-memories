import { join } from 'node:path';
import type { HookDefinition } from './types';

export const cursorHookDefinition: HookDefinition = {
  ide: 'cursor',
  relativePath: join('.cursor', 'rules', 'omem-recall.mdc'),
  content: `---
alwaysApply: true
---
<!-- omem-hooks:managed v1 -->

# oh-my-memories auto-recall

At the start of a new session or when resuming this repository, run:

\`\`\`bash
omem recall --context "$(basename "$PWD")" --limit=5
\`\`\`

Use any returned lines as project memory context before making changes.
`,
};
