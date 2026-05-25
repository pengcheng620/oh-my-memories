import {
  SUPPORTED_HOOK_IDES,
  type SupportedHookIde,
  getHooksStatus,
  installHooks,
  uninstallHooks,
} from '../hooks';
import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import type { CommandContext, CommandHandler } from './types';

export const hooks: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const sub = ctx.argv[0];
  if (sub === 'install') return install(ctx);
  if (sub === 'uninstall') return uninstall(ctx);
  if (sub === 'status') return status(ctx);
  return usage(
    ctx,
    'Usage: omem hooks install --ide=<ide> | omem hooks uninstall --ide=<ide> | omem hooks status',
  );
};

async function install(ctx: CommandContext): Promise<number> {
  const ideArg = parseIdeFlag(ctx.argv.slice(1));
  if (ideArg.kind === 'error') return usage(ctx, ideArg.message);

  try {
    const result = installHooks({ ide: ideArg.value, projectRoot: resolveProjectRoot(ctx) });
    if (ctx.flags.json) {
      writeJsonResult(ctx, {
        command: 'hooks install',
        ide: result.ide,
        configPath: result.configPath,
        created: result.created,
        updated: result.updated,
        alreadyInstalled: result.alreadyInstalled,
      });
    } else {
      const verb = result.alreadyInstalled
        ? 'Already installed'
        : result.updated
          ? 'Updated'
          : 'Installed';
      ctx.stdout.write(`${verb} omem hook for ${result.ide}\n`);
      ctx.stdout.write(`  ${result.configPath}\n`);
    }
    return 0;
  } catch (err) {
    const error = createOmemError({
      code: 'OMEM-E11-IO',
      message: `Failed to install hooks: ${err instanceof Error ? err.message : String(err)}`,
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }
}

async function uninstall(ctx: CommandContext): Promise<number> {
  const ideArg = parseIdeFlag(ctx.argv.slice(1));
  if (ideArg.kind === 'error') return usage(ctx, ideArg.message);

  try {
    const result = uninstallHooks({ ide: ideArg.value, projectRoot: resolveProjectRoot(ctx) });
    if (ctx.flags.json) {
      writeJsonResult(ctx, {
        command: 'hooks uninstall',
        ide: result.ide,
        configPath: result.configPath,
        removed: result.removed,
      });
    } else {
      const verb = result.removed ? 'Removed' : 'Not present';
      ctx.stdout.write(`${verb} omem hook for ${result.ide}\n`);
      ctx.stdout.write(`  ${result.configPath}\n`);
    }
    return 0;
  } catch (err) {
    const error = createOmemError({
      code: 'OMEM-E11-IO',
      message: `Failed to uninstall hooks: ${err instanceof Error ? err.message : String(err)}`,
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }
}

async function status(ctx: CommandContext): Promise<number> {
  if (ctx.argv.length > 1) return usage(ctx, `Unrecognised arg after 'status': '${ctx.argv[1]}'`);

  const hooks = getHooksStatus({ projectRoot: resolveProjectRoot(ctx) });
  if (ctx.flags.json) {
    writeJsonResult(ctx, { command: 'hooks status', hooks });
  } else {
    for (const hook of hooks) {
      ctx.stdout.write(`${hook.ide}: ${hook.state}\n`);
      ctx.stdout.write(`  ${hook.configPath}\n`);
    }
  }
  return 0;
}

function resolveProjectRoot(ctx: CommandContext): string {
  return ctx.env.OMEM_PROJECT_ROOT ?? process.cwd();
}

function parseIdeFlag(
  argv: readonly string[],
): { kind: 'ok'; value: SupportedHookIde } | { kind: 'error'; message: string } {
  let ide: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === '--ide' || token.startsWith('--ide=')) {
      const value = token.startsWith('--ide=') ? token.slice('--ide='.length) : argv[i + 1];
      if (value === undefined || value === '') {
        return { kind: 'error', message: "Missing value for '--ide'." };
      }
      ide = value.toLowerCase();
      if (!token.startsWith('--ide=')) i += 1;
      continue;
    }
    return { kind: 'error', message: `Unrecognised flag: '${token}'.` };
  }
  if (ide === undefined) return { kind: 'error', message: "Missing required flag '--ide'." };
  if (!(SUPPORTED_HOOK_IDES as readonly string[]).includes(ide)) {
    return {
      kind: 'error',
      message: `Unsupported IDE '${ide}'. Use one of: ${SUPPORTED_HOOK_IDES.join(', ')}.`,
    };
  }
  return { kind: 'ok', value: ide as SupportedHookIde };
}

function usage(ctx: CommandContext, message: string): number {
  const err = createOmemError({ code: 'OMEM-E01-USAGE', message });
  if (ctx.flags.json) writeJsonError(ctx, err);
  else writeTextError(ctx, err);
  return 2;
}
