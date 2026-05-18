import { randomBytes, randomUUID } from 'node:crypto';
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

// Claude Code write strategy (spec §5.1):
//   - Never mutate Anthropic's own .jsonl files. Spec §3.2 disables
//     `overwrite` for this target in M2.A.
//   - Create a single new import file per migrate invocation under
//     <storageRoot>/<importProject>/omem-import-<YYYYMMDD>-<id>.jsonl.
//   - Lines must be parseable by the M1 reader: type=user|assistant,
//     uuid v4 string, ISO timestamp, message.role + message.content array.

export const CC_IMPORT_PROJECT_DIR = '-omem-imports';

export interface ClaudeCodeWriterOptions {
  readonly storageRoot: string;
  /** Override the date used for the filename (tests). */
  readonly clock?: () => Date;
  /** Override the import id (tests). */
  readonly importId?: string;
  /**
   * Tests can supply a deterministic uuid factory to make golden snapshots
   * stable. Production code generates v4 UUIDs.
   */
  readonly uuidFactory?: () => string;
}

export class ClaudeCodeWriter implements IWritableAdapter {
  readonly writeCapability: AdapterFormatCapability = {
    writeSchemaId: 'claude-code/2026-05',
    emitterVersion: '0.1.0',
    // Per spec §3.2: overwrite is forbidden for CC targets in M2.A.
    supportedPolicies: [
      'skip-on-conflict',
      'newest-wins',
    ] as const satisfies readonly ConflictPolicy[],
  };

  readonly #storageRoot: string;
  readonly #clock: () => Date;
  readonly #importId: string;
  readonly #uuidFactory: () => string;

  constructor(opts: ClaudeCodeWriterOptions) {
    this.#storageRoot = opts.storageRoot;
    this.#clock = opts.clock ?? (() => new Date());
    this.#importId = opts.importId ?? randomBytes(4).toString('hex');
    this.#uuidFactory = opts.uuidFactory ?? randomUUID;
  }

  async probeWrite(_ctx: MigrateContext): Promise<WriteProbeResult> {
    if (!existsSync(this.#storageRoot)) {
      try {
        await mkdir(this.#storageRoot, { recursive: true });
      } catch (err) {
        return { canWrite: false, reason: `cannot create storage root: ${(err as Error).message}` };
      }
    }
    return { canWrite: true, diagnostics: { storageRoot: this.#storageRoot } };
  }

  async planWrites(batch: WriteBatch, _ctx: MigrateContext): Promise<PreparedWritePlan> {
    const target = this.#targetPath();
    const estimate = batch.instructions.reduce(
      (acc, inst) => acc + inst.record.text.length + 256,
      0,
    );
    return { targetPaths: [target], estimatedBytesByPath: { [target]: estimate } };
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
    const target = this.#targetPath();
    await mkdir(this.#projectDir(), { recursive: true });
    if (!existsSync(target)) {
      await writeFile(target, '', 'utf8');
    }

    const items: WriteBatchResultItem[] = [];
    for (const inst of batch.instructions) {
      try {
        const line = `${JSON.stringify(this.#serialize(inst))}\n`;
        await appendFile(target, line, 'utf8');
        items.push({ operationId: inst.operationId, status: 'written', destPath: target });
      } catch (_err) {
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

  #projectDir(): string {
    return join(this.#storageRoot, CC_IMPORT_PROJECT_DIR);
  }

  #targetPath(): string {
    const d = this.#clock();
    const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    return join(this.#projectDir(), `omem-import-${stamp}-${this.#importId}.jsonl`);
  }

  #serialize(inst: WriteInstruction): Record<string, unknown> {
    const role = inst.record.role === 'assistant' ? 'assistant' : 'user';
    return {
      type: role,
      uuid: this.#uuidFactory(),
      sessionId: inst.record.sessionId ?? `omem-import-${this.#importId}`,
      timestamp: inst.record.timestamp.toISOString(),
      message: {
        role,
        content: [{ type: 'text', text: inst.record.text }],
      },
    };
  }
}
