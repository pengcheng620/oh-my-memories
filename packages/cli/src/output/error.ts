import { ERROR_CATALOG, type ErrorCode } from './error-catalog';

// The Tier 2 error contract from devex-verdict D3 + F3.1.
//
// Every CLI failure produces an OmemError. The text path renders one
// `code: message` line plus an optional hint sentence; the --json path
// emits the OmemError verbatim so agents have a stable contract.
//
// `cause` is included only when --verbose is on (rendered) but always
// retained on the in-memory object so structured logging can pick it up.

export interface OmemError {
  /** A code from the catalog (e.g. "OMEM-E04-PERM"). */
  readonly code: ErrorCode;
  /** Human-readable, single line. */
  readonly message: string;
  /** Optional one-sentence suggestion. Falls back to the catalog default. */
  readonly hint?: string;
  /** Optional URL pointing at extended docs (M1 may leave empty). */
  readonly helpUrl?: string;
  /** The original error / context object — surfaced under --verbose. */
  readonly cause?: unknown;
}

export interface OmemErrorInit {
  readonly code: ErrorCode;
  readonly message?: string;
  readonly hint?: string;
  readonly helpUrl?: string;
  readonly cause?: unknown;
}

/**
 * Construct an OmemError. Call sites pass the code + optional overrides; the
 * default `message` and `hint` come from the catalog so that boilerplate text
 * lives in exactly one place (per F3.4 + the lint rule).
 *
 * Why a factory rather than a class: `--json` emits this verbatim, and the
 * default toJSON of an Error class would lose properties. A POJO is the
 * simplest stable wire format.
 */
export function createOmemError(init: OmemErrorInit): OmemError {
  const entry = ERROR_CATALOG[init.code];
  const result: OmemError = {
    code: init.code,
    message: init.message ?? entry.summary,
  };
  // exactOptionalPropertyTypes: only attach optional fields when defined.
  const hint = init.hint ?? entry.defaultHint;
  if (hint !== undefined) (result as { hint?: string }).hint = hint;
  if (init.helpUrl !== undefined) (result as { helpUrl?: string }).helpUrl = init.helpUrl;
  if (init.cause !== undefined) (result as { cause?: unknown }).cause = init.cause;
  return result;
}

/** True if `value` looks like an OmemError POJO. */
export function isOmemError(value: unknown): value is OmemError {
  if (!value || typeof value !== 'object') return false;
  const v = value as { code?: unknown; message?: unknown };
  return typeof v.code === 'string' && typeof v.message === 'string';
}
