import { existsSync } from 'node:fs';
import { inventory, schemaVersionFor } from '@oh-my-memories/core';
import { loadConfig } from '@oh-my-memories/core/src/config';
import { createAllAdapters } from '../adapters';
import { writeJsonResult } from '../output/json';
import { type TableColumn, renderTable } from '../output/table';
import { resolveOmemHome } from '../platform/home';
import { configPath } from '../platform/paths';
import { denylistPatternIds } from '../safety/denylist';
import type { CommandContext, CommandHandler } from './types';

export const doctor: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const homeOpts = { env: ctx.env };
  const omemHome = resolveOmemHome(homeOpts);
  const cfgPath = configPath(homeOpts);
  const configExists = existsSync(cfgPath);
  const config = loadConfig(cfgPath);
  const adapters = createAllAdapters();
  const entries = await inventory(adapters);

  interface AdapterHealth {
    id: string;
    name: string;
    present: boolean;
    enabled: boolean;
    storageRoot: string | undefined;
    schemaVersion: string;
  }

  const adapterHealth: AdapterHealth[] = entries.map((e) => ({
    id: e.adapterId,
    name: e.displayName,
    present: e.detected.present,
    enabled: config.sources.includes(e.adapterId),
    storageRoot: e.detected.storageRoot,
    schemaVersion: schemaVersionFor(e.adapterId),
  }));

  if (ctx.flags.json) {
    writeJsonResult(ctx, {
      omemVersion: '0.0.0',
      runtime: `bun ${process.version}`,
      omemHome,
      configExists,
      configuredSources: config.sources,
      denylistPatterns: denylistPatternIds(),
      adapters: adapterHealth,
    });
    return 0;
  }

  ctx.stdout.write('omem doctor\n\n');
  ctx.stdout.write('  Version:  0.0.0\n');
  ctx.stdout.write(`  Runtime:  bun ${process.version}\n`);
  ctx.stdout.write(`  Home:     ${omemHome}\n`);
  ctx.stdout.write(`  Config:   ${configExists ? cfgPath : '(not found — run omem init)'}\n`);
  ctx.stdout.write(`  Denylist: ${denylistPatternIds().length} patterns active\n\n`);

  interface DoctorRow {
    id: string;
    name: string;
    present: string;
    enabled: string;
    schema: string;
  }

  const rows: DoctorRow[] = adapterHealth.map((a) => ({
    id: a.id,
    name: a.name,
    present: a.present ? 'yes' : 'no',
    enabled: a.enabled ? 'yes' : 'no',
    schema: a.schemaVersion,
  }));

  const columns: TableColumn<DoctorRow>[] = [
    { header: 'SOURCE', accessor: (r) => r.id },
    { header: 'NAME', accessor: (r) => r.name },
    { header: 'PRESENT', accessor: (r) => r.present },
    { header: 'ENABLED', accessor: (r) => r.enabled },
    { header: 'SCHEMA', accessor: (r) => r.schema },
  ];

  ctx.stdout.write(`${renderTable(rows, columns)}\n`);
  return 0;
};
