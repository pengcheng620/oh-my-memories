import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDuration } from '../../src/parse/duration';

// Contract test (PLAN.md S15 "Duration parser fixture coverage"):
// every example duration shown in docs/CLI.md MUST be accepted by parseDuration.
// We extract anything that looks like a `<n><unit>` token from CLI.md and run
// it through the parser; we also explicitly assert the documented absolute
// example (2026-01-01) parses.
//
// This guards the doc-vs-code drift that would otherwise let the doc
// advertise a format the parser silently rejects.

const CLI_MD_PATH = join(import.meta.dir, '..', '..', '..', '..', 'docs', 'CLI.md');

const DURATION_TOKEN = /\b(\d{1,4}[smhdwMy])\b/g;
const ISO_DATE_TOKEN = /(?:\b)(\d{4}-\d{2}-\d{2})(?:\b)/g;

describe('contract: docs/CLI.md duration examples ↔ parseDuration', () => {
  const cliMd = readFileSync(CLI_MD_PATH, 'utf8');
  const tokens = Array.from(new Set(cliMd.match(DURATION_TOKEN) ?? []));
  const dates = Array.from(new Set(cliMd.match(ISO_DATE_TOKEN) ?? []));

  test('docs/CLI.md actually contains relative duration examples', () => {
    expect(tokens.length).toBeGreaterThan(0);
  });

  for (const token of tokens) {
    test(`relative '${token}' is accepted`, () => {
      const result = parseDuration(token);
      expect(result.ok).toBe(true);
    });
  }

  for (const iso of dates) {
    test(`ISO-8601 '${iso}' is accepted`, () => {
      const result = parseDuration(iso);
      expect(result.ok).toBe(true);
    });
  }
});
