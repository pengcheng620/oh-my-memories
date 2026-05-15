import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listCatalog } from '../../src/output/error-catalog';

// Contract test (devex-verdict F3.4 / PLAN.md S15 "Error catalog drift"):
// every code in ERROR_CATALOG MUST be documented in docs/CLI.md verbatim.
// CI fails the moment a code is added in code without a matching doc entry,
// or a doc row is removed without removing the code.

const CLI_MD_PATH = join(import.meta.dir, '..', '..', '..', '..', 'docs', 'CLI.md');

describe('contract: error catalog ↔ docs/CLI.md', () => {
  const cliMd = readFileSync(CLI_MD_PATH, 'utf8');

  for (const entry of listCatalog()) {
    test(`${entry.code} appears in docs/CLI.md`, () => {
      expect(cliMd).toContain(entry.code);
    });
  }

  test('every OMEM-* code in docs/CLI.md is in the catalog', () => {
    const docCodes = new Set(cliMd.match(/OMEM-[EW]\d{2}-[A-Z][A-Z0-9-]*/g) ?? []);
    const catalogCodes = new Set(listCatalog().map((e) => e.code));
    for (const code of docCodes) {
      expect(catalogCodes.has(code)).toBe(true);
    }
  });
});
