import { colorEnabled } from '../platform/interactive';
import type { OmemError } from './error';

// Human / text output channel.
//
// Per devex-verdict §10.3 + the "no slop" guideline:
//   • Tables use ASCII columns with two-space separators (no Unicode borders).
//   • Errors use a `omem: <code>: <message>` format on a single line.
//   • Hints are dimmed when colour is enabled, plain otherwise.
//
// Colour comes from a tiny in-house dimmer rather than a chalk dep; we only
// need ANSI dim + reset to satisfy the verdict's "minimal-dep" guideline.

const ANSI_DIM = '\x1b[2m';
const ANSI_RESET = '\x1b[0m';

export interface TextStreams {
  readonly stdout: Pick<NodeJS.WritableStream, 'write'>;
  readonly stderr: Pick<NodeJS.WritableStream, 'write'>;
  readonly env?: NodeJS.ProcessEnv;
}

/** Width used for column padding in tables. */
function pad(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + ' '.repeat(width - value.length);
}

export interface TableColumn<T> {
  readonly header: string;
  readonly accessor: (row: T) => string;
}

/**
 * Render a list of rows as an ASCII table. Returns the raw text rather than
 * writing directly so the caller can mix table + headline output.
 *
 * Why not a markdown table: agents already get JSON via --json, and humans
 * want fast scanning, not pipe-perfect alignment. ASCII columns with two
 * spaces between fields is the lowest-noise option that survives copy/paste.
 */
export function renderTable<T>(rows: readonly T[], columns: readonly TableColumn<T>[]): string {
  if (rows.length === 0) return '';
  const widths = columns.map((col) =>
    Math.max(col.header.length, ...rows.map((r) => col.accessor(r).length)),
  );
  const header = columns.map((c, i) => pad(c.header, widths[i] ?? 0)).join('  ');
  const lines = rows.map((r) =>
    columns.map((c, i) => pad(c.accessor(r), widths[i] ?? 0)).join('  '),
  );
  return [header, ...lines].join('\n');
}

/** Writes an OmemError to stderr in human-friendly form. */
export function writeTextError(streams: TextStreams, error: OmemError): void {
  const useColor = colorEnabled(streams.env ?? process.env);
  streams.stderr.write(`omem: ${error.code}: ${error.message}\n`);
  if (error.hint !== undefined) {
    if (useColor) {
      streams.stderr.write(`${ANSI_DIM}hint: ${error.hint}${ANSI_RESET}\n`);
    } else {
      streams.stderr.write(`hint: ${error.hint}\n`);
    }
  }
}

/** Writes a warning (OMEM-W*) to stderr in human-friendly form. */
export function writeTextWarning(
  streams: TextStreams,
  warning: { readonly code: string; readonly message: string; readonly hint?: string },
): void {
  const useColor = colorEnabled(streams.env ?? process.env);
  if (useColor) {
    streams.stderr.write(`${ANSI_DIM}omem: ${warning.code}: ${warning.message}${ANSI_RESET}\n`);
  } else {
    streams.stderr.write(`omem: ${warning.code}: ${warning.message}\n`);
  }
  if (warning.hint !== undefined) {
    streams.stderr.write(`hint: ${warning.hint}\n`);
  }
}
