import { basename } from 'node:path';

// Hard-coded safety denylist (spec.md §7.1, eng-verdict A7).
//
// Every adapter MUST consult `isDenylisted` before opening a file. M1 keeps
// the list non-user-configurable to prevent unsafe overrides; M2+ may revisit
// if real demand surfaces.
//
// The patterns in spec.md §7.1:
//   *.pem  ·  .env*  ·  auth.json  ·  *credentials*  ·  *secret*  ·  *.key  ·  token.json
//
// We translate each pattern to a small predicate so we can keep the
// implementation glob-free (avoiding a glob dep, per devex-verdict §15).

interface DenyPattern {
  /** Stable identifier surfaced in --json output (lane-E2 will consume this). */
  readonly id: string;
  readonly matches: (lowerName: string) => boolean;
}

const PATTERNS: readonly DenyPattern[] = [
  { id: 'pem', matches: (n) => n.endsWith('.pem') },
  // Match `.env` exactly AND `.env.local`, `.env.development`, etc.
  { id: 'env', matches: (n) => n === '.env' || n.startsWith('.env.') },
  { id: 'auth-json', matches: (n) => n === 'auth.json' },
  { id: 'credentials', matches: (n) => n.includes('credentials') },
  { id: 'secret', matches: (n) => n.includes('secret') },
  { id: 'key', matches: (n) => n.endsWith('.key') },
  { id: 'token-json', matches: (n) => n === 'token.json' },
];

/**
 * True iff the given file path (absolute or relative) matches any deny
 * pattern. Match is performed on the basename only — directories are not
 * walked or scored, so e.g. `secret/foo.txt` is NOT denylisted unless its
 * basename matches.
 */
export function isDenylisted(path: string): boolean {
  const name = basename(path).toLowerCase();
  return PATTERNS.some((p) => p.matches(name));
}

/**
 * Returns the denylist pattern id matched by `path`, or undefined.
 * Used by adapters to surface a per-file reason in `omem scan --json`.
 */
export function denylistReason(path: string): string | undefined {
  const name = basename(path).toLowerCase();
  for (const p of PATTERNS) {
    if (p.matches(name)) return p.id;
  }
  return undefined;
}

/** All denylist pattern ids — used by tests / docs generation. */
export function denylistPatternIds(): readonly string[] {
  return PATTERNS.map((p) => p.id);
}
