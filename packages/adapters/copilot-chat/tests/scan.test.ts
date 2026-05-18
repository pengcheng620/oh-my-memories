import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { MemoryRecord } from '@oh-my-memories/adapter-sdk';
import { CopilotChatAdapter } from '../src/index';

const FIXTURES = resolve(import.meta.dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'copilot-chat');

async function collectAll(iter: AsyncIterable<MemoryRecord>): Promise<MemoryRecord[]> {
  const out: MemoryRecord[] = [];
  for await (const r of iter) out.push(r);
  return out;
}

describe('CopilotChatAdapter.scan', () => {
  let tmpHome: string;
  let dataDir: string;
  let chatDir: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'omem-copilot-scan-'));
    dataDir = join(tmpHome, 'Code', 'User');
    chatDir = join(dataDir, 'workspaceStorage', 'abc123hash', 'chatSessions');
    mkdirSync(chatDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('parses JSONL session with base + incremental ops', async () => {
    copyFileSync(join(FIXTURES, 'session-a.jsonl'), join(chatDir, 'abc-123.jsonl'));
    const adapter = new CopilotChatAdapter({ dataDirs: [dataDir] });
    const records = await collectAll(adapter.scan());

    // 2 requests * 2 roles (user + assistant) = 4 records
    expect(records).toHaveLength(4);
    expect(records[0]!.role).toBe('user');
    expect(records[0]!.text).toContain('JWT refresh tokens');
    expect(records[0]!.source).toBe('copilot-chat');

    expect(records[1]!.role).toBe('assistant');
    expect(records[1]!.text).toContain('refresh token securely');

    // Second request was pushed via kind=2
    expect(records[2]!.role).toBe('user');
    expect(records[2]!.text).toContain('token rotation');

    expect(records[3]!.role).toBe('assistant');
    expect(records[3]!.text).toContain('rotateToken');
  });

  it('applies kind=1 set operation (customTitle update)', async () => {
    copyFileSync(join(FIXTURES, 'session-a.jsonl'), join(chatDir, 'abc-123.jsonl'));
    const adapter = new CopilotChatAdapter({ dataDirs: [dataDir] });
    const records = await collectAll(adapter.scan());

    // After kind=1 set, title should be "JWT auth patterns" (not the original)
    expect(records[0]!.metadata?.title).toBe('JWT auth patterns');
  });

  it('parses legacy JSON format', async () => {
    copyFileSync(join(FIXTURES, 'session-b.json'), join(chatDir, 'def-456.json'));
    const adapter = new CopilotChatAdapter({ dataDirs: [dataDir] });
    const records = await collectAll(adapter.scan());

    expect(records).toHaveLength(2);
    expect(records[0]!.text).toContain('React hooks');
    expect(records[1]!.text).toContain('functional components');
  });

  it('handles corrupt JSONL lines without throwing', async () => {
    copyFileSync(join(FIXTURES, 'corrupt.jsonl'), join(chatDir, 'bad.jsonl'));
    const adapter = new CopilotChatAdapter({ dataDirs: [dataDir] });
    const records = await collectAll(adapter.scan());

    // 2 valid requests (base + pushed), corrupt line skipped
    expect(records).toHaveLength(4);
    expect(adapter.stats.corruptLines).toBe(1);
  });

  it('returns empty when no chatSessions found', async () => {
    const emptyDir = join(tmpHome, 'Empty', 'User');
    mkdirSync(join(emptyDir, 'workspaceStorage', 'hash1'), { recursive: true });
    const adapter = new CopilotChatAdapter({ dataDirs: [emptyDir] });
    const records = await collectAll(adapter.scan());
    expect(records).toHaveLength(0);
  });

  it('scans multiple workspace hashes', async () => {
    const chatDir2 = join(dataDir, 'workspaceStorage', 'def456hash', 'chatSessions');
    mkdirSync(chatDir2, { recursive: true });
    copyFileSync(join(FIXTURES, 'session-a.jsonl'), join(chatDir, 'abc-123.jsonl'));
    copyFileSync(join(FIXTURES, 'session-b.json'), join(chatDir2, 'def-456.json'));

    const adapter = new CopilotChatAdapter({ dataDirs: [dataDir] });
    const records = await collectAll(adapter.scan());

    // 4 from session-a + 2 from session-b = 6
    expect(records).toHaveLength(6);
    expect(adapter.stats.totalFiles).toBe(2);
  });
});
