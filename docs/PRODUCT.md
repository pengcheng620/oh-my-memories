# PRODUCT.md — the thesis

## The wedge

There are two kinds of memory tools today:

1. **Engines** — they store memory. mem0, Letta, Zep, Cognee, Serena MCP, basic-memory.
2. **Built-in memory** — every AI IDE has its own: Claude Code (`~/.claude/projects/`), Cursor (`~/.cursor/projects/`), Codex (`~/.codex/sessions/`), Gemini CLI, Copilot, OpenClaw, ...

The engines fight each other for the "best storage" award. Meanwhile, the actual user pain is **fragmentation**: a developer using 3-4 AI tools has memory in 7+ places, and **no single agent can see across them**. Cursor doesn't know `~/.claude/` exists. Claude Code doesn't query mem0. Each tool's agent gives up the moment its native search returns nothing.

**oh-my-memories is not a 13th engine.** We are the **management layer** that makes the existing 12 visible to every agent. We win on integration breadth, not retrieval cleverness. Once we own the management layer, building our own engine (for tools that lack one — Cursor, Codex, Gemini) becomes Layer 2; integrating third-party SaaS engines (mem0, Letta) becomes Layer 3.

## 3 Layers × 2 Things

|                      | **Thing 1**: Cross-tool migration & recall | **Thing 2**: Our own memory design |
|----------------------|-----|-----|
| **Cat A — AI IDEs**  | Adapters for CC, Cursor, Codex, Gemini, Copilot, OpenClaw | (n/a — they have native memory) |
| **Cat B — 3rd-party MCP**  | Adapters for Serena, basic-memory, mem0 (when used as MCP) | (n/a) |
| **Layer 2 — Our engine**  | (n/a — we are the destination, not a source) | SQLite + FTS5 + sqlite-vec; serves Cursor / Codex / Gemini / OpenClaw which have weak native memory |

**M1 priority**: Cat A × Thing 1 (the most painful, most visible problem).

## Why this wins

| Force | Why it works for us |
|----|----|
| **Network effect of fragmentation** | Every new AI tool that ships its own memory is a new adapter for us. Our value compounds. |
| **Asymmetric switching cost** | Once you've used `omem migrate --from cc --to cursor`, you cannot tolerate going back to "I have to manually copy files between tools" |
| **mem0 / Letta cannot do this** | They are engines. Adding adapters for 12 AI IDEs is a complete pivot for them. |
| **IDEs cannot do this** | Cursor will not write a Claude Code reader. We are vendor-neutral by design. |

## Why we delayed our own engine

The first 6 months we are vendor-neutral. We do not become "the omem engine that you should pick instead of mem0." We are the layer that **makes mem0 visible to your Cursor agent**, alongside everything else.

After M3 we ship our own engine. By then we have (a) the trust of having shipped management-layer features that work, (b) telemetry on what users actually federate, (c) a clear product wedge (we serve the agents that don't have a memory home).

## What we explicitly are not

- **Not a vector database.** We use embeddings (M3+) but we are not Pinecone / Weaviate.
- **Not an agent framework.** We do not orchestrate LLMs. We give them better memory.
- **Not a RAG platform.** RAG indexes documents. We index conversations and explicit memories.
- **Not a SaaS by default.** Local-first, your data on your disk. SaaS is a deploy target if a team needs it later.

## The reverse-narrative test

If we are right, in 12 months a developer says:
> "I just installed Cursor, and it found my Claude Code history from last year. How is that working?"
> "Oh, that's omem. It's been managing my memories since I switched to multi-tool last year."

If we are wrong, the same developer says:
> "I installed mem0 in Cursor like everyone else. Why would I want a separate memory hub?"

We bet on the first sentence. The market signal that confirms us: a developer with 3+ AI tools who has been bitten by the fragmentation, not a developer choosing their first memory engine.
