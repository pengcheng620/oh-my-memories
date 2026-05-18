import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CopilotChatAdapter } from '../src/index';

describe('CopilotChatAdapter.detect', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'omem-copilot-detect-'));
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('returns present=true when workspaceStorage exists', async () => {
    const dataDir = join(tmpHome, 'Code', 'User');
    mkdirSync(join(dataDir, 'workspaceStorage'), { recursive: true });
    const adapter = new CopilotChatAdapter({ dataDirs: [dataDir] });
    const result = await adapter.detect();
    expect(result.present).toBe(true);
  });

  it('returns present=false when workspaceStorage does not exist', async () => {
    const dataDir = join(tmpHome, 'Code', 'User');
    mkdirSync(dataDir, { recursive: true });
    const adapter = new CopilotChatAdapter({ dataDirs: [dataDir] });
    const result = await adapter.detect();
    expect(result.present).toBe(false);
  });
});
