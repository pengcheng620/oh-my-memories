import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AnyAdapter, IBaseAdapter } from '@oh-my-memories/adapter-sdk';
import type { ResolveHomeOptions } from './home';
import { pluginDir } from './paths';

// Plugin loader — discovers and validates third-party adapter packages that
// were installed into ~/.omem/node_modules/@omem-adapter/*.
//
// Design principles (m4-plan §Plugin discovery):
//   - Filesystem scan only; no manifest / config file to stay in sync with.
//   - Each package under @omem-adapter/ is dynamically imported.
//   - A loaded plugin MUST export a default that satisfies IBaseAdapter.
//   - Duplicate IDs: first-encountered wins, second logs OMEM-W02.
//   - Any load failure logs OMEM-E42 and continues (no all-or-nothing).
//   - scan() must be AsyncIterable; sync Iterables are wrapped automatically.

export interface PluginLoadResult {
  adapters: AnyAdapter[];
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string; pkg: string }>;
}

function isBaseAdapter(value: unknown): value is IBaseAdapter {
  if (value === null || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a['id'] === 'string' &&
    a['id'].length > 0 &&
    typeof a['category'] === 'string' &&
    typeof a['displayName'] === 'string' &&
    typeof a['detect'] === 'function' &&
    typeof a['scan'] === 'function'
  );
}

function wrapIfSyncIterable(adapter: IBaseAdapter): IBaseAdapter {
  const originalScan = adapter.scan.bind(adapter);
  return Object.assign(Object.create(Object.getPrototypeOf(adapter)) as object, adapter, {
    scan(opts?: Parameters<IBaseAdapter['scan']>[0]): AsyncIterable<ReturnType<typeof originalScan> extends AsyncIterable<infer T> ? T : never> {
      const result = originalScan(opts);
      // If scan returned a plain Iterable (not AsyncIterable), wrap it.
      if (
        result !== null &&
        typeof result === 'object' &&
        Symbol.iterator in result &&
        !(Symbol.asyncIterator in result)
      ) {
        async function* wrap() {
          for (const item of result as Iterable<unknown>) {
            yield item;
          }
        }
        return wrap() as ReturnType<typeof this.scan>;
      }
      return result as ReturnType<typeof this.scan>;
    },
  }) as IBaseAdapter;
}

export async function loadPlugins(options: ResolveHomeOptions = {}): Promise<PluginLoadResult> {
  const result: PluginLoadResult = { adapters: [], warnings: [], errors: [] };
  const seenIds = new Map<string, string>(); // id → packageName

  const scopeDir = join(pluginDir(options), '@omem-adapter');

  let entries: string[];
  try {
    entries = await readdir(scopeDir);
  } catch {
    // Directory doesn't exist yet — no plugins installed, that's fine.
    return result;
  }

  for (const entry of entries) {
    const pkgDir = join(scopeDir, entry);
    const pkgName = `@omem-adapter/${entry}`;

    let exported: unknown;
    try {
      // Use file URL for Windows path compatibility.
      const pkgJsonPath = join(pkgDir, 'package.json');
      let mainEntry = 'index.js';
      try {
        const pkgJson = JSON.parse(
          await import('node:fs').then((fs) => fs.readFileSync(pkgJsonPath, 'utf8')),
        ) as Record<string, unknown>;
        if (typeof pkgJson['main'] === 'string') mainEntry = pkgJson['main'];
        else if (typeof pkgJson['exports'] === 'string') mainEntry = pkgJson['exports'];
      } catch {
        // No package.json or unparseable — fall back to index.js.
      }
      const entryPath = join(pkgDir, mainEntry);
      const module = (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
      exported = module['default'] ?? module;
    } catch (err) {
      result.errors.push({
        code: 'OMEM-E42-PLUGIN-LOAD-FAILED',
        message: `Failed to import '${pkgName}': ${err instanceof Error ? err.message : String(err)}`,
        pkg: pkgName,
      });
      continue;
    }

    if (!isBaseAdapter(exported)) {
      result.errors.push({
        code: 'OMEM-E42-PLUGIN-LOAD-FAILED',
        message: `'${pkgName}' default export does not satisfy IBaseAdapter (missing id/category/displayName/detect/scan).`,
        pkg: pkgName,
      });
      continue;
    }

    if (seenIds.has(exported.id)) {
      result.warnings.push({
        code: 'OMEM-W02-PLUGIN-ID-COLLISION',
        message: `Adapter ID '${exported.id}' from '${pkgName}' collides with '${seenIds.get(exported.id)}'; skipping.`,
      });
      continue;
    }

    seenIds.set(exported.id, pkgName);
    result.adapters.push(wrapIfSyncIterable(exported) as AnyAdapter);
  }

  return result;
}
