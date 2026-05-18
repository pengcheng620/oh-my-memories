// Embedding service: text → Float32Array vector.
//
// M7 ships only the `local` provider (Transformers.js WASM backend with
// all-MiniLM-L6-v2). The abstract interface allows adding OpenAI / Ollama
// providers later without changing callers.
//
// The model is loaded lazily on first embed() call. Subsequent calls reuse
// the cached pipeline. First call is slow (~2-5s model download + warm-up);
// subsequent calls are <200ms.

import type { EmbeddingConfig } from './config';

export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export class EmbeddingUnavailableError extends Error {
  readonly code = 'OMEM-E40-EMBEDDING-UNAVAILABLE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

// Lazy singleton — avoids loading the model until actually needed.
let cachedProvider: EmbeddingProvider | null = null;
let cachedProviderKey = '';

export async function getEmbeddingProvider(config: EmbeddingConfig): Promise<EmbeddingProvider> {
  const key = `${config.provider}:${config.model}`;
  if (cachedProvider !== null && cachedProviderKey === key) return cachedProvider;

  if (config.provider === 'local') {
    cachedProvider = await createLocalProvider(config.model);
    cachedProviderKey = key;
    return cachedProvider;
  }

  throw new EmbeddingUnavailableError(
    `Embedding provider '${config.provider}' is not implemented yet. Use 'local' (Transformers.js WASM).`,
  );
}

/** Reset the cached provider — useful for tests. */
export function resetEmbeddingProvider(): void {
  cachedProvider = null;
  cachedProviderKey = '';
}

// ---------- Local provider (Transformers.js) ----------

const MODEL_MAP: Record<string, string> = {
  'all-MiniLM-L6-v2': 'Xenova/all-MiniLM-L6-v2',
};

const DIMENSION_MAP: Record<string, number> = {
  'all-MiniLM-L6-v2': 384,
};

async function createLocalProvider(model: string): Promise<EmbeddingProvider> {
  const hfModel = MODEL_MAP[model] ?? model;
  const dimensions = DIMENSION_MAP[model] ?? 384;

  let pipeline: Awaited<ReturnType<typeof import('@huggingface/transformers').then>['pipeline']>;
  try {
    const { pipeline: createPipeline } = await import('@huggingface/transformers');
    // @ts-expect-error — Transformers.js pipeline() returns a typed pipeline;
    // feature-extraction signature varies across versions.
    pipeline = await createPipeline('feature-extraction', hfModel, {
      dtype: 'fp32',
    });
  } catch (err) {
    throw new EmbeddingUnavailableError(
      `Failed to load embedding model '${hfModel}': ${(err as Error).message}. Ensure @huggingface/transformers is installed and the model is accessible.`,
    );
  }

  return {
    dimensions,

    async embed(text: string): Promise<Float32Array> {
      const output = await pipeline(text, { pooling: 'mean', normalize: true });
      return new Float32Array(output.data as ArrayLike<number>);
    },

    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      const results: Float32Array[] = [];
      for (const text of texts) {
        const output = await pipeline(text, { pooling: 'mean', normalize: true });
        results.push(new Float32Array(output.data as ArrayLike<number>));
      }
      return results;
    },
  };
}

// ---------- Vector math utilities ----------

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] as number;
    const bi = b[i] as number;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
