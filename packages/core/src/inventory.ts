import type { AnyAdapter, DetectResult, ScanResult } from '@oh-my-memories/adapter-sdk';

export interface InventoryEntry {
  adapterId: string;
  category: 'ide' | 'mcp' | 'saas';
  displayName: string;
  detected: DetectResult;
}

export interface ScanEntry extends InventoryEntry {
  scanResult: ScanResult | null;
  healthy: boolean;
  schemaVersion: string;
}

const SCHEMA_VERSIONS: Record<string, string> = {
  'claude-code': 'claude-code/2026-05',
  cursor: 'cursor/2026-05',
  codex: 'codex/2026-04',
  serena: 'serena/2026-05',
};

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

export function schemaVersionFor(adapterId: string): string {
  return SCHEMA_VERSIONS[adapterId] ?? 'unknown';
}
