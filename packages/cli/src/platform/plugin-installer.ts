import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResolveHomeOptions } from './home';
import { pluginDir } from './paths';

// Plugin installer — wraps `bun add` / `npm install` to put adapter packages
// into the omem-private node_modules at ~/.omem/node_modules/.
//
// Design principles (m4-plan §Plugin installation):
//   - Bun is preferred; fall back to npm if bun is not on PATH.
//   - All packages installed under --prefix ~/.omem so they never pollute
//     the user's project or global npm.
//   - Local path installs (omem adapter install ./my-adapter) are supported.
//   - On uninstall, we rm -rf the package directory directly (no 'bun remove'
//     so the plugin dir stays clean without a lockfile).

export interface InstallOptions extends ResolveHomeOptions {
  /** Injected for testing. Defaults to real spawn. */
  readonly runCommand?: (
    cmd: string,
    args: string[],
    options: { cwd: string },
  ) => Promise<{ exitCode: number; stderr: string }>;
}

async function resolvePackageManager(): Promise<'bun' | 'npm' | null> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  for (const pm of ['bun', 'npm'] as const) {
    try {
      await exec(pm, ['--version']);
      return pm;
    } catch {
      // not found
    }
  }
  return null;
}

async function defaultRunCommand(
  cmd: string,
  args: string[],
  options: { cwd: string },
): Promise<{ exitCode: number; stderr: string }> {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const stderrChunks: Buffer[] = [];
    const proc = spawn(cmd, args, { cwd: options.cwd, shell: false });
    proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    proc.on('close', (code) =>
      resolve({ exitCode: code ?? 1, stderr: Buffer.concat(stderrChunks).toString('utf8') }),
    );
  });
}

export interface InstallResult {
  ok: boolean;
  errorCode?: 'OMEM-E40-NO-PACKAGE-MANAGER' | 'OMEM-E41-PLUGIN-INSTALL-FAILED';
  errorMessage?: string;
}

export interface UninstallResult {
  ok: boolean;
  errorCode?: 'OMEM-E43-PLUGIN-NOT-FOUND' | 'OMEM-E44-PLUGIN-UNINSTALL-FAILED';
  errorMessage?: string;
}

/**
 * Installs a plugin package into ~/.omem/node_modules.
 *
 * `packageSpec` can be:
 *   - npm package name: `@omem-adapter/my-adapter`
 *   - name@version: `@omem-adapter/my-adapter@1.0.0`
 *   - local path: `./my-adapter` or `/abs/path/to/my-adapter`
 */
export async function installPlugin(
  packageSpec: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  const run = options.runCommand ?? defaultRunCommand;
  const prefix = pluginDir(options);

  // Ensure the plugin dir exists.
  await mkdir(prefix, { recursive: true });

  const pm = await resolvePackageManager();
  if (pm === null) {
    return {
      ok: false,
      errorCode: 'OMEM-E40-NO-PACKAGE-MANAGER',
      errorMessage:
        'Neither bun nor npm was found in PATH. Install one and retry.',
    };
  }

  let cmd: string;
  let args: string[];

  if (pm === 'bun') {
    // `bun add --cwd ~/.omem/node_modules <spec>` — no, bun uses --cwd for the project root.
    // We use `bun add <spec>` inside the prefix dir, treating it as the project.
    cmd = 'bun';
    args = ['add', packageSpec];
  } else {
    cmd = 'npm';
    args = ['install', '--prefix', prefix, '--no-save', packageSpec];
  }

  const { exitCode, stderr } = await run(cmd, args, { cwd: prefix });

  if (exitCode !== 0) {
    return {
      ok: false,
      errorCode: 'OMEM-E41-PLUGIN-INSTALL-FAILED',
      errorMessage: `'${pm} install ${packageSpec}' exited with code ${exitCode}.\n${stderr.trim()}`,
    };
  }

  return { ok: true };
}

/**
 * Removes a plugin by its package name (e.g. `@omem-adapter/my-adapter`).
 * Looks for the package directory at `~/.omem/node_modules/<pkgName>`.
 */
export async function uninstallPlugin(
  packageName: string,
  options: ResolveHomeOptions = {},
): Promise<UninstallResult> {
  const { access } = await import('node:fs/promises');
  const pkgDir = join(pluginDir(options), packageName);

  try {
    await access(pkgDir);
  } catch {
    return {
      ok: false,
      errorCode: 'OMEM-E43-PLUGIN-NOT-FOUND',
      errorMessage: `Plugin '${packageName}' is not installed (directory not found: ${pkgDir}).`,
    };
  }

  try {
    await rm(pkgDir, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      errorCode: 'OMEM-E44-PLUGIN-UNINSTALL-FAILED',
      errorMessage: `Failed to remove '${pkgDir}': ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
