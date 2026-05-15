import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import type { CommandContext, CommandHandler } from './types';

const SUPPORTED_IDES: ReadonlySet<string> = new Set(['claude-code', 'cursor', 'codex']);

// Stub for `omem skills install --ide=<ide>`. Argument grammar + IDE allow
// list are real; the actual SKILL.md write lands in Lane E2.

export const skills: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  if (ctx.argv[0] !== 'install') {
    return usage(ctx, 'Usage: omem skills install --ide=<ide>');
  }
  const tail = ctx.argv.slice(1);
  let ide: string | undefined;
  for (let i = 0; i < tail.length; i++) {
    const token = tail[i] as string;
    if (token === '--ide' || token.startsWith('--ide=')) {
      const value = token.startsWith('--ide=') ? token.slice('--ide='.length) : tail[i + 1];
      if (value === undefined || value === '') {
        return usage(ctx, "Missing value for '--ide'.");
      }
      ide = value.toLowerCase();
      if (!token.startsWith('--ide=')) i += 1;
      continue;
    }
    return usage(ctx, `Unrecognised flag: '${token}'.`);
  }
  if (ide === undefined) {
    return usage(ctx, "Missing required flag '--ide'.");
  }
  if (!SUPPORTED_IDES.has(ide)) {
    return usage(ctx, `Unsupported IDE '${ide}'. Use one of: ${[...SUPPORTED_IDES].join(', ')}.`);
  }

  const stub = createOmemError({
    code: 'OMEM-E11-IO',
    message: `'omem skills install --ide=${ide}' is stubbed in M1 Lane E1; Lane E2 wires the actual file write.`,
  });
  if (ctx.flags.json) {
    writeJsonResult(ctx, { command: 'skills install', ide, stub: true });
    writeJsonError(ctx, stub);
    return 1;
  }
  writeTextError(ctx, stub);
  return 1;
};

function usage(ctx: CommandContext, message: string): number {
  const err = createOmemError({ code: 'OMEM-E01-USAGE', message });
  if (ctx.flags.json) writeJsonError(ctx, err);
  else writeTextError(ctx, err);
  return 2;
}
