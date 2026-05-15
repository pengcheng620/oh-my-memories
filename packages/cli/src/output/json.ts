import type { OmemError } from './error';

// JSON output channel.
//
// Per devex-verdict F2.4 + spec.md §6.5: every command supports `--json`,
// which makes stdout a single JSON document and stderr a stream of newline-
// delimited JSON warnings (NDJSON). Errors emitted to stderr in --json mode
// MUST also be NDJSON so agents can process them line-by-line.
//
// The renderer functions are pure: they write to whichever streams the
// caller supplies. The dispatcher passes process.stdout / process.stderr;
// tests pass an in-memory accumulator.

export interface JsonStreams {
  /** Stdout, used for the success body. Tests pass a buffer. */
  readonly stdout: Pick<NodeJS.WritableStream, 'write'>;
  /** Stderr, used for warnings + errors. */
  readonly stderr: Pick<NodeJS.WritableStream, 'write'>;
}

export interface RenderJsonOptions {
  /** When true, render with 2-space indentation; otherwise compact. */
  readonly pretty?: boolean;
  /** Optional `meta` block merged at the top level. */
  readonly meta?: Record<string, unknown>;
}

/** Writes a success body to stdout as a single JSON document + a trailing newline. */
export function writeJsonResult(
  streams: JsonStreams,
  body: unknown,
  options: RenderJsonOptions = {},
): void {
  const payload =
    options.meta !== undefined && body !== null && typeof body === 'object'
      ? { ...(body as Record<string, unknown>), meta: options.meta }
      : body;
  const text = options.pretty === true ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  streams.stdout.write(`${text}\n`);
}

/** Writes a single OmemError to stderr in NDJSON form. */
export function writeJsonError(streams: JsonStreams, error: OmemError): void {
  // We intentionally include `error: true` so consumers can scan with
  // `jq 'select(.error)'` regardless of which command emitted it.
  const payload = { error: true, ...error };
  streams.stderr.write(`${JSON.stringify(payload)}\n`);
}

/** Writes a warning (e.g. OMEM-W01-FLAG) to stderr in NDJSON form. */
export function writeJsonWarning(
  streams: JsonStreams,
  warning: { readonly code: string; readonly message: string; readonly hint?: string },
): void {
  streams.stderr.write(`${JSON.stringify({ warning: true, ...warning })}\n`);
}
