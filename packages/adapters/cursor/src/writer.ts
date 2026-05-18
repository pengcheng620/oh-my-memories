import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AdapterFormatCapability,
  ConflictPolicy,
  IWritableAdapter,
  MigrateContext,
  PreparedWritePlan,
  WriteBatch,
  WriteBatchReceipt,
  WriteBatchResultItem,
  WriteInstruction,
  WriteProbeResult,
} from '@oh-my-memories/adapter-sdk';

// Cursor write strategy (spec §5.2):
//   - Never mutate existing Cursor session files.
//   - Each migrate invocation creates a single new import session under
//     <storageRoot>/<importProject>/agent-transcripts/<sessionId>/<sessionId>.jsonl.
//   - Lines match Cursor's read shape: { role, message: { content: [{type,text}] } }.
//
// We keep the import dir name stable (`omem-imports`) so repeat migrations
// land beside each other and `omem scan` finds them naturally.

export const CURSOR_IMPORT_PROJECT_DIR = 'omem-imports';

export interface CursorWriterOptions {
  /** Override the storage root (typically inherited from the adapter). */
  readonly storageRoot: string;
  /**
   * Override the generated session id (tests). Production code should leave
   * this unset so each invocation gets a fresh UUID.
   */
  readonly sessionId?: string;
}

export class CursorWriter implements IWritableAdapter {
  readonly writeCapability: AdapterFormatCapability = {
    writeSchemaId: 'cursor/2026-05',
    emitterVersion: '0.1.0',
    supportedPolicies: [
      'skip-on-conflict',
      'newest-wins',
    ] as const satisfies readonly ConflictPolicy[],
  };

  readonly #storageRoot: string;
  readonly #sessionId: string;

  constructor(opts: CursorWriterOptions) {
    this.#storageRoot = opts.storageRoot;
    this.#sessionId = opts.sessionId ?? randomUUID();
  }

  async probeWrite(_ctx: MigrateContext): Promise<WriteProbeResult> {
    if (!existsSync(this.#storageRoot)) {
      try {
        await mkdir(this.#storageRoot, { recursive: true });
      } catch (err) {
        return {
          canWrite: false,
          reason: `cannot create storage root: ${(err as Error).message}`,
        };
      }
    }
    return { canWrite: true, diagnostics: { storageRoot: this.#storageRoot } };
  }

  async planWrites(batch: WriteBatch, _ctx: MigrateContext): Promise<PreparedWritePlan> {
    const target = this.#sessionPath();
    const estimate = batch.instructions.reduce(
      (acc, inst) => acc + inst.record.text.length + 64,
      0,
    );
    return {
      targetPaths: [target],
      estimatedBytesByPath: { [target]: estimate },
    };
  }

  async writeBatch(batch: WriteBatch, ctx: MigrateContext): Promise<WriteBatchReceipt> {
    if (ctx.mode.kind === 'dry-run') {
      return {
        items: batch.instructions.map((inst) => ({
          operationId: inst.operationId,
          status: 'skipped' as const,
          reason: 'dry-run' as const,
        })),
      };
    }

    const target = this.#sessionPath();
    await mkdir(this.#sessionDir(), { recursive: true });
    if (!existsSync(target)) {
      await writeFile(target, '', 'utf8');
    }

    const items: WriteBatchResultItem[] = [];
    for (const inst of batch.instructions) {
      try {
        const line = `${JSON.stringify(this.#serialize(inst))}\n`;
        await appendFile(target, line, 'utf8');
        items.push({ operationId: inst.operationId, status: 'written', destPath: target });
      } catch {
        items.push({
          operationId: inst.operationId,
          status: 'failed',
          reason: 'io-error',
          destPath: target,
        });
      }
    }
    return { items };
  }

  #sessionDir(): string {
    return join(this.#storageRoot, CURSOR_IMPORT_PROJECT_DIR, 'agent-transcripts', this.#sessionId);
  }

  #sessionPath(): string {
    return join(this.#sessionDir(), `${this.#sessionId}.jsonl`);
  }

  #serialize(inst: WriteInstruction): Record<string, unknown> {
    return {
      role: inst.record.role ?? 'user',
      message: {
        content: [{ type: 'text', text: inst.record.text }],
      },
    };
  }
}
