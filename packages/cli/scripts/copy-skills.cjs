#!/usr/bin/env node
// Copies the repo-root `skills/` tree into `packages/cli/skills/` so that
// `omem skills install --ide=<ide>` finds them when running from the published
// npm tarball (where the monorepo root is no longer reachable).
//
// We resolve the source from the package's *package.json* location (CWD when
// `npm run` invokes us) and look two levels up to the workspace root.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const cliPackageDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(cliPackageDir, '..', '..');
const sourceSkillsDir = path.join(repoRoot, 'skills');
const targetSkillsDir = path.join(cliPackageDir, 'skills');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else if (entry.isFile()) fs.copyFileSync(srcPath, destPath);
  }
}

if (!fs.existsSync(sourceSkillsDir)) {
  process.stderr.write(`copy-skills: no skills/ at ${sourceSkillsDir}; nothing to copy\n`);
  process.exit(0);
}

if (fs.existsSync(targetSkillsDir)) {
  fs.rmSync(targetSkillsDir, { recursive: true, force: true });
}

copyDir(sourceSkillsDir, targetSkillsDir);

const ides = fs
  .readdirSync(targetSkillsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

process.stdout.write(`copy-skills: ${ides.length} ide(s) copied → ${targetSkillsDir}\n`);
for (const ide of ides) process.stdout.write(`  - ${ide}\n`);
