import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ZodRawShape, ZodTypeAny, z } from 'zod';
import { recallTool } from './tools/recall';
import { scanTool } from './tools/scan';

// Construction is split from connection so tests can drive the server with an
// in-memory transport. `runStdioServer` is the production entrypoint used by
// `omem mcp serve`.

const SERVER_NAME = 'oh-my-memories';
const SERVER_VERSION = '0.1.0-alpha.1';

export interface ServerOptions {
  /** Project root passed to adapters that need it (Serena). Defaults to cwd. */
  readonly cwd?: string;
}

export function createServer(opts: ServerOptions = {}): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTool(server, recallTool, opts);
  registerTool(server, scanTool, opts);

  return server;
}

export async function runStdioServer(opts: ServerOptions = {}): Promise<void> {
  const server = createServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// The MCP SDK wants `inputSchema` / `outputSchema` as ZodRawShape (a plain
// object of zod field types), not a `ZodObject`. Our tool definitions use
// `z.object({...})` so we need to peel back the `.shape` for registration.
//
// We use a generic helper so the `execute` function keeps its narrow input
// type instead of being forced to `unknown` (which would lose type safety in
// the tool implementations themselves).
interface ToolDef<I extends ZodRawShape, O extends ZodRawShape, T> {
  readonly name: string;
  readonly config: {
    readonly title: string;
    readonly description: string;
    readonly inputSchema: z.ZodObject<I>;
    readonly outputSchema: z.ZodObject<O>;
    readonly annotations: Record<string, boolean>;
  };
  readonly execute: (input: T, deps: { cwd?: string }) => Promise<unknown>;
}

function registerTool<I extends ZodRawShape, O extends ZodRawShape, T>(
  server: McpServer,
  tool: ToolDef<I, O, T>,
  opts: ServerOptions,
): void {
  // The SDK's ToolCallback signature is (args, extra) => CallToolResult.
  // We don't need `extra` (no progress reporting / cancellation in M1.1).
  // The MCP SDK's generic on `registerTool` resolves to the per-call literal
  // shape type, which our wrapper can't carry statically. The runtime contract
  // (args is the parsed shape, return value has structuredContent+content) is
  // correct, so we erase types at the registration boundary.
  const handler = async (args: unknown): Promise<unknown> => {
    const result = await tool.execute(args as T, opts.cwd !== undefined ? { cwd: opts.cwd } : {});
    return {
      structuredContent: result as Record<string, unknown>,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  };
  // biome-ignore lint/suspicious/noExplicitAny: SDK generic is per-callsite literal shape; we erase here.
  (server.registerTool as any)(
    tool.name,
    {
      title: tool.config.title,
      description: tool.config.description,
      inputSchema: tool.config.inputSchema.shape,
      outputSchema: tool.config.outputSchema.shape,
      annotations: tool.config.annotations,
    },
    handler,
  );
}

export type { ZodTypeAny };
