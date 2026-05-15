import { inventory, schemaVersionFor } from '@oh-my-memories/core';
import { z } from 'zod';
import { createAdapterById, createAllAdapters } from '../adapters';

// `omem_scan` MCP tool — list every detected memory source with health info.
//
// Output is a snapshot, not a search. Use this when an agent needs to decide
// which sources are available before calling `omem_recall`, or to surface a
// "you have N memory sources active" message.

export const scanInputSchema = z.object({
  source: z
    .enum(['claude-code', 'cursor', 'codex', 'serena'])
    .optional()
    .describe('Restrict to a single adapter. Omit to scan all detected sources.'),
});

export type ScanInput = z.infer<typeof scanInputSchema>;

export const scanOutputSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      category: z.enum(['ide', 'mcp', 'saas']),
      present: z.boolean(),
      storageRoot: z.string().optional(),
      schemaVersion: z.string(),
    }),
  ),
});

export type ScanOutput = z.infer<typeof scanOutputSchema>;

export interface ScanToolDeps {
  readonly listAdapters?: (opts?: { cwd?: string }) => ReturnType<typeof createAllAdapters>;
  readonly getAdapterById?: (
    id: string,
    opts?: { cwd?: string },
  ) => ReturnType<typeof createAdapterById>;
  readonly cwd?: string;
}

export async function executeScan(input: ScanInput, deps: ScanToolDeps = {}): Promise<ScanOutput> {
  const list = deps.listAdapters ?? createAllAdapters;
  const byId = deps.getAdapterById ?? createAdapterById;
  const cwd = deps.cwd ?? process.cwd();

  const adapters = input.source
    ? (() => {
        const a = byId(input.source, { cwd });
        return a ? [a] : [];
      })()
    : list({ cwd });

  if (adapters.length === 0) return { sources: [] };

  const entries = await inventory(adapters);

  return {
    sources: entries.map((entry) => ({
      id: entry.adapterId,
      displayName: entry.displayName,
      category: entry.category,
      present: entry.detected.present,
      ...(entry.detected.storageRoot !== undefined
        ? { storageRoot: entry.detected.storageRoot }
        : {}),
      schemaVersion: schemaVersionFor(entry.adapterId),
    })),
  };
}

export const scanTool = {
  name: 'omem_scan',
  config: {
    title: 'List detected memory sources',
    description:
      'Snapshot of which AI memory sources are present on this machine, with per-source category (ide / mcp / saas), display name, on-disk storage root, and schema version. Read-only and fast — use before omem_recall to decide which sources are worth searching, or to surface availability to the user.',
    inputSchema: scanInputSchema,
    outputSchema: scanOutputSchema,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  execute: executeScan,
} as const;
