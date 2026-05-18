import { mkdir, writeFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { loadPlugins } from '../../src/platform/plugin-loader';

// Tests for the plugin-loader: filesystem discovery, validation, ID-collision,
// bad-export handling, and sync-iterable wrapping.

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = join(import.meta.dir, `__plugin-loader-tmp-${Date.now()}`);
  await mkdir(tmpRoot, { recursive: true });
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

function omemOpts() {
  return { env: { OMEM_HOME: tmpRoot } };
}

/** Write an ESM plugin package. `exportCode` is written to `index.js`. */
async function writePlugin(name: string, exportCode: string): Promise<void> {
  const pkgDir = join(tmpRoot, 'node_modules', '@omem-adapter', name);
  await mkdir(pkgDir, { recursive: true });
  await writeFile(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: `@omem-adapter/${name}`, type: 'module', main: 'index.js' }),
  );
  await writeFile(join(pkgDir, 'index.js'), exportCode);
}

describe('loadPlugins', () => {
  test('returns empty when no plugins installed', async () => {
    const result = await loadPlugins(omemOpts());
    expect(result.adapters).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  test('returns empty when @omem-adapter dir is missing', async () => {
    const result = await loadPlugins(omemOpts());
    expect(result.adapters).toHaveLength(0);
  });

  test('loads a valid plugin with default export', async () => {
    await writePlugin(
      'my-test',
      `export default {
        id: 'my-test-adapter',
        category: 'ide',
        displayName: 'My Test Adapter',
        version: '1.0.0',
        detect: async () => ({ present: false }),
        scan: async function* () {},
      };`,
    );

    const result = await loadPlugins(omemOpts());
    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0]?.id).toBe('my-test-adapter');
    expect(result.adapters[0]?.displayName).toBe('My Test Adapter');
    expect(result.errors).toHaveLength(0);
  });

  test('skips and records error for missing required field (no id)', async () => {
    await writePlugin(
      'bad-plugin',
      `export default { category: 'ide', displayName: 'Bad', detect: async () => ({}), scan: async function*(){} };`,
    );

    const result = await loadPlugins(omemOpts());
    expect(result.adapters).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe('OMEM-E42-PLUGIN-LOAD-FAILED');
    expect(result.errors[0]?.message).toMatch(/does not satisfy IBaseAdapter/);
  });

  test('skips and records error for import failure', async () => {
    await writePlugin('crash-plugin', `throw new Error('deliberate crash');`);

    const result = await loadPlugins(omemOpts());
    expect(result.adapters).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe('OMEM-E42-PLUGIN-LOAD-FAILED');
  });

  test('ID collision: first wins, second gets warning', async () => {
    // alphabetically ordered names give deterministic first-encountered order
    await writePlugin(
      'alpha-adapter',
      `export default {
        id: 'shared-id',
        category: 'ide',
        displayName: 'Adapter alpha',
        detect: async () => ({ present: false }),
        scan: async function* () {},
      };`,
    );
    await writePlugin(
      'beta-adapter',
      `export default {
        id: 'shared-id',
        category: 'ide',
        displayName: 'Adapter beta',
        detect: async () => ({ present: false }),
        scan: async function* () {},
      };`,
    );

    const result = await loadPlugins(omemOpts());
    expect(result.adapters).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('OMEM-W02-PLUGIN-ID-COLLISION');
  });

  test('wraps sync generator scan() into async iterable', async () => {
    await writePlugin(
      'sync-scan',
      `export default {
        id: 'sync-adapter',
        category: 'ide',
        displayName: 'Sync Scan Adapter',
        detect: async () => ({ present: false }),
        scan: function* () { yield { id: 'r1', source: 'test', timestamp: new Date(0), text: 'hello' }; },
      };`,
    );

    const result = await loadPlugins(omemOpts());
    expect(result.adapters).toHaveLength(1);
    const adapter = result.adapters[0];
    expect(adapter).toBeDefined();
    const records = [];
    for await (const r of adapter!.scan()) {
      records.push(r);
    }
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: 'r1', text: 'hello' });
  });
});
