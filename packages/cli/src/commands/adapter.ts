import type { AnyAdapter } from '@oh-my-memories/adapter-sdk';
import { loadAllAdapters } from '../adapters';
import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import { installPlugin, uninstallPlugin } from '../platform/plugin-installer';
import type { CommandContext, CommandHandler } from './types';

// omem adapter - discover, install, and uninstall adapter plugins.
//
// Subcommands:
//   list                           Show all loaded adapters (built-ins + plugins)
//   install <packageSpec>          Install a plugin from npm or a local path
//   uninstall <adapterIdOrPkg>     Remove an installed plugin by adapter ID or
//                                  package name (@omem-adapter/<name>)

export const adapter: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const [sub, ...rest] = ctx.argv;

  if (sub === 'list' || sub === undefined) {
    return runList(ctx);
  }
  if (sub === 'install') {
    return runInstall(ctx, rest);
  }
  if (sub === 'uninstall') {
    return runUninstall(ctx, rest);
  }

  const err = createOmemError({
    code: 'OMEM-E01-USAGE',
    message: `Unknown adapter subcommand '${sub}'. Use: list | install | uninstall`,
  });
  if (ctx.flags.json) writeJsonError(ctx, err);
  else writeTextError(ctx, err);
  return 2;
};

async function runList(ctx: CommandContext): Promise<number> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const adapters = await loadAllAdapters({
    omemHome: { env: ctx.env },
    onPluginDiagnostic(level, _code, message) {
      if (level === 'warning') warnings.push(message);
      else errors.push(message);
    },
  });

  for (const w of warnings) {
    ctx.stderr.write(`[warn] ${w}\n`);
  }
  for (const e of errors) {
    ctx.stderr.write(`[error] ${e}\n`);
  }

  if (ctx.flags.json) {
    writeJsonResult(ctx, {
      command: 'adapter list',
      adapters: adapters.map(adapterSummary),
    });
  } else {
    ctx.stdout.write(formatAdapterList(adapters));
  }

  return 0;
}

async function runInstall(ctx: CommandContext, args: string[]): Promise<number> {
  const packageSpec = args[0];
  if (!packageSpec || packageSpec.startsWith('-')) {
    const err = createOmemError({
      code: 'OMEM-E01-USAGE',
      message: 'Usage: omem adapter install <package-spec>  (e.g. @omem-adapter/my-adapter)',
    });
    if (ctx.flags.json) writeJsonError(ctx, err);
    else writeTextError(ctx, err);
    return 2;
  }

  ctx.stderr.write(`Installing '${packageSpec}'…\n`);

  const result = await installPlugin(packageSpec, { env: ctx.env });

  if (!result.ok) {
    const err = createOmemError({
      code: result.errorCode ?? 'OMEM-E41-PLUGIN-INSTALL-FAILED',
      message: result.errorMessage ?? 'Plugin install failed.',
    });
    if (ctx.flags.json) writeJsonError(ctx, err);
    else writeTextError(ctx, err);
    return 1;
  }

  if (ctx.flags.json) {
    writeJsonResult(ctx, { command: 'adapter install', package: packageSpec, installed: true });
  } else {
    ctx.stdout.write(`✓ Installed '${packageSpec}'.\n`);
    ctx.stdout.write(`  Run 'omem adapter list' to verify it loaded.\n`);
  }
  return 0;
}

async function runUninstall(ctx: CommandContext, args: string[]): Promise<number> {
  const target = args[0];
  if (!target || target.startsWith('-')) {
    const err = createOmemError({
      code: 'OMEM-E01-USAGE',
      message:
        'Usage: omem adapter uninstall <adapter-id | @omem-adapter/package-name>',
    });
    if (ctx.flags.json) writeJsonError(ctx, err);
    else writeTextError(ctx, err);
    return 2;
  }

  // Normalise: if the user passed a bare adapter ID (no @), derive the
  // expected package name. If they passed the full package name, use it.
  const packageName = target.startsWith('@') ? target : `@omem-adapter/${target}`;

  const result = await uninstallPlugin(packageName, { env: ctx.env });

  if (!result.ok) {
    const err = createOmemError({
      code: result.errorCode ?? 'OMEM-E44-PLUGIN-UNINSTALL-FAILED',
      message: result.errorMessage ?? 'Plugin uninstall failed.',
    });
    if (ctx.flags.json) writeJsonError(ctx, err);
    else writeTextError(ctx, err);
    return 1;
  }

  if (ctx.flags.json) {
    writeJsonResult(ctx, {
      command: 'adapter uninstall',
      package: packageName,
      uninstalled: true,
    });
  } else {
    ctx.stdout.write(`✓ Uninstalled '${packageName}'.\n`);
  }
  return 0;
}

function adapterSummary(a: AnyAdapter) {
  return {
    id: a.id,
    category: a.category,
    displayName: a.displayName,
    version: a.version ?? '0.0.0',
    builtin: isBuiltin(a.id),
  };
}

const BUILTIN_IDS = new Set(['claude-code', 'cursor', 'codex', 'serena']);
function isBuiltin(id: string): boolean {
  return BUILTIN_IDS.has(id);
}

function formatAdapterList(adapters: AnyAdapter[]): string {
  if (adapters.length === 0) return 'No adapters found.\n';

  const rows = adapters.map((a) => ({
    id: a.id,
    category: a.category,
    version: a.version ?? '0.0.0',
    type: isBuiltin(a.id) ? 'built-in' : 'plugin',
    displayName: a.displayName,
  }));

  const idWidth = Math.max(2, ...rows.map((r) => r.id.length));
  const catWidth = Math.max(8, ...rows.map((r) => r.category.length));
  const verWidth = Math.max(7, ...rows.map((r) => r.version.length));
  const typeWidth = Math.max(4, ...rows.map((r) => r.type.length));

  const header = [
    'ID'.padEnd(idWidth),
    'CATEGORY'.padEnd(catWidth),
    'VERSION'.padEnd(verWidth),
    'TYPE'.padEnd(typeWidth),
    'DISPLAY NAME',
  ].join('  ');

  const sep = '-'.repeat(header.length);

  const lines = rows.map((r) =>
    [
      r.id.padEnd(idWidth),
      r.category.padEnd(catWidth),
      r.version.padEnd(verWidth),
      r.type.padEnd(typeWidth),
      r.displayName,
    ].join('  '),
  );

  return [header, sep, ...lines, ''].join('\n');
}
