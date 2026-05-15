// Public surface for `@oh-my-memories/mcp`.
//
// Two consumer paths:
//   1. CLI side (`omem mcp serve` / `omem mcp install --ide=<ide>`): imports
//      `runStdioServer` and the `installer` helpers.
//   2. Tests / embedders that want to call the tools directly without the
//      stdio transport: import `createServer` and `installer` themselves.

export { createServer, runStdioServer } from './server';
export type { ServerOptions } from './server';

export {
  detectIde,
  expandHome,
  installForIde,
  type InstallTarget,
  type InstallResult,
  type SupportedIde,
  SUPPORTED_IDES,
  uninstallForIde,
  serverEntryFor,
} from './installer';

export { recallTool } from './tools/recall';
export { scanTool } from './tools/scan';
