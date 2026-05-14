import type {
  DetectResult,
  IMcpAdapter,
  MemoryRecord,
  ScanOptions,
} from '@oh-my-memories/adapter-sdk';

// Reads project-local .serena/memories/*.md (Serena MCP convention)

export class SerenaAdapter implements IMcpAdapter {
  readonly id = 'serena';
  readonly category = 'mcp' as const;
  readonly displayName = 'Serena MCP';

  constructor(private readonly projectRoot: string) {}

  storageRoot(): string {
    throw new Error('not implemented (M1 in progress)');
  }

  async detect(): Promise<DetectResult> {
    return { present: false, notes: 'not implemented (M1 in progress)' };
  }

  async *scan(_opts?: ScanOptions): AsyncIterable<MemoryRecord> {
    throw new Error('not implemented (M1 in progress)');
  }
}
