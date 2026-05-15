import { type OmemError, createOmemError } from '../output/error';

// Strict parser for the F2.3 / spec.md §6.2 `--since` argument.
//
// Accepted formats:
//   1. Relative — `<n><unit>` where unit ∈ s,m,h,d,w,M,y, n ∈ positive integer.
//      Cap at 4 digits (9999 of any unit) to keep range arithmetic safe.
//   2. Absolute — full ISO-8601 date / datetime, parsed by Date.
//
// Anything else (free-form English, mixed units, negative numbers, NaN, etc.)
// is rejected with OMEM-E20-DURATION. We deliberately do NOT lean on a heavy
// dep like `chrono-node` (devex-verdict §15: minimum-API surface).
//
// Return value: an absolute Date representing "now − duration" for relative,
// or the parsed datetime for absolute, expressed in UTC. Callers compare
// records' timestamps against this without further timezone juggling.

const RELATIVE_PATTERN = /^(\d{1,4})([smhdwMy])$/;

const UNIT_MILLIS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  // Calendar months/years are NOT fixed-length, but for `--since` we use
  // 30d for M and 365d for y. Spec.md §6.2 explicitly accepts this approximation
  // ("close enough for human time filters").
  M: 30 * 86_400_000,
  y: 365 * 86_400_000,
};

export interface ParseDurationOptions {
  /** Reference "now" in ms-since-epoch. Tests pin this to make assertions stable. */
  readonly now?: number;
}

export type ParseDurationResult =
  | { readonly ok: true; readonly date: Date }
  | { readonly ok: false; readonly error: OmemError };

/**
 * Parse a `--since` argument.
 *
 * Returns a structured result rather than throwing — callers control whether
 * the error becomes a process exit or a warning, and the OmemError flows
 * through the same Tier 2 rendering pipeline as every other failure.
 */
export function parseDuration(
  input: string,
  options: ParseDurationOptions = {},
): ParseDurationResult {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, error: makeError(input) };
  }

  // Try the relative form first; it's the common case.
  const relMatch = RELATIVE_PATTERN.exec(input);
  if (relMatch !== null) {
    const [, nStr, unit] = relMatch as unknown as [string, string, string];
    const n = Number.parseInt(nStr, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, error: makeError(input) };
    }
    const unitMs = UNIT_MILLIS[unit];
    if (unitMs === undefined) {
      return { ok: false, error: makeError(input) };
    }
    const now = options.now ?? Date.now();
    return { ok: true, date: new Date(now - n * unitMs) };
  }

  // Absolute ISO-8601: require strict round-trippability so we don't accept
  // e.g. "2026-13-99" (which Date silently coerces).
  if (!isLikelyIsoString(input)) {
    return { ok: false, error: makeError(input) };
  }
  const ts = Date.parse(input);
  if (!Number.isFinite(ts)) {
    return { ok: false, error: makeError(input) };
  }
  return { ok: true, date: new Date(ts) };
}

// ── helpers ──────────────────────────────────────────────────────────────
function makeError(input: string): OmemError {
  return createOmemError({
    code: 'OMEM-E20-DURATION',
    message: `'${String(input)}' is not a valid duration.`,
  });
}

// We accept ISO-8601 dates / datetimes only when the string starts with a
// 4-digit year; this rules out things like "1d ago" or "tomorrow" without
// pulling in a NLP library.
const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}(T|$)/;

function isLikelyIsoString(input: string): boolean {
  return ISO_PREFIX.test(input);
}
