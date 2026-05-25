import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface EmbeddingConfig {
  enabled: boolean;
  provider: 'local' | 'openai' | 'ollama';
  model: string;
}

export interface OmemConfig {
  sources: string[];
  defaultLimit: number;
  embedding: EmbeddingConfig;
  [key: string]: unknown;
}

const DEFAULT_EMBEDDING: EmbeddingConfig = {
  enabled: false,
  provider: 'local',
  model: 'all-MiniLM-L6-v2',
};

const DEFAULTS: OmemConfig = {
  sources: [],
  defaultLimit: 50,
  embedding: { ...DEFAULT_EMBEDDING },
};

const KNOWN_KEYS: Record<string, { description: string; default: unknown }> = {
  sources: { description: 'Enabled memory sources (adapter ids)', default: [] },
  defaultLimit: { description: 'Default --limit for recall', default: 50 },
  'embedding.enabled': { description: 'Enable semantic search via embeddings', default: false },
  'embedding.provider': {
    description: 'Embedding provider: local (Transformers.js WASM), openai, ollama',
    default: 'local',
  },
  'embedding.model': {
    description: 'Embedding model name (local: all-MiniLM-L6-v2)',
    default: 'all-MiniLM-L6-v2',
  },
};

export function loadConfig(path: string): OmemConfig {
  if (!existsSync(path)) return { ...DEFAULTS, embedding: { ...DEFAULT_EMBEDDING } };
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const embRaw = parsed.embedding as Partial<EmbeddingConfig> | undefined;
    return {
      ...DEFAULTS,
      ...parsed,
      sources: Array.isArray(parsed.sources) ? (parsed.sources as string[]) : DEFAULTS.sources,
      defaultLimit:
        typeof parsed.defaultLimit === 'number' ? parsed.defaultLimit : DEFAULTS.defaultLimit,
      embedding: {
        enabled: embRaw?.enabled === true,
        provider:
          embRaw?.provider === 'openai' || embRaw?.provider === 'ollama'
            ? embRaw.provider
            : 'local',
        model: typeof embRaw?.model === 'string' ? embRaw.model : DEFAULT_EMBEDDING.model,
      },
    };
  } catch {
    return { ...DEFAULTS, embedding: { ...DEFAULT_EMBEDDING } };
  }
}

export function saveConfig(path: string, config: OmemConfig): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function getConfigValue(config: OmemConfig, key: string): unknown {
  if (key.startsWith('embedding.')) {
    const sub = key.slice('embedding.'.length) as keyof EmbeddingConfig;
    return config.embedding?.[sub];
  }
  return config[key];
}

export function setConfigValue(config: OmemConfig, key: string, value: string): OmemConfig {
  const updated: OmemConfig = { ...config, embedding: { ...config.embedding } };
  if (key === 'sources') {
    updated.sources = value.split(',').map((s) => s.trim());
  } else if (key === 'defaultLimit') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) updated.defaultLimit = n;
  } else if (key === 'embedding.enabled') {
    updated.embedding.enabled = value === 'true';
  } else if (key === 'embedding.provider') {
    if (value === 'local' || value === 'openai' || value === 'ollama') {
      updated.embedding.provider = value;
    }
  } else if (key === 'embedding.model') {
    updated.embedding.model = value;
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
  return Object.entries(KNOWN_KEYS).map(([key, meta]) => {
    const current = getConfigValue(config, key);
    return {
      key,
      current,
      default: meta.default,
      source: configExists && current !== meta.default ? ('config' as const) : ('default' as const),
      description: meta.description,
    };
  });
}
