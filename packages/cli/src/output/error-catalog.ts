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
  'OMEM-E22-MIGRATE-NO-WRITER': {
    code: 'OMEM-E22-MIGRATE-NO-WRITER',
    kind: 'error',
    summary: "The destination adapter passed to 'omem migrate --to' has no write support.",
    defaultHint:
      "Pick a writable destination ('claude-code', 'cursor', or 'codex'). 'gemini-cli', 'opencode', 'basic-memory', and 'serena' are read-only.",
  },
  'OMEM-E23-MIGRATE-FORMAT': {
    code: 'OMEM-E23-MIGRATE-FORMAT',
    kind: 'error',
    summary: 'Destination format validation refused the migration.',
    defaultHint: "Run 'omem migrate' without '--apply' to inspect the dry-run probe details.",
  },
  'OMEM-E24-MIGRATE-POLICY': {
    code: 'OMEM-E24-MIGRATE-POLICY',
    kind: 'error',
    summary: "The chosen '--on-conflict' policy is not supported by the destination adapter.",
    defaultHint:
      "Use '--on-conflict=skip-on-conflict' (the default) or pick a destination that supports it.",
  },
  'OMEM-E25-MIGRATE-NO-APPROVE': {
    code: 'OMEM-E25-MIGRATE-NO-APPROVE',
    kind: 'error',
    summary:
      "'omem migrate --apply' refused to write because the run is non-interactive and no explicit approval was given.",
    defaultHint:
      "Pass '--i-approve-dest-writes' (or set OMEM_I_APPROVE_DEST_WRITES=1) when scripting a non-interactive apply.",
  },
  'OMEM-E26-IMPORT-ARCHIVE': {
    code: 'OMEM-E26-IMPORT-ARCHIVE',
    kind: 'error',
    summary: "'omem import' could not read or extract the supplied archive.",
    defaultHint:
      "Verify the path exists and the file is a valid omem export (.tar.gz produced by 'omem export').",
  },
  'OMEM-E27-IMPORT-MANIFEST': {
    code: 'OMEM-E27-IMPORT-MANIFEST',
    kind: 'error',
    summary: "'omem import' archive is missing or has an invalid manifest.json.",
    defaultHint:
      "Make sure you're importing an archive produced by 'omem export' (current schema: manifestVersion 1, kind 'omem-export').",
  },
  'OMEM-E28-IMPORT-NO-APPROVE': {
    code: 'OMEM-E28-IMPORT-NO-APPROVE',
    kind: 'error',
    summary:
      "'omem import --apply' refused to write because the run is non-interactive and no explicit approval was given.",
    defaultHint:
      "Pass '--i-approve-dest-writes' (or set OMEM_I_APPROVE_DEST_WRITES=1) when scripting a non-interactive import.",
  },

  // ─── 3x: Canonical store / `omem remember` ──────────────────────────────
  'OMEM-E29-REMEMBER-EMPTY': {
    code: 'OMEM-E29-REMEMBER-EMPTY',
    kind: 'error',
    summary: "'omem remember' was called with empty or whitespace-only text.",
    defaultHint: "Pass a non-empty text body, e.g. omem remember 'always run tests before push'.",
  },
  'OMEM-E30-REMEMBER-METADATA': {
    code: 'OMEM-E30-REMEMBER-METADATA',
    kind: 'error',
    summary: "'omem remember --metadata' was not a valid JSON object.",
    defaultHint: 'Pass a single JSON object string, e.g. --metadata \'{"tag":"convention"}\'.',
  },
  'OMEM-E31-CANONICAL-STORE': {
    code: 'OMEM-E31-CANONICAL-STORE',
    kind: 'error',
    summary: 'A SQLite operation against the canonical store failed.',
    defaultHint: "Run 'omem doctor' to surface DB health (path, schema version, integrity).",
  },
  'OMEM-E32-CANONICAL-SCHEMA': {
    code: 'OMEM-E32-CANONICAL-SCHEMA',
    kind: 'error',
    summary: 'Canonical store migration sequence is broken or a step is missing.',
    defaultHint:
      'Re-install omem (the broken migration is shipping with this binary). If this happens after a self-build, ensure the migrations array is dense and ordered.',
  },
  'OMEM-E33-CANONICAL-DB-NEWER': {
    code: 'OMEM-E33-CANONICAL-DB-NEWER',
    kind: 'error',
    summary: 'Canonical store schema_version is newer than this omem build understands.',
    defaultHint: "Run 'omem upgrade --apply' so the binary catches up to the on-disk DB.",
  },
  'OMEM-E34-CANONICAL-RUNTIME': {
    code: 'OMEM-E34-CANONICAL-RUNTIME',
    kind: 'error',
    summary:
      'Canonical store features (omem remember / canonical recall) require the Bun runtime or a Bun-compiled binary.',
    defaultHint:
      'Install Bun (https://bun.sh) and re-run, or download a prebuilt omem binary from the GitHub releases page.',
  },

  // ─── Warnings (printed to stderr; exit code unchanged) ───────────────────
  'OMEM-W01-FLAG': {
    code: 'OMEM-W01-FLAG',
    kind: 'warning',
    summary: 'A flag was overridden by a more specific flag on the same command.',
    defaultHint: 'Drop the redundant flag to silence this warning.',
  },

  // ─── 4x: Plugin / adapter management (M4) ───────────────────────────────
  'OMEM-E40-NO-PACKAGE-MANAGER': {
    code: 'OMEM-E40-NO-PACKAGE-MANAGER',
    kind: 'error',
    summary: 'Neither bun nor npm could be found in PATH to install the adapter plugin.',
    defaultHint:
      'Install Bun (https://bun.sh) or Node.js/npm and ensure the binary is on your PATH, then retry.',
  },
  'OMEM-E41-PLUGIN-INSTALL-FAILED': {
    code: 'OMEM-E41-PLUGIN-INSTALL-FAILED',
    kind: 'error',
    summary: 'The package manager command to install the adapter plugin returned a non-zero exit.',
    defaultHint:
      'Check the output above for details, or run with --verbose. The package may not exist on npm or may have a bad package.json.',
  },
  'OMEM-E42-PLUGIN-LOAD-FAILED': {
    code: 'OMEM-E42-PLUGIN-LOAD-FAILED',
    kind: 'error',
    summary: 'An installed adapter plugin could not be loaded (bad export or import error).',
    defaultHint:
      "Run 'omem doctor' to see which plugin is broken, or 'omem adapter uninstall <id>' to remove it.",
  },
  'OMEM-E43-PLUGIN-NOT-FOUND': {
    code: 'OMEM-E43-PLUGIN-NOT-FOUND',
    kind: 'error',
    summary: 'No installed plugin with the given adapter ID was found.',
    defaultHint: "Run 'omem adapter list' to see installed adapters, then retry with a valid ID.",
  },
  'OMEM-E44-PLUGIN-UNINSTALL-FAILED': {
    code: 'OMEM-E44-PLUGIN-UNINSTALL-FAILED',
    kind: 'error',
    summary: 'Removing the installed adapter plugin directory failed.',
    defaultHint:
      'Check file permissions on ~/.omem/node_modules/, or manually delete the directory.',
  },

  'OMEM-E45-SEARCH-FAILED': {
    code: 'OMEM-E45-SEARCH-FAILED',
    kind: 'error',
    summary: 'Searching the npm registry for adapter packages failed.',
    defaultHint: 'Check your network connection and try again.',
  },

  'OMEM-W02-PLUGIN-ID-COLLISION': {
    code: 'OMEM-W02-PLUGIN-ID-COLLISION',
    kind: 'warning',
    summary: 'Two installed plugins advertise the same adapter ID; the first one wins.',
    defaultHint:
      "Run 'omem adapter list' to see which packages collide, then uninstall the duplicate.",
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
