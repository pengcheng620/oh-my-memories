import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface OmemConfig {
  sources: string[];
  defaultLimit: number;
  [key: string]: unknown;
}

const DEFAULTS: OmemConfig = {
  sources: [],
  defaultLimit: 50,
};

const KNOWN_KEYS: Record<string, { description: string; default: unknown }> = {
  sources: { description: 'Enabled memory sources (adapter ids)', default: [] },
  defaultLimit: { description: 'Default --limit for recall', default: 50 },
};

export function loadConfig(path: string): OmemConfig {
  if (!existsSync(path)) return { ...DEFAULTS };
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      ...DEFAULTS,
      ...parsed,
      sources: Array.isArray(parsed.sources) ? (parsed.sources as string[]) : DEFAULTS.sources,
      defaultLimit:
        typeof parsed.defaultLimit === 'number' ? parsed.defaultLimit : DEFAULTS.defaultLimit,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(path: string, config: OmemConfig): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function getConfigValue(config: OmemConfig, key: string): unknown {
  return config[key];
}

export function setConfigValue(config: OmemConfig, key: string, value: string): OmemConfig {
  const updated = { ...config };
  if (key === 'sources') {
    updated.sources = value.split(',').map((s) => s.trim());
  } else if (key === 'defaultLimit') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) updated.defaultLimit = n;
  } else {
    updated[key] = value;
  }
  return updated;
}

export interface ConfigListEntry {
  key: string;
  current: unknown;
  default: unknown;
  source: 'config' | 'default';
  description: string;
}

export function listConfig(config: OmemConfig, configExists: boolean): ConfigListEntry[] {
  return Object.entries(KNOWN_KEYS).map(([key, meta]) => ({
    key,
    current: config[key],
    default: meta.default,
    source:
      configExists && config[key] !== meta.default ? ('config' as const) : ('default' as const),
    description: meta.description,
  }));
}
