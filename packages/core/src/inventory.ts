import type { AnyAdapter, DetectResult } from '@oh-my-memories/adapter-sdk';

export interface InventoryEntry {
  adapterId: string;
  category: 'ide' | 'mcp' | 'saas';
  displayName: string;
  detected: DetectResult;
}

export async function inventory(adapters: readonly AnyAdapter[]): Promise<InventoryEntry[]> {
  const results = await Promise.all(
    adapters.map(async (a) => ({
      adapterId: a.id,
      category: a.category,
      displayName: a.displayName,
      detected: await a.detect(),
    })),
  );
  return results;
}
