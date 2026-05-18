import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../../packages/cli/src/index';

class MemoryStream {
  chunks: string[] = [];
  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }
  text(): string {
    return this.chunks.join('');
  }
}

let omemHome: string;
let fixtureDir: string;

beforeEach(async () => {
  const ts = Date.now();
  omemHome = join(import.meta.dir, `__e2e-adapter-home-${ts}`);
  fixtureDir = join(import.meta.dir, `__e2e-adapter-fixture-${ts}`);
  await mkdir(omemHome, { recursive: true });
  await mkdir(fixtureDir, { recursive: true });

  await writeFile(
    join(fixtureDir, 'package.json'),
    JSON.stringify({
      name: '@omem-adapter/e2e-test',
      version: '0.42.0',
      type: 'module',
      main: 'index.js',
    }),
  );
  await writeFile(
    join(fixtureDir, 'index.js'),
    `export default {
  id: 'e2e-test',
  category: 'ide',
  displayName: 'E2E Test Adapter',
  version: '0.42.0',
  detect: async () => ({ present: false, storageRoot: '/nowhere' }),
  scan: async function* () {},
};`,
  );
});

afterEach(async () => {
  for (const dir of [omemHome, fixtureDir]) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* Windows handle release lag; non-fatal. */
    }
  }
});

function opts() {
  const stdout = new MemoryStream();
  const stderr = new MemoryStream();
  return {
    stdout,
    stderr,
    options: { stdout, stderr, env: { OMEM_HOME: omemHome, NO_COLOR: '1' } },
  };
}

async function simulateInstall(): Promise<void> {
  const pkgDir = join(omemHome, 'node_modules', '@omem-adapter', 'e2e-test');
  await mkdir(pkgDir, { recursive: true });
  const { readFile } = await import('node:fs/promises');
  await writeFile(join(pkgDir, 'package.json'), await readFile(join(fixtureDir, 'package.json')));
  await writeFile(join(pkgDir, 'index.js'), await readFile(join(fixtureDir, 'index.js')));
}

describe('e2e: adapter install → list → uninstall roundtrip', () => {
  test('adapter list shows only built-ins before any plugin install', async () => {
    const { stdout, options } = opts();
    const code = await main(['adapter', 'list', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(stdout.text()) as {
      adapters: Array<{ id: string; builtin: boolean }>;
    };
    const ids = result.adapters.map((a) => a.id);
    expect(ids).not.toContain('e2e-test');
    expect(ids).toContain('claude-code');
  });

  test('full roundtrip: install → list (sees plugin) → uninstall → list (gone)', async () => {
    await simulateInstall();

    // Verify plugin dir exists
    const pkgDir = join(omemHome, 'node_modules', '@omem-adapter', 'e2e-test');
    await expect(access(pkgDir).then(() => true)).resolves.toBe(true);

    // list should show the plugin
    {
      const { stdout, options } = opts();
      const code = await main(['adapter', 'list', '--json'], options);
      expect(code).toBe(0);
      const result = JSON.parse(stdout.text()) as {
        adapters: Array<{ id: string; builtin: boolean; version: string; category: string }>;
      };
      const plugin = result.adapters.find((a) => a.id === 'e2e-test');
      expect(plugin).toBeDefined();
      expect(plugin?.builtin).toBe(false);
      expect(plugin?.version).toBe('0.42.0');
      expect(plugin?.category).toBe('ide');
    }

    // uninstall the plugin
    {
      const { stdout, options } = opts();
      const code = await main(['adapter', 'uninstall', 'e2e-test'], options);
      expect(code).toBe(0);
      const out = stdout.text();
      expect(out).toContain('Uninstalled');
    }

    // list again — plugin should be gone
    {
      const { stdout, options } = opts();
      const code = await main(['adapter', 'list', '--json'], options);
      expect(code).toBe(0);
      const result = JSON.parse(stdout.text()) as {
        adapters: Array<{ id: string }>;
      };
      const ids = result.adapters.map((a) => a.id);
      expect(ids).not.toContain('e2e-test');
    }
  });

  test('uninstall non-existent plugin returns OMEM-E43', async () => {
    const { stderr, options } = opts();
    const code = await main(['adapter', 'uninstall', 'ghost-adapter'], options);
    expect(code).toBe(1);
    expect(stderr.text()).toContain('OMEM-E43-PLUGIN-NOT-FOUND');
  });

  test('adapter list --json includes plugin with correct schema', async () => {
    await simulateInstall();

    const { stdout, options } = opts();
    const code = await main(['adapter', 'list', '--json'], options);
    expect(code).toBe(0);
    const result = JSON.parse(stdout.text()) as {
      adapters: Array<{
        id: string;
        category: string;
        displayName: string;
        version: string;
        builtin: boolean;
      }>;
    };

    for (const a of result.adapters) {
      expect(typeof a.id).toBe('string');
      expect(typeof a.category).toBe('string');
      expect(typeof a.displayName).toBe('string');
      expect(typeof a.version).toBe('string');
      expect(typeof a.builtin).toBe('boolean');
    }
  });

  test('adapter list text output renders plugin row', async () => {
    await simulateInstall();

    const { stdout, options } = opts();
    const code = await main(['adapter', 'list'], options);
    expect(code).toBe(0);
    const out = stdout.text();
    expect(out).toContain('e2e-test');
    expect(out).toContain('plugin');
    expect(out).toContain('E2E Test Adapter');
  });
});
