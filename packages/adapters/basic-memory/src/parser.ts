import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';

export interface ParseStats {
  recordCount: number;
  corruptLines: number;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

interface FrontmatterFields {
  title?: string;
  tags?: string[];
  type?: string;
  permalink?: string;
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

function parseFrontmatter(raw: string): { meta: FrontmatterFields; body: string } | null {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) return null;

  const yamlBlock = match[1]!;
  const body = match[2]!;
  const meta: FrontmatterFields = {};

  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    if (key === 'tags' && value.startsWith('[')) {
      try {
        meta.tags = JSON.parse(value) as string[];
      } catch {
        meta.tags = value.replace(/[\[\]]/g, '').split(',').map((t) => t.trim()).filter(Boolean);
      }
    } else {
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      meta[key] = value;
    }
  }

  return { meta, body };
}

export function parseMarkdownNote(
  filePath: string,
  content: string,
  source: string,
  stats: ParseStats,
): MemoryRecord | null {
  const text = content.trim();
  if (!text) return null;

  const parsed = parseFrontmatter(text);
  const body = parsed ? parsed.body.trim() : text;
  if (!body) return null;

  stats.recordCount++;

  const meta = parsed?.meta;
  const title = typeof meta?.title === 'string' ? meta.title : undefined;
  const timestamp = typeof meta?.updated === 'string'
    ? new Date(meta.updated)
    : typeof meta?.created === 'string'
      ? new Date(meta.created)
      : new Date();

  const record: MemoryRecord = {
    id: filePath,
    source,
    timestamp,
    role: 'system',
    text: title ? `# ${title}\n\n${body}` : body,
  };

  if (meta) {
    const metadata: Record<string, unknown> = { path: filePath };
    if (meta.tags) metadata.tags = meta.tags;
    if (meta.type) metadata.noteType = meta.type;
    if (meta.permalink) metadata.permalink = meta.permalink;
    record.metadata = metadata;
  }

  return record;
}
