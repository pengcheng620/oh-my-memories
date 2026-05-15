import { resolve } from 'node:path';
import { type ResolveHomeOptions, resolveOmemHome } from './home';

// Cross-OS path resolution for the well-known files inside ~/.omem.
//
// All paths are derived from `resolveOmemHome` so OMEM_HOME flows through.
// We use `node:path.resolve` rather than string concatenation because
// `~/.omem` on Windows resolves to e.g. `C:\Users\foo\.omem` and forward
// slashes mid-path break the Windows API consumers we care about.

export function configPath(options: ResolveHomeOptions = {}): string {
  return resolve(resolveOmemHome(options), 'config.json');
}

export function indexPath(options: ResolveHomeOptions = {}): string {
  return resolve(resolveOmemHome(options), 'index.sqlite');
}

export function logsDir(options: ResolveHomeOptions = {}): string {
  return resolve(resolveOmemHome(options), 'logs');
}
