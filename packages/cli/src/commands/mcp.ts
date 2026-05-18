import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import type { CommandContext, CommandHandler } from './types';

// `omem mcp serve` — boot the MCP server over stdio.
// `omem mcp install --ide=<ide>` — register `omem mcp serve` in an IDE's config.
//
// Implementation is dynamically imported so the heavyweight MCP SDK is only
// loaded when these subcommands actually run; `omem scan` etc stay fast.

const SUPPORTED_IDES = ['claude-code', 'cursor', 'codex', 'gemini'] as const;
type SupportedIde = (typeof SUPPORTED_IDES)[number];

export const mcp: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const sub = ctx.argv[0];
  if (sub === 'serve') return serve(ctx);
  if (sub === 'install') return install(ctx);
  if (sub === 'uninstall') return uninstall(ctx);
  return usage(
    ctx,
    'Usage: omem mcp serve | omem mcp install --ide=<ide> | omem mcp uninstall --ide=<ide>',
  );
};

async function serve(ctx: CommandContext): Promise<number> {
  if (ctx.argv.length > 1) {
    return usage(ctx, `Unrecognised arg after 'serve': '${ctx.argv[1]}'`);
  }
  // Stdio server: stdin/stdout are reserved for the MCP protocol. We use stderr
  // for any human-visible logs. Keep stdout silent until connect() runs.
  try {
    const { runStdioServer } = await import('@oh-my-memories/mcp');
    await runStdioServer({ cwd: process.cwd() });
    // runStdioServer never resolves under normal use (the transport keeps the
    // process alive). If it does, treat that as graceful shutdown.
    return 0;
  } catch (err) {
    const error = createOmemError({
      code: 'OMEM-E11-IO',
      message: `Failed to start MCP server: ${err instanceof Error ? err.message : String(err)}`,
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }
}

async function install(ctx: CommandContext): Promise<number> {
  const ideArg = parseIdeFlag(ctx.argv.slice(1));
  if (ideArg.kind === 'error') return usage(ctx, ideArg.message);

  try {
    const { installForIde } = await import('@oh-my-memories/mcp');
    const home = resolveHome(ctx);
    const result = installForIde({
      ide: ideArg.value,
      ...(home !== undefined ? { home } : {}),
    });
    if (ctx.flags.json) {
      writeJsonResult(ctx, {
        command: 'mcp install',
        ide: result.ide,
        configPath: result.configPath,
        created: result.created,
        updated: result.updated,
        alreadyInstalled: result.alreadyInstalled,
        stanza: result.stanza,
      });
    } else {
      const verb = result.alreadyInstalled
        ? 'Already installed'
        : result.created
          ? 'Installed (created config)'
          : 'Installed';
      ctx.stdout.write(`${verb} omem MCP server in ${result.ide}\n`);
      ctx.stdout.write(`  ${result.configPath}\n`);
      const argsText = (result.stanza.args as string[]).join(' ');
      ctx.stdout.write(`  command: ${result.stanza.command} ${argsText}\n`);
    }
    return 0;
  } catch (err) {
    const error = createOmemError({
      code: 'OMEM-E11-IO',
      message: `Failed to install MCP server: ${err instanceof Error ? err.message : String(err)}`,
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
    const { uninstallForIde } = await import('@oh-my-memories/mcp');
    const home = resolveHome(ctx);
    const result = uninstallForIde({
      ide: ideArg.value,
      ...(home !== undefined ? { home } : {}),
    });
    if (ctx.flags.json) {
      writeJsonResult(ctx, {
        command: 'mcp uninstall',
        ide: result.ide,
        configPath: result.configPath,
        removed: result.removed,
      });
    } else {
      const verb = result.removed ? 'Removed' : 'Not present';
      ctx.stdout.write(`${verb} omem MCP server in ${result.ide}\n`);
      ctx.stdout.write(`  ${result.configPath}\n`);
    }
    return 0;
  } catch (err) {
    const error = createOmemError({
      code: 'OMEM-E11-IO',
      message: `Failed to uninstall MCP server: ${err instanceof Error ? err.message : String(err)}`,
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }
}

// HOME resolution: tests inject HOME via ctx.env. In production the installer
// falls through to os.homedir() which uses the same env, so passing undefined
// when ctx.env doesn't set it preserves the standard behavior.
function resolveHome(ctx: CommandContext): string | undefined {
  return ctx.env.HOME ?? ctx.env.USERPROFILE;
}

function parseIdeFlag(
  argv: readonly string[],
): { kind: 'ok'; value: SupportedIde } | { kind: 'error'; message: string } {
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
  if (ide === undefined) {
    return { kind: 'error', message: "Missing required flag '--ide'." };
  }
  if (!(SUPPORTED_IDES as readonly string[]).includes(ide)) {
    return {
      kind: 'error',
      message: `Unsupported IDE '${ide}'. Use one of: ${SUPPORTED_IDES.join(', ')}.`,
    };
  }
  return { kind: 'ok', value: ide as SupportedIde };
}

function usage(ctx: CommandContext, message: string): number {
  const err = createOmemError({ code: 'OMEM-E01-USAGE', message });
  if (ctx.flags.json) writeJsonError(ctx, err);
  else writeTextError(ctx, err);
  return 2;
}
