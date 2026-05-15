import { existsSync } from 'node:fs';
import { inventory } from '@oh-my-memories/core';
import { loadConfig, saveConfig } from '@oh-my-memories/core/src/config';
import { createAllAdapters } from '../adapters';
import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import { resolveOmemHome } from '../platform/home';
import { isInteractive } from '../platform/interactive';
import { configPath } from '../platform/paths';
import type { CommandContext, CommandHandler } from './types';

export const init: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const interactive = isInteractive({
    env: ctx.env,
    stdinIsTty: ctx.stdinIsTty,
    nonInteractiveFlag: ctx.flags.nonInteractive,
  });

  const homeOpts = { env: ctx.env };
  const omemHome = resolveOmemHome(homeOpts);
  const cfgPath = configPath(homeOpts);
  const adapters = createAllAdapters();
  const entries = await inventory(adapters);
  const detected = entries.filter((e) => e.detected.present);

  if (detected.length === 0) {
    const error = createOmemError({
      code: 'OMEM-E03-NO-SOURCES',
      message: 'No memory sources detected on this machine.',
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }

  // Non-interactive: enable all detected sources automatically.
  // Interactive: in M1 we also auto-enable all (the interactive prompt for
  // selective enable is deferred to M1.1; the contract shape is stable).
  const sourcesToEnable = detected.map((e) => e.adapterId);

  if (!interactive) {
    // Non-interactive must succeed without prompting.
    const cfg = loadConfig(cfgPath);
    cfg.sources = sourcesToEnable;
    saveConfig(cfgPath, cfg);

    if (ctx.flags.json) {
      writeJsonResult(ctx, {
        ok: true,
        command: 'init',
        omemHome,
        sources: sourcesToEnable,
        configCreated: true,
      });
    } else {
      ctx.stdout.write(`Initialised ${omemHome}\n`);
      ctx.stdout.write(`Enabled sources: ${sourcesToEnable.join(', ')}\n`);
    }
    return 0;
  }

  // Interactive path: for M1, we behave identically (auto-enable all detected).
  // M1.1 will add the selection prompt here.
  const cfg = loadConfig(cfgPath);
  cfg.sources = sourcesToEnable;
  saveConfig(cfgPath, cfg);

  if (ctx.flags.json) {
    writeJsonResult(ctx, {
      ok: true,
      command: 'init',
      omemHome,
      sources: sourcesToEnable,
      configCreated: true,
    });
  } else {
    ctx.stdout.write(`Initialised ${omemHome}\n`);
    ctx.stdout.write(
      `Detected ${detected.length} source(s): ${detected.map((e) => e.displayName).join(', ')}\n`,
    );
    ctx.stdout.write(`Enabled: ${sourcesToEnable.join(', ')}\n`);
    if (!existsSync(cfgPath.replace('config.json', ''))) {
      ctx.stdout.write(`Created config at ${cfgPath}\n`);
    }
  }
  return 0;
};
