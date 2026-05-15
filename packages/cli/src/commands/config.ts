import { existsSync } from 'node:fs';
import {
  getConfigValue,
  listConfig,
  loadConfig,
  saveConfig,
  setConfigValue,
} from '@oh-my-memories/core/src/config';
import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { type TableColumn, renderTable, writeTextError } from '../output/table';
import { configPath } from '../platform/paths';
import type { CommandContext, CommandHandler } from './types';

export const config: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const sub = ctx.argv[0];
  if (sub !== 'get' && sub !== 'set' && sub !== 'list') {
    const err = createOmemError({
      code: 'OMEM-E01-USAGE',
      message: 'Usage: omem config get|set|list',
    });
    if (ctx.flags.json) writeJsonError(ctx, err);
    else writeTextError(ctx, err);
    return 2;
  }

  if (sub === 'get' && ctx.argv.length < 2) {
    return missing(ctx, "'omem config get' requires <key>");
  }
  if (sub === 'set' && ctx.argv.length < 3) {
    return missing(ctx, "'omem config set' requires <key> <value>");
  }

  const cfgPath = configPath({ env: ctx.env });
  const configExists = existsSync(cfgPath);

  if (sub === 'get') {
    const key = ctx.argv[1] as string;
    const cfg = loadConfig(cfgPath);
    const value = getConfigValue(cfg, key);

    if (value === undefined) {
      const err = createOmemError({
        code: 'OMEM-E12-CONFIG-INVALID',
        message: `Unknown config key: '${key}'.`,
      });
      if (ctx.flags.json) writeJsonError(ctx, err);
      else writeTextError(ctx, err);
      return 1;
    }

    if (ctx.flags.json) {
      writeJsonResult(ctx, { key, value });
    } else {
      ctx.stdout.write(`${JSON.stringify(value)}\n`);
    }
    return 0;
  }

  if (sub === 'set') {
    const key = ctx.argv[1] as string;
    const value = ctx.argv[2] as string;
    let cfg = loadConfig(cfgPath);
    cfg = setConfigValue(cfg, key, value);
    saveConfig(cfgPath, cfg);

    if (ctx.flags.json) {
      writeJsonResult(ctx, { key, value: getConfigValue(cfg, key), saved: true });
    } else {
      ctx.stdout.write(`${key} = ${JSON.stringify(getConfigValue(cfg, key))}\n`);
    }
    return 0;
  }

  // sub === 'list'
  const cfg = loadConfig(cfgPath);
  const entries = listConfig(cfg, configExists);

  if (ctx.flags.json) {
    writeJsonResult(ctx, { entries });
    return 0;
  }

  interface ConfigRow {
    key: string;
    current: string;
    default: string;
    source: string;
    description: string;
  }

  const rows: ConfigRow[] = entries.map((e) => ({
    key: e.key,
    current: JSON.stringify(e.current),
    default: JSON.stringify(e.default),
    source: e.source,
    description: e.description,
  }));

  const columns: TableColumn<ConfigRow>[] = [
    { header: 'KEY', accessor: (r) => r.key },
    { header: 'CURRENT', accessor: (r) => r.current },
    { header: 'DEFAULT', accessor: (r) => r.default },
    { header: 'SOURCE', accessor: (r) => r.source },
    { header: 'DESCRIPTION', accessor: (r) => r.description },
  ];

  ctx.stdout.write(`${renderTable(rows, columns)}\n`);
  return 0;
};

function missing(ctx: CommandContext, message: string): number {
  const err = createOmemError({ code: 'OMEM-E01-USAGE', message });
  if (ctx.flags.json) writeJsonError(ctx, err);
  else writeTextError(ctx, err);
  return 2;
}
