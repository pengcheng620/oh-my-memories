// Error catalog — every code the CLI can emit, in one place.
//
// Per devex-verdict D3 + F3.4: the CLI MUST NOT scatter string error literals
// across command code. Every `throw / emit error` site references one of the
// constants below by name. The lint rule (rules/no-string-error-literals)
// enforces this, and the contract test in `tests/contract/error-catalog.test.ts`
// asserts every code below is documented in `docs/CLI.md`.
//
// Code naming:
//   OMEM-E<NN>-<SHORT_NAME>   error
//   OMEM-W<NN>-<SHORT_NAME>   warning (printed to stderr, exit code unchanged)
//
// Numbering is dense and **append-only** — never renumber. M2+ may add E30+,
// W10+ etc. without disturbing M1 codes.

export interface ErrorCatalogEntry {
  /** The OMEM-E* / OMEM-W* code, used as an identity key in --json output. */
  readonly code: string;
  /** A short stable label suitable for grouping (e.g. error-catalog test). */
  readonly kind: 'error' | 'warning';
  /** One-sentence description of the failure class. */
  readonly summary: string;
  /** Default hint shown to humans when no caller-supplied hint is provided. */
  readonly defaultHint?: string;
}

/**
 * Catalog of every code the CLI emits in M1.
 *
 * **Append-only** — never reorder, never reuse a number. Add new entries to
 * the end of each block (errors then warnings).
 */
export const ERROR_CATALOG = {
  // ─── 0x: Argument / discovery ───────────────────────────────────────────
  'OMEM-E01-USAGE': {
    code: 'OMEM-E01-USAGE',
    kind: 'error',
    summary: 'Bad CLI arguments — usage error.',
    defaultHint: "Run with '--help' to see the correct invocation.",
  },
  'OMEM-E02-UNKNOWN-COMMAND': {
    code: 'OMEM-E02-UNKNOWN-COMMAND',
    kind: 'error',
    summary: 'The subcommand name is not recognised.',
    defaultHint: "Run 'omem --help' for the list of supported commands.",
  },
  'OMEM-E03-NO-SOURCES': {
    code: 'OMEM-E03-NO-SOURCES',
    kind: 'error',
    summary: 'No memory sources detected on disk.',
    defaultHint:
      "Run 'omem init' first, or check that at least one supported tool (Claude Code, Cursor, Codex, Serena) has stored memories under your home directory.",
  },

  // ─── 1x: I/O / filesystem ───────────────────────────────────────────────
  'OMEM-E04-PERM': {
    code: 'OMEM-E04-PERM',
    kind: 'error',
    summary: 'Permission denied while reading or writing a path.',
    defaultHint: "Re-run with the correct user, or check the parent directory's permissions.",
  },
  'OMEM-E11-IO': {
    code: 'OMEM-E11-IO',
    kind: 'error',
    summary: 'A filesystem operation failed (missing file, busy, etc.).',
    defaultHint: "Run 'omem doctor' to surface which adapter or path is unhealthy.",
  },
  'OMEM-E12-CONFIG-INVALID': {
    code: 'OMEM-E12-CONFIG-INVALID',
    kind: 'error',
    summary: '~/.omem/config.json is missing or not valid JSON.',
    defaultHint: "Re-run 'omem init', or open ~/.omem/config.json and fix the JSON manually.",
  },

  // ─── 2x: Input format / parsing ─────────────────────────────────────────
  'OMEM-E20-DURATION': {
    code: 'OMEM-E20-DURATION',
    kind: 'error',
    summary: 'A duration argument did not match the accepted formats.',
    defaultHint:
      "Use <n>{s,m,h,d,w,M,y} (e.g. '7d', '30m') or an ISO-8601 absolute date (e.g. '2026-01-01').",
  },
  'OMEM-E21-NON-INTERACTIVE': {
    code: 'OMEM-E21-NON-INTERACTIVE',
    kind: 'error',
    summary: 'A mandatory interactive prompt fired while non-interactive mode was active.',
    defaultHint:
      'Re-run interactively (drop --non-interactive / unset OMEM_NON_INTERACTIVE), or supply the missing answer via a flag.',
  },

  // ─── Warnings (printed to stderr; exit code unchanged) ───────────────────
  'OMEM-W01-FLAG': {
    code: 'OMEM-W01-FLAG',
    kind: 'warning',
    summary: 'A flag was overridden by a more specific flag on the same command.',
    defaultHint: 'Drop the redundant flag to silence this warning.',
  },
} as const satisfies Record<string, ErrorCatalogEntry>;

/** Union of every code in the catalog (compile-time safety). */
export type ErrorCode = keyof typeof ERROR_CATALOG;

/** Returns true iff the given string is a known catalog code. */
export function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_CATALOG, value);
}

/** Returns every catalog entry as an array (for tests / docs generation). */
export function listCatalog(): readonly ErrorCatalogEntry[] {
  return Object.values(ERROR_CATALOG);
}
