# @oh-my-memories/core

Storage engine, retrieval, and federation for oh-my-memories.

## What lives here

- **`inventory.ts`** — runs `detect()` on each adapter, returns what's present
- **`federation.ts`** — `recall()` query across multiple adapters; M1 = naive term scoring + recency tiebreak; M3 = SQLite FTS5 + sqlite-vec + RRF
- **`canonical-store.ts`** (M3+) — persistent index of records normalized from all sources
- **`retrieval.ts`** (M3+) — full BM25 + vector hybrid query

This package is **library-only**. No CLI, no MCP, no I/O outside what adapters provide.

## Why no SQLite in M1

M1 ships a streaming federated query (read each adapter's source on every recall). Slow but correct. M3 introduces the persistent canonical store so recall is fast and supports semantic search. See `docs/ROADMAP.md`.
