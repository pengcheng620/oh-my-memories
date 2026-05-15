import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import type { CommandContext, CommandHandler } from './types';

const SUPPORTED_IDES: ReadonlySet<string> = new Set(['claude-code', 'cursor', 'codex']);

// Target directories where each IDE looks for skills.
const IDE_SKILL_TARGETS: Record<string, string> = {
  'claude-code': '.claude/skills',
  cursor: '.cursor/skills',
  codex: '.codex/skills',
};

export const skills: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  if (ctx.argv[0] !== 'install') {
    return usage(ctx, 'Usage: omem skills install --ide=<ide>');
  }

  const tail = ctx.argv.slice(1);
  let ide: string | undefined;
  for (let i = 0; i < tail.length; i++) {
    const token = tail[i] as string;
    if (token === '--ide' || token.startsWith('--ide=')) {
      const value = token.startsWith('--ide=') ? token.slice('--ide='.length) : tail[i + 1];
      if (value === undefined || value === '') {
        return usage(ctx, "Missing value for '--ide'.");
      }
      ide = value.toLowerCase();
      if (!token.startsWith('--ide=')) i += 1;
      continue;
    }
    return usage(ctx, `Unrecognised flag: '${token}'.`);
  }
  if (ide === undefined) {
    return usage(ctx, "Missing required flag '--ide'.");
  }
  if (!SUPPORTED_IDES.has(ide)) {
    return usage(ctx, `Unsupported IDE '${ide}'. Use one of: ${[...SUPPORTED_IDES].join(', ')}.`);
  }

  // Locate the bundled SKILL.md for this IDE. In the monorepo, it lives at
  // `skills/<ide>/SKILL.md` relative to the repo root. When published to npm,
  // it will live inside the package at the same relative location.
  const skillSource = resolveSkillSource(ide);
  if (!existsSync(skillSource)) {
    const error = createOmemError({
      code: 'OMEM-E11-IO',
      message: `Bundled skill file not found for '${ide}' at ${skillSource}.`,
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }

  const targetDir = IDE_SKILL_TARGETS[ide];
  if (targetDir === undefined) {
    const error = createOmemError({
      code: 'OMEM-E11-IO',
      message: `No skill target directory configured for '${ide}'.`,
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }

  const cwd = process.cwd();
  const targetPath = resolve(cwd, targetDir, 'oh-my-memories', 'SKILL.md');
  const targetDirFull = dirname(targetPath);

  try {
    if (!existsSync(targetDirFull)) mkdirSync(targetDirFull, { recursive: true });
    const content = readFileSync(skillSource, 'utf8');
    writeFileSync(targetPath, content, 'utf8');
  } catch (err) {
    const error = createOmemError({
      code: 'OMEM-E04-PERM',
      message: `Failed to write skill file: ${err instanceof Error ? err.message : String(err)}`,
    });
    if (ctx.flags.json) writeJsonError(ctx, error);
    else writeTextError(ctx, error);
    return 1;
  }

  if (ctx.flags.json) {
    writeJsonResult(ctx, {
      command: 'skills install',
      ide,
      installed: true,
      path: targetPath,
    });
  } else {
    ctx.stdout.write(`Installed oh-my-memories skill for ${ide}\n`);
    ctx.stdout.write(`  ${targetPath}\n`);
  }
  return 0;
};

function resolveSkillSource(ide: string): string {
  // Walk up from this file to find the monorepo root (contains skills/).
  // In the monorepo: packages/cli/src/commands/skills.ts → ../../../../skills/<ide>/SKILL.md
  // We use a more robust approach: look for the skills dir relative to known anchors.
  const candidates = [
    join(__dirname, '..', '..', '..', '..', 'skills', ide, 'SKILL.md'),
    join(process.cwd(), 'skills', ide, 'SKILL.md'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] as string;
}

function usage(ctx: CommandContext, message: string): number {
  const err = createOmemError({ code: 'OMEM-E01-USAGE', message });
  if (ctx.flags.json) writeJsonError(ctx, err);
  else writeTextError(ctx, err);
  return 2;
}
