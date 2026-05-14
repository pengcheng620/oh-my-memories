import type {
  DetectResult,
  IIdeAdapter,
  MemoryRecord,
  ScanOptions,
} from '@oh-my-memories/adapter-sdk';

// Reads ~/.claude/projects/<project>/<sessionId>.jsonl
// Each line is a JSON event from a Claude Code session.
// M1 implementation in progress — see specs/spec.md acceptance criteria.

export class ClaudeCodeAdapter implements IIdeAdapter {
  readonly id = 'claude-code';
  readonly category = 'ide' as const;
  readonly displayName = 'Claude Code';

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
