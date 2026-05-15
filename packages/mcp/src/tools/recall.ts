import { recall as federatedRecall } from '@oh-my-memories/core';
import { z } from 'zod';
import { createAdapterById, createAllAdapters } from '../adapters';

// `omem_recall` MCP tool — federated search across all detected adapters.
//
// Naming (design doc Open Question #3): we picked `omem_recall` over the
// generic `recall_across_sources` for namespace clarity. Every omem-specific
// tool starts with `omem_` so the user sees "this came from omem" in the IDE
// tool palette.
//
// Output contract: returns a `structuredContent` payload that mirrors the
// `RecallResult` from `@oh-my-memories/core` plus a flat `text` summary
// for IDEs that only render the unstructured `content` array.

export const recallInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search query string. Free text, BM25-ish matching across record bodies.'),
  source: z
    .enum(['claude-code', 'cursor', 'codex', 'serena'])
    .optional()
    .describe('Restrict the search to a single adapter. Omit to search all detected sources.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe('Maximum number of hits to return. Defaults to 50.'),
  sinceIso: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('Only consider records newer than this ISO-8601 timestamp.'),
});

export type RecallInput = z.infer<typeof recallInputSchema>;

export const recallOutputSchema = z.object({
  query: z.string(),
  hits: z.array(
    z.object({
      source: z.string(),
      id: z.string(),
      score: z.number(),
      timestamp: z.string(),
      matchedTerms: z.array(z.string()),
      text: z.string(),
      sessionId: z.string().optional(),
    }),
  ),
  failures: z.array(
    z.object({
      adapterId: z.string(),
      error: z.string(),
    }),
  ),
  partial: z.boolean(),
});

export type RecallOutput = z.infer<typeof recallOutputSchema>;

export interface RecallToolDeps {
  /** Override adapter discovery in tests. Defaults to all M1 adapters. */
  readonly listAdapters?: (opts?: { cwd?: string }) => ReturnType<typeof createAllAdapters>;
  readonly getAdapterById?: (
    id: string,
    opts?: { cwd?: string },
  ) => ReturnType<typeof createAdapterById>;
  readonly cwd?: string;
}

export async function executeRecall(
  input: RecallInput,
  deps: RecallToolDeps = {},
): Promise<RecallOutput> {
  const list = deps.listAdapters ?? createAllAdapters;
  const byId = deps.getAdapterById ?? createAdapterById;
  const cwd = deps.cwd ?? process.cwd();

  const adapters = input.source
    ? (() => {
        const a = byId(input.source, { cwd });
        return a ? [a] : [];
      })()
    : list({ cwd });

  if (adapters.length === 0) {
    return {
      query: input.query,
      hits: [],
      failures: [],
      partial: false,
    };
  }

  const recallOpts = {
    query: input.query,
    ...(input.source !== undefined ? { sources: [input.source] } : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.sinceIso !== undefined ? { since: new Date(input.sinceIso) } : {}),
  };

  const result = await federatedRecall(adapters, recallOpts);

  return {
    query: input.query,
    hits: result.hits.map((h) => ({
      source: h.record.source,
      id: h.record.id,
      score: Math.round(h.score * 1000) / 1000,
      timestamp: h.record.timestamp.toISOString(),
      matchedTerms: h.matchedTerms,
      text: h.record.text,
      ...(h.record.sessionId !== undefined ? { sessionId: h.record.sessionId } : {}),
    })),
    failures: result.failures,
    partial: result.partial,
  };
}

export const recallTool = {
  name: 'omem_recall',
  config: {
    title: 'Federated memory recall',
    description:
      "Search every detected memory source on this machine (Claude Code, Cursor, Codex, Serena) for entries matching the query. Returns ranked hits with source, score, timestamp, matched terms, and a text snippet. Use this when the user asks 'do you remember', 'what did we say about', 'find conversation about', or any free-text recall question.",
    inputSchema: recallInputSchema,
    outputSchema: recallOutputSchema,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  execute: executeRecall,
} as const;
