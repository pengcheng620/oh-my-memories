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

// Single source of truth for the L2 canonical store location. Used by
// `omem remember`, `omem recall`, `omem doctor`. Spec: m3 §6.
export function canonicalDbPath(options: ResolveHomeOptions = {}): string {
  return resolve(resolveOmemHome(options), 'canonical.db');
}

export function logsDir(options: ResolveHomeOptions = {}): string {
  return resolve(resolveOmemHome(options), 'logs');
}

// Root for adapter plugin packages, modelled as a private node_modules tree.
// Layout: ~/.omem/node_modules/@omem-adapter/<adapter-name>/
export function pluginDir(options: ResolveHomeOptions = {}): string {
  return resolve(resolveOmemHome(options), 'node_modules');
}
