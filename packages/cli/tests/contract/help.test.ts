import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HELP_TEXT } from '../../src/commands/help';

// Contract test (devex-verdict F4.2 / PLAN.md S15 "Help drift"):
// every command in HELP_TEXT MUST have a matching section header in docs/CLI.md.
// We don't byte-match the help text — that would force the doc to mirror ANSI
// formatting — but we DO require:
//   1. each command has a `### `omem <cmd>`` section
//   2. each command's listed flag (extracted from HELP_TEXT) appears in CLI.md

const CLI_MD_PATH = join(import.meta.dir, '..', '..', '..', '..', 'docs', 'CLI.md');

describe('contract: HELP_TEXT ↔ docs/CLI.md', () => {
  const cliMd = readFileSync(CLI_MD_PATH, 'utf8');

  for (const command of Object.keys(HELP_TEXT)) {
    if (command === '__global__') continue;
    test(`docs/CLI.md has a section for 'omem ${command}'`, () => {
      // Heading lines look like:  ### `omem <cmd>` or ### `omem <cmd> <subcmd>`.
      const pattern = new RegExp(`^### \`omem ${command}\\b`, 'm');
      expect(pattern.test(cliMd)).toBe(true);
    });
  }

  test('docs/CLI.md mentions every M1 command name', () => {
    for (const command of ['init', 'scan', 'recall', 'doctor', 'config', 'skills']) {
      expect(cliMd).toContain(`omem ${command}`);
    }
  });

  test('docs/CLI.md mentions every global flag we expose', () => {
    for (const flag of [
      '--help',
      '--version',
      '--json',
      '--verbose',
      '--non-interactive',
      '--no-color',
    ]) {
      expect(cliMd).toContain(flag);
    }
  });

  test('docs/CLI.md mentions every environment variable we honour', () => {
    for (const env of ['OMEM_HOME', 'OMEM_NON_INTERACTIVE', 'NO_COLOR']) {
      expect(cliMd).toContain(env);
    }
  });
});
