import { createHash } from 'node:crypto';
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';

// Cross-adapter dedup key for migration. We deliberately do NOT trust
// `record.id` as a deduplication key because adapters mint ids in their
// own namespaces (line index, UUID, hash). Two records that contain the
// same conversation turn from the same source session at the same UTC ms
// are considered the same memory.
//
// Spec: `specs/iwritable-adapter-mini-spec.md` §3.3.

const FIELD_SEP = '\u0000';

/**
 * Produces a stable lowercase hex SHA-256 over the normalized record body
 * + isoUTC timestamp + role + sessionId. Whitespace normalization is
 * intentionally minimal: trim trailing whitespace and unify CRLF → LF.
 * We do NOT collapse interior whitespace or strip casing — that would
 * over-merge legitimately distinct memories.
 */
export function createFingerprint(
  record: Pick<MemoryRecord, 'text' | 'timestamp' | 'role' | 'sessionId'>,
): string {
  const normalizedText = normalizeText(record.text);
  const isoTs = record.timestamp.toISOString();
  const role = record.role ?? '';
  const sessionId = record.sessionId ?? '';

  const hash = createHash('sha256');
  hash.update(normalizedText, 'utf8');
  hash.update(FIELD_SEP);
  hash.update(isoTs, 'utf8');
  hash.update(FIELD_SEP);
  hash.update(role, 'utf8');
  hash.update(FIELD_SEP);
  hash.update(sessionId, 'utf8');
  return hash.digest('hex');
}

/**
 * `<source>:<id>` — used for manifest bookkeeping only. NOT a substitute for
 * fingerprint when deciding logical equality (see spec §3.3).
 */
export function stableKey(record: Pick<MemoryRecord, 'source' | 'id'>): string {
  return `${record.source}:${record.id}`;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]+$/g, '');
}
