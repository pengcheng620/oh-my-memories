import type { MemoryRole } from '@oh-my-memories/adapter-sdk';
import { CanonicalRuntimeError, CanonicalSchemaError, CanonicalStore } from '@oh-my-memories/core';
import { type OmemError, createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import { canonicalDbPath } from '../platform/paths';
import type { CommandContext, CommandHandler } from './types';

// `omem remember <text>` (M3): write a record into the L2 canonical store.
//
// Spec: specs/m3-canonical-store-mini-spec.md §6. The store auto-creates on
// first use under ${OMEM_HOME:-~/.omem}/canonical.db.

const VALID_ROLES: ReadonlySet<string> = new Set(['user', 'assistant', 'system', 'tool']);

export const remember: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const args = parseRememberArgs(ctx.argv);
  if (!args.ok) return reject(ctx, args.error);

  const dbPath = canonicalDbPath({ env: ctx.env });

  let store: CanonicalStore;
  try {
    store = CanonicalStore.open({ path: dbPath });
  } catch (err) {
    return reject(ctx, openErrorToOmemError(err));
  }

  try {
    const result = store.remember({
      text: args.value.text,
      ...(args.value.source !== undefined ? { source: args.value.source } : {}),
      ...(args.value.sessionId !== undefined ? { sessionId: args.value.sessionId } : {}),
      ...(args.value.role !== undefined ? { role: args.value.role } : {}),
      ...(args.value.metadata !== undefined ? { metadata: args.value.metadata } : {}),
      ...(args.value.timestamp !== undefined ? { timestamp: args.value.timestamp } : {}),
    });

    if (ctx.flags.json) {
      writeJsonResult(ctx, { ...result, dbPath });
    } else {
      const status = result.created ? 'created' : 'already known';
      ctx.stdout.write(`remembered ${result.id} (${status})\n`);
    }
    return 0;
  } catch (err) {
    return reject(
      ctx,
      createOmemError({
        code: 'OMEM-E31-CANONICAL-STORE',
        message: `remember() failed: ${(err as Error).message}`,
        cause: err,
      }),
    );
  } finally {
    store.close();
  }
};

interface RememberArgs {
  readonly text: string;
  readonly source?: string;
  readonly sessionId?: string;
  readonly role?: MemoryRole;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: Date;
}

function parseRememberArgs(
  argv: readonly string[],
): { ok: true; value: RememberArgs } | { ok: false; error: OmemError } {
  let text: string | undefined;
  let source: string | undefined;
  let sessionId: string | undefined;
  let role: MemoryRole | undefined;
  let metadata: Record<string, unknown> | undefined;
  let timestamp: Date | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === '--source' || token.startsWith('--source=')) {
      const v = consumeValue(token, argv, i, '--source=');
      if (!v.ok) return v;
      source = v.value;
      i = v.advance;
      continue;
    }
    if (token === '--session' || token.startsWith('--session=')) {
      const v = consumeValue(token, argv, i, '--session=');
      if (!v.ok) return v;
      sessionId = v.value;
      i = v.advance;
      continue;
    }
    if (token === '--role' || token.startsWith('--role=')) {
      const v = consumeValue(token, argv, i, '--role=');
      if (!v.ok) return v;
      if (!VALID_ROLES.has(v.value)) {
        return usage(`'--role' must be one of ${Array.from(VALID_ROLES).join(', ')}.`);
      }
      role = v.value as MemoryRole;
      i = v.advance;
      continue;
    }
    if (token === '--metadata' || token.startsWith('--metadata=')) {
      const v = consumeValue(token, argv, i, '--metadata=');
      if (!v.ok) return v;
      try {
        const parsed: unknown = JSON.parse(v.value);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return {
            ok: false,
            error: createOmemError({
              code: 'OMEM-E30-REMEMBER-METADATA',
              message: "'--metadata' must be a JSON object (not a string, array, or scalar).",
            }),
          };
        }
        metadata = parsed as Record<string, unknown>;
      } catch (err) {
        return {
          ok: false,
          error: createOmemError({
            code: 'OMEM-E30-REMEMBER-METADATA',
            message: `'--metadata' is not valid JSON: ${(err as Error).message}`,
          }),
        };
      }
      i = v.advance;
      continue;
    }
    if (token === '--timestamp' || token.startsWith('--timestamp=')) {
      const v = consumeValue(token, argv, i, '--timestamp=');
      if (!v.ok) return v;
      const parsed = new Date(v.value);
      if (Number.isNaN(parsed.getTime())) {
        return usage(`'--timestamp' is not a parseable date: '${v.value}'.`);
      }
      timestamp = parsed;
      i = v.advance;
      continue;
    }
    if (token.startsWith('--')) {
      return usage(`Unrecognised flag: '${token}'.`);
    }
    if (text !== undefined) {
      return usage("'omem remember' accepts exactly one positional <text>.");
    }
    text = token;
  }

  if (text === undefined) {
    return usage("'omem remember' requires a positional <text> argument.");
  }
  if (text.trim().length === 0) {
    return {
      ok: false,
      error: createOmemError({
        code: 'OMEM-E29-REMEMBER-EMPTY',
        message: 'remember() text must be non-empty (whitespace-only is rejected).',
      }),
    };
  }

  const value: RememberArgs = {
    text,
    ...(source !== undefined ? { source } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(role !== undefined ? { role } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
  };
  return { ok: true, value };
}

function reject(ctx: CommandContext, error: OmemError): number {
  if (ctx.flags.json) writeJsonError(ctx, error);
  else writeTextError(ctx, error);
  if (error.code === 'OMEM-E01-USAGE' || error.code === 'OMEM-E02-UNKNOWN-COMMAND') return 2;
  return 1;
}

function consumeValue(
  token: string,
  argv: readonly string[],
  i: number,
  prefix: string,
): { ok: true; value: string; advance: number } | { ok: false; error: OmemError } {
  if (token.startsWith(prefix)) {
    return { ok: true, value: token.slice(prefix.length), advance: i };
  }
  const next = argv[i + 1];
  if (next === undefined) return usage(`Missing value for '${token}'.`);
  return { ok: true, value: next, advance: i + 1 };
}

function usage(message: string): { ok: false; error: OmemError } {
  return { ok: false, error: createOmemError({ code: 'OMEM-E01-USAGE', message }) };
}

function openErrorToOmemError(err: unknown): OmemError {
  if (err instanceof CanonicalSchemaError) {
    return createOmemError({
      code: err.code,
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof CanonicalRuntimeError) {
    // Surfacing the runtime gate directly (not wrapped as I/O error) gives
    // users a clearer breadcrumb to "install Bun" / "use the binary" remediation.
    return createOmemError({
      code: err.code,
      message: err.message,
      cause: err,
    });
  }
  const e = err as Error;
  if (e.message?.toLowerCase().includes('permission')) {
    return createOmemError({
      code: 'OMEM-E04-PERM',
      message: `Cannot open canonical store: ${e.message}`,
      cause: e,
    });
  }
  return createOmemError({
    code: 'OMEM-E11-IO',
    message: `Cannot open canonical store: ${e.message}`,
    cause: e,
  });
}
