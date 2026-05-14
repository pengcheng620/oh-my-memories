import type {
  DetectResult,
  IIdeAdapter,
  MemoryRecord,
  ScanOptions,
} from '@oh-my-memories/adapter-sdk';

// Reads ~/.cursor/projects/<project-id>/agent-transcripts/*.jsonl

export class CursorAdapter implements IIdeAdapter {
  readonly id = 'cursor';
  readonly category = 'ide' as const;
  readonly displayName = 'Cursor';

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
