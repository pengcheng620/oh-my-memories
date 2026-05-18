import { CanonicalStore, getEmbeddingProvider, resetEmbeddingProvider } from '@oh-my-memories/core';
import { loadConfig } from '@oh-my-memories/core/src/config';
import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import { canonicalDbPath, configPath } from '../platform/paths';
import type { CommandContext, CommandHandler } from './types';

const BATCH_SIZE = 32;

export const embed: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const backfill = ctx.argv.includes('--backfill');
  if (!backfill) {
    const err = createOmemError({
      code: 'OMEM-E01-USAGE',
      message: "'omem embed' requires '--backfill'. Usage: omem embed --backfill",
    });
    if (ctx.flags.json) writeJsonError(ctx, err);
    else writeTextError(ctx, err);
    return 2;
  }

  const cfg = loadConfig(configPath({ env: ctx.env }));
  if (!cfg.embedding.enabled) {
    const err = createOmemError({
      code: 'OMEM-E01-USAGE',
      message: "Embedding is disabled. Run 'omem config set embedding.enabled true' to enable it.",
    });
    if (ctx.flags.json) writeJsonError(ctx, err);
    else writeTextError(ctx, err);
    return 1;
  }

  const dbPath = canonicalDbPath({ env: ctx.env });
  let store: CanonicalStore;
  try {
    store = CanonicalStore.open({ path: dbPath });
  } catch (err) {
    const e = createOmemError({
      code: 'OMEM-E31-CANONICAL-STORE',
      message: `Cannot open canonical store: ${(err as Error).message}`,
      cause: err,
    });
    if (ctx.flags.json) writeJsonError(ctx, e);
    else writeTextError(ctx, e);
    return 1;
  }

  try {
    const provider = await getEmbeddingProvider(cfg.embedding);
    let embedded = 0;

    while (true) {
      const ids = store.unembeddedRecordIds(cfg.embedding.model, BATCH_SIZE);
      if (ids.length === 0) break;

      const texts = store.getTexts(ids);
      for (const { id, text } of texts) {
        const vec = await provider.embed(text);
        store.storeEmbedding(id, cfg.embedding.model, vec);
        embedded++;
      }

      if (!ctx.flags.json) {
        ctx.stdout.write(`\rEmbedded ${embedded} records...`);
      }
    }

    if (!ctx.flags.json && embedded > 0) {
      ctx.stdout.write('\n');
    }

    const totalEmbeddings = store.countEmbeddings(cfg.embedding.model);

    if (ctx.flags.json) {
      writeJsonResult(ctx, {
        backfilled: embedded,
        totalEmbeddings,
        model: cfg.embedding.model,
      });
    } else {
      if (embedded === 0) {
        ctx.stdout.write(`All records already embedded (${totalEmbeddings} total).\n`);
      } else {
        ctx.stdout.write(`Backfilled ${embedded} records. Total embeddings: ${totalEmbeddings}.\n`);
      }
    }

    return 0;
  } catch (err) {
    const e = createOmemError({
      code: 'OMEM-E40-EMBEDDING-UNAVAILABLE',
      message: `Embedding failed: ${(err as Error).message}`,
      cause: err,
    });
    if (ctx.flags.json) writeJsonError(ctx, e);
    else writeTextError(ctx, e);
    return 1;
  } finally {
    store.close();
    resetEmbeddingProvider();
  }
};
