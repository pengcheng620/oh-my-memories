import { homedir } from 'node:os';
import { resolve } from 'node:path';

// Resolves the omem home directory.
//
// Per spec.md §6.3 + devex-verdict F6.3: the OMEM_HOME env var, when set,
// fully overrides the default path (`~/.omem`). This makes test fixtures and
// containerised installs trivial — no global state mutation required.
//
// The function is pure given an env object so tests can pin behaviour without
// touching process.env, which would race with parallel suites.

export interface ResolveHomeOptions {
  /** Defaults to process.env. Tests pass a frozen object. */
  readonly env?: NodeJS.ProcessEnv;
  /** Override homedir() — used by tests on Windows where `~` differs. */
  readonly homeDir?: () => string;
}

export function resolveOmemHome(options: ResolveHomeOptions = {}): string {
  const env = options.env ?? process.env;
  const override = env.OMEM_HOME;
  if (override !== undefined && override.trim().length > 0) {
    return resolve(override);
  }
  const home = (options.homeDir ?? homedir)();
  return resolve(home, '.omem');
}
