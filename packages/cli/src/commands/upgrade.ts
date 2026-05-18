import { spawn } from 'node:child_process';
import { type OmemError, createOmemError } from '../output/error';
import { writeJsonError, writeJsonResult } from '../output/json';
import { writeTextError } from '../output/table';
import type { CommandContext, CommandHandler } from './types';

// `omem upgrade` (M2.C): a thin self-update helper.
//
// We don't try to detect "am I a global npm install vs. a Bun-compiled binary?"
// at runtime — that's brittle and the answer is often both (npm + a separate
// downloaded binary). Instead we:
//   1. Look up the latest published version on npm.
//   2. Print what action the user (or scripts) should take for each install
//      shape (npm OR binary) so a human reading the output is unambiguously
//      pointed at the right thing.
//   3. With `--apply`, attempt the npm route automatically — that's the only
//      install path we can safely automate from inside the running process.
//
// Spec: design doc M2.C ("`omem upgrade` (npm/binary self-update)").

const PACKAGE_NAME = 'oh-my-memories';
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const RELEASES_URL = 'https://github.com/pengcheng620/oh-my-memories/releases/latest';
const CURRENT_VERSION = '0.1.0-alpha.1';

export const upgrade: CommandHandler = async (ctx: CommandContext): Promise<number> => {
  const args = parseUpgradeArgs(ctx.argv);
  if (!args.ok) return reject(ctx, args.error);

  let latest: { version: string } | null = null;
  let registryError: string | null = null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(REGISTRY_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      registryError = `npm registry returned HTTP ${res.status}`;
    } else {
      const body = (await res.json()) as { version?: string };
      if (typeof body.version !== 'string') {
        registryError = 'npm registry response missing "version"';
      } else {
        latest = { version: body.version };
      }
    }
  } catch (err) {
    const e = err as Error;
    registryError =
      e.name === 'AbortError'
        ? 'npm registry request timed out after 5s'
        : `network error: ${e.message}`;
  } finally {
    clearTimeout(timeoutId);
  }

  const upToDate = latest !== null && compareSemver(latest.version, CURRENT_VERSION) <= 0;

  const result = {
    current: CURRENT_VERSION,
    latest: latest?.version ?? null,
    upToDate,
    registryError,
    npmInstallCommand: latest !== null ? `bun install -g ${PACKAGE_NAME}@${latest.version}` : null,
    binaryReleasesUrl: RELEASES_URL,
    applied: false as boolean,
  };

  if (registryError !== null) {
    if (ctx.flags.json) writeJsonResult(ctx, result);
    else ctx.stdout.write(formatHumanSummary(result));
    return 1;
  }

  if (args.value.check || upToDate) {
    if (ctx.flags.json) writeJsonResult(ctx, result);
    else ctx.stdout.write(formatHumanSummary(result));
    return 0;
  }

  if (args.value.apply) {
    if (latest === null) {
      // Should be unreachable: registryError !== null already returned, and upToDate === true
      // would have returned above. Guard for type narrowing.
      return reject(
        ctx,
        createOmemError({
          code: 'OMEM-E11-IO',
          message: 'Cannot apply: latest version is unknown.',
        }),
      );
    }
    try {
      await runInstall(latest.version);
      result.applied = true;
    } catch (err) {
      return reject(
        ctx,
        createOmemError({
          code: 'OMEM-E11-IO',
          message: `Self-update failed: ${(err as Error).message}`,
          cause: err,
        }),
      );
    }
  }

  if (ctx.flags.json) writeJsonResult(ctx, result);
  else ctx.stdout.write(formatHumanSummary(result));
  return 0;
};

interface UpgradeArgs {
  readonly check: boolean;
  readonly apply: boolean;
}

function parseUpgradeArgs(
  argv: readonly string[],
): { ok: true; value: UpgradeArgs } | { ok: false; error: OmemError } {
  let check = false;
  let apply = false;
  for (const token of argv) {
    if (token === '--check') {
      check = true;
      continue;
    }
    if (token === '--apply') {
      apply = true;
      continue;
    }
    if (token.startsWith('--')) {
      return usage(`Unrecognised flag: '${token}'.`);
    }
    return usage(`Unexpected positional argument: '${token}'.`);
  }
  if (check && apply) {
    return usage("'--check' and '--apply' are mutually exclusive.");
  }
  return { ok: true, value: { check, apply } };
}

function reject(ctx: CommandContext, error: OmemError): number {
  if (ctx.flags.json) writeJsonError(ctx, error);
  else writeTextError(ctx, error);
  if (error.code === 'OMEM-E01-USAGE' || error.code === 'OMEM-E02-UNKNOWN-COMMAND') return 2;
  return 1;
}

function usage(message: string): { ok: false; error: OmemError } {
  return { ok: false, error: createOmemError({ code: 'OMEM-E01-USAGE', message }) };
}

async function runInstall(version: string): Promise<void> {
  return new Promise<void>((resolveInstall, rejectInstall) => {
    const proc = spawn('bun', ['install', '-g', `${PACKAGE_NAME}@${version}`], {
      stdio: 'inherit',
      windowsHide: true,
    });
    proc.on('error', rejectInstall);
    proc.on('close', (code) => {
      if (code === 0) resolveInstall();
      else rejectInstall(new Error(`bun install exited with ${code}`));
    });
  });
}

function compareSemver(a: string, b: string): number {
  // Strip pre-release suffix for the basic compare; we treat all alpha/beta
  // tags as "less than the same base release". Good enough for the upgrade
  // check; not a full semver comparator.
  const parse = (s: string): [number, number, number, string] => {
    const [base, pre = ''] = s.split('-', 2);
    const [maj = '0', min = '0', pat = '0'] = (base ?? '').split('.', 3);
    return [Number(maj) || 0, Number(min) || 0, Number(pat) || 0, pre];
  };
  const [aMaj, aMin, aPat, aPre] = parse(a);
  const [bMaj, bMin, bPat, bPre] = parse(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  if (aPat !== bPat) return aPat - bPat;
  if (aPre === bPre) return 0;
  if (aPre === '') return 1;
  if (bPre === '') return -1;
  return aPre.localeCompare(bPre);
}

function formatHumanSummary(result: {
  current: string;
  latest: string | null;
  upToDate: boolean;
  registryError: string | null;
  npmInstallCommand: string | null;
  binaryReleasesUrl: string;
  applied: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`Current: ${result.current}`);
  if (result.registryError !== null) {
    lines.push(`Could not check for updates: ${result.registryError}`);
    return `${lines.join('\n')}\n`;
  }
  lines.push(`Latest:  ${result.latest}`);
  if (result.upToDate) {
    lines.push('omem is up to date.');
    return `${lines.join('\n')}\n`;
  }
  if (result.applied) {
    lines.push(`Updated to ${result.latest}.`);
    return `${lines.join('\n')}\n`;
  }
  lines.push('A newer version is available.');
  if (result.npmInstallCommand !== null) {
    lines.push(`  npm/bun install:   ${result.npmInstallCommand}`);
  }
  lines.push(`  prebuilt binary:   ${result.binaryReleasesUrl}`);
  lines.push("Re-run with '--apply' to attempt the bun install path automatically.");
  return `${lines.join('\n')}\n`;
}
