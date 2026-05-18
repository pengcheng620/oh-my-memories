import { randomBytes } from 'node:crypto';
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

// Codex write strategy (spec §5.3):
//   - Mirror the on-disk date partitioning sessions/<YYYY>/<MM>/<DD>/, but
//     emit our own filename `omem-import-<id>.jsonl` so we never splice into
//     a real `rollout-*.jsonl`.
//   - Lines must satisfy the M1 reader: `response_item` envelope with
//     `payload.type === 'message'` and a parseable ISO timestamp.

export interface CodexWriterOptions {
  readonly storageRoot: string;
  /** Override the date partitioning + import id. Tests only. */
  readonly clock?: () => Date;
  readonly importId?: string;
}

export class CodexWriter implements IWritableAdapter {
  readonly writeCapability: AdapterFormatCapability = {
    writeSchemaId: 'codex/2026-04',
    emitterVersion: '0.1.0',
    supportedPolicies: [
      'skip-on-conflict',
      'newest-wins',
    ] as const satisfies readonly ConflictPolicy[],
  };

  readonly #storageRoot: string;
  readonly #clock: () => Date;
  readonly #importId: string;

  constructor(opts: CodexWriterOptions) {
    this.#storageRoot = opts.storageRoot;
    this.#clock = opts.clock ?? (() => new Date());
    this.#importId = opts.importId ?? randomBytes(4).toString('hex');
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
      (acc, inst) => acc + inst.record.text.length + 96,
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
    await mkdir(this.#dateDir(), { recursive: true });
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

  #dateDir(): string {
    const d = this.#clock();
    const y = String(d.getUTCFullYear());
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return join(this.#storageRoot, y, m, day);
  }

  #targetPath(): string {
    return join(this.#dateDir(), `omem-import-${this.#importId}.jsonl`);
  }

  #serialize(inst: WriteInstruction): Record<string, unknown> {
    return {
      timestamp: inst.record.timestamp.toISOString(),
      type: 'response_item',
      payload: {
        type: 'message',
        role: inst.record.role ?? 'user',
        content: [
          {
            type: inst.record.role === 'assistant' ? 'output_text' : 'input_text',
            text: inst.record.text,
          },
        ],
      },
    };
  }
}
