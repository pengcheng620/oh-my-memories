import type {
  DetectResult,
  IIdeAdapter,
  MemoryRecord,
  ScanOptions,
} from '@oh-my-memories/adapter-sdk';

// Reads ~/.codex/sessions/*.jsonl

export class CodexAdapter implements IIdeAdapter {
  readonly id = 'codex';
  readonly category = 'ide' as const;
  readonly displayName = 'OpenAI Codex';

  storageRoot(): string {
    throw new Error('not implemented (M1 in progress)');
  }

  async detect(): Promise<DetectResult> {
    return { present: false, notes: 'not implemented (M1 in progress)' };
  }

  // biome-ignore lint/correctness/useYield: M1 stub — Lane C replaces this with a streaming JSONL parser
  async *scan(_opts?: ScanOptions): AsyncIterable<MemoryRecord> {
    throw new Error('not implemented (M1 in progress)');
  }
}
