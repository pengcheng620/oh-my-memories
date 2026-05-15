import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { MemoryRole } from '@oh-my-memories/adapter-sdk';

// Shared JSONL streaming primitives.
//
// Per spec §7.2, every Cat A adapter MUST consume `streamJsonl` so the
// corrupt-line-tolerance contract lives in exactly one place. Adapters add
// their own filter/map logic on top of the canonical line tagged-union.
//
// Why this lives in `packages/adapters/_shared` rather than
// `@oh-my-memories/adapter-sdk`:
//   - It's an internal helper for built-in adapters; external SDK consumers
//     are free to ignore it and parse however they like.
//   - It depends on Node's `fs`/`readline`, which we don't want to force on
//     hypothetical browser-side adapter implementations of the SDK.

export type JsonlLine = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Streams a JSONL file line by line.
 *
 * - Skips blank/whitespace-only lines silently (not corrupt — they're a
 *   common formatting accident in the wild).
 * - Honours both LF and CRLF line endings (`crlfDelay: Infinity`).
 * - Catches per-line `JSON.parse` errors and emits `{ ok: false, error }`
 *   instead of throwing — the iterator continues to the next line.
 * - Closes the underlying read stream and readline interface in a `finally`
 *   block so consumers can early-return without leaking file handles.
 *
 * Usage:
 * ```ts
 * for await (const line of streamJsonl(path)) {
 *   if (!line.ok) { stats.corruptLines++; continue; }
 *   // line.value is unknown — narrow it with a type guard before use.
 * }
 * ```
 */
export async function* streamJsonl(path: string): AsyncGenerator<JsonlLine> {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        yield { ok: true, value: JSON.parse(line) as unknown };
      } catch (err) {
        yield { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}

export interface ParseStats {
  recordCount: number;
  corruptLines: number;
}

/**
 * Returns a fresh, zeroed ParseStats counter. Use one per scan; never
 * accumulate across runs (per spec §7.2).
 */
export function createParseStats(): ParseStats {
  return { recordCount: 0, corruptLines: 0 };
}

/**
 * Type guard for the canonical MemoryRole union. Adapters use this to drop
 * unknown roles silently (e.g. codex's `developer`) — schema-drift
 * forward-compat per spec §3.1.
 */
export function isMemoryRole(value: unknown): value is MemoryRole {
  return value === 'user' || value === 'assistant' || value === 'system' || value === 'tool';
}
