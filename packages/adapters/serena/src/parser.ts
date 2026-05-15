// Parser scope (PLAN.md §2 Lane D, spec §3.1):
//   - Serena memory files are Markdown with OPTIONAL YAML frontmatter.
//   - Real-world layout (sampled from a working Serena install) is mostly
//     plain `# Title` + body — frontmatter is supported but rare.
//   - We never stream — Serena memory files are small (KB-range hand-written
//     notes). One file = one record, read fully into memory.
//   - On malformed frontmatter (unclosed `---` block or unparseable YAML
//     key/value lines): we DO NOT crash. We treat the entire file as plain
//     markdown body and increment a corruptLines counter exposed via the
//     adapter's lastScanStats side channel. PLAN.md §2 Lane D substitutes
//     this for Cat A's JSONL `corrupt.test.ts` resilience contract.
//   - Schema-version policy: serena/2026-05. Unknown frontmatter keys are
//     surfaced verbatim on metadata so future Serena versions can layer
//     fields without breaking downstream consumers.

export interface ParsedMemory {
  /** YAML frontmatter (subset we successfully parsed). Empty if absent / malformed. */
  frontmatter: Record<string, unknown>;
  /** Markdown body (everything after a closing `---`, or whole file if no frontmatter / malformed). */
  body: string;
  /** Title to surface on metadata: frontmatter.title > first `# heading` > undefined. */
  title?: string;
  /** True iff the file declared a frontmatter block but it could not be cleanly parsed. */
  malformed: boolean;
}

const FRONTMATTER_OPEN = /^---\r?\n/;

export function parseMarkdown(raw: string): ParsedMemory {
  // Fast path: no leading frontmatter fence.
  if (!FRONTMATTER_OPEN.test(raw)) {
    return finalize({ frontmatter: {}, body: raw, malformed: false });
  }

  // Strip the opening fence and look for the closing one.
  const afterOpen = raw.replace(FRONTMATTER_OPEN, '');
  const closeMatch = afterOpen.match(/\r?\n---\r?\n/);

  // No closing fence — the file declared frontmatter but never terminated it.
  // Per the malformed-frontmatter test contract: emit the file untouched as
  // body and flag malformed=true. We deliberately keep the opening `---` so
  // downstream consumers can see the original document.
  if (!closeMatch || closeMatch.index === undefined) {
    return finalize({ frontmatter: {}, body: raw, malformed: true });
  }

  const yamlBlock = afterOpen.slice(0, closeMatch.index);
  const body = afterOpen.slice(closeMatch.index + closeMatch[0].length);

  const parsed = parseYamlBlock(yamlBlock);
  return finalize({
    frontmatter: parsed.values,
    body,
    malformed: parsed.malformed,
  });
}

function finalize(p: Omit<ParsedMemory, 'title'>): ParsedMemory {
  const fmTitle = p.frontmatter.title;
  const title =
    typeof fmTitle === 'string' && fmTitle.length > 0 ? fmTitle : extractFirstHeading(p.body);
  if (title === undefined) return p;
  return { ...p, title };
}

function extractFirstHeading(body: string): string | undefined {
  // Match a leading `# Heading` (allow leading blank lines / whitespace).
  // We deliberately stop at the first heading — sub-headings (`##`) are body.
  const m = body.match(/^[\s]*#\s+(.+?)\s*$/m);
  return m ? m[1] : undefined;
}

interface YamlParseResult {
  values: Record<string, unknown>;
  malformed: boolean;
}

// Hand-rolled mini-parser: enough YAML for `title: x`, `tags: [a, b, c]`,
// `date: 2026-04-02`, and `key: "quoted"`. Anything fancier (block scalars,
// nested maps, anchors) is out of scope for M1 — Serena memories don't use
// them in the wild. If a line is sufficiently weird we flip `malformed=true`
// but keep the parsed-so-far map; downstream still gets best-effort metadata.
function parseYamlBlock(yaml: string): YamlParseResult {
  const values: Record<string, unknown> = {};
  let malformed = false;

  const lines = yaml.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue; // skip blanks + comments

    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) {
      // Line in a frontmatter block that doesn't look like `key: value` is
      // suspicious — flag malformed and skip it so we still surface what we can.
      malformed = true;
      continue;
    }
    const key = m[1] as string;
    const rawValue = (m[2] ?? '').trim();
    const parsedValue = parseScalar(rawValue);
    if (parsedValue.malformed) malformed = true;
    values[key] = parsedValue.value;
  }

  return { values, malformed };
}

interface ParsedScalar {
  value: unknown;
  malformed: boolean;
}

function parseScalar(raw: string): ParsedScalar {
  if (raw.length === 0) return { value: '', malformed: false };

  // Quoted strings: "foo" or 'foo' — strip quotes verbatim.
  if (
    (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
    (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
  ) {
    return { value: raw.slice(1, -1), malformed: false };
  }

  // Inline arrays: [a, b, c]. Must close on the same line — multi-line
  // arrays are out of scope for M1 and are flagged malformed.
  if (raw.startsWith('[')) {
    if (!raw.endsWith(']')) return { value: raw, malformed: true };
    const inner = raw.slice(1, -1).trim();
    if (inner.length === 0) return { value: [], malformed: false };
    const items = inner.split(',').map((s) => s.trim());
    return { value: items, malformed: false };
  }

  // Numeric: best-effort int/float parse; fall back to string if NaN.
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isNaN(n)) return { value: n, malformed: false };
  }

  // Booleans (YAML 1.1 truthy/falsy short list — keep tight).
  if (raw === 'true') return { value: true, malformed: false };
  if (raw === 'false') return { value: false, malformed: false };

  // Otherwise: bare string.
  return { value: raw, malformed: false };
}
