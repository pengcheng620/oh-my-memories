// `@oh-my-memories/adapter-shared` — internal helpers consumed by built-in
// adapters (claude-code, cursor, codex). External SDK users do NOT depend
// on this package; it ships under `packages/adapters/_shared/` rather than
// `packages/adapter-sdk/` for that reason.
//
// Public surface:
//   - streamJsonl           : the §7.2 streaming primitive
//   - JsonlLine             : the tagged-union line type
//   - createParseStats      : factory for the per-scan counter
//   - ParseStats            : the counter shape
//   - isMemoryRole          : type guard for the canonical MemoryRole union
//   - extractTextBlocks     : Anthropic / OpenAI content-block text extractor

export {
  type JsonlLine,
  type ParseStats,
  createParseStats,
  isMemoryRole,
  streamJsonl,
} from './jsonl';
export { extractTextBlocks } from './content';
