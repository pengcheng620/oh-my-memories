# D. Market Scan — AI Memory Systems & Personal Knowledge Hubs

> Date: 2026-05-14  
> Depth: medium  
> Spec ref: ../specs/spec.md  

## TL;DR — Landscape Map

The space splits cleanly along two axes: **who it's for** (solo knowledge worker vs. product team shipping an LLM app) and **what it is** (drop-in library/service vs. end-user product). **loci v2** sits in the **solo power-user × local CLI/MCP tool** quadrant: it is neither a hosted notes app nor a general-purpose agent-memory SDK, but a **Windows-friendly, privacy-local router** that **federates memories already trapped in IDE-specific folders** (Claude Code, Codex, Cursor, Serena, etc.). Most incumbents optimize for *one* client, *one* datastore, or *cloud* features—few ship a **first-class adapter model for rival editors' on-disk formats** with explicit **get/post/migrate** semantics. Stars and “last updated” figures below are **indicative** from public GitHub and docs as of the scan date; treat order-of-magnitude as the signal, not exact league tables.

**ASCII map (conceptual)**

```
                    end-user product
                         ^
            Mem, Reflect, Tana, Pieces
                         |
library  <- - - - - - - o - - - - - - ->  IDE-native (Cursor, Codex, Claude Code)
                         |
            mem0, Letta, Zep/Graphiti, Cognee
                         |
                    power-user / dev infra
```

---

## D.1 Open-source AI memory frameworks

### 1. mem0 (`mem0ai/mem0`)

**What it is:** A popular “universal memory layer” for AI agents—Python + TypeScript SDKs, optional hosted service, hybrid retrieval (semantic + keyword + entities), LLM-assisted fact extraction, and active integrations (incl. coding-agent ecosystems per their docs/marketing). **Indicative scale:** on the order of **50k+** GitHub stars; very active 2025–2026 commits and releases.

**Who uses it:** Teams embedding memory into assistants and agents; not packaged as a personal “remember CLI” but easy to adopt in apps.

**What it does well:** Productized memory API, hybrid search, strong ecosystem gravity, clear docs for developers.

**Gaps vs. loci v2:** Not oriented around **read-only adapters** to **Cursor agent-transcripts**, **Codex `~/.codex/memories`**, **Serena `.serena/memories`**, or a **markdown palace** spec like loci’s—those are integration *you* would still build on top. Cloud and LLM-centric extraction conflict with loci’s “no auto summarization / offline-first” M1–M4 posture unless you fork behavior.

**Overlap / complement:** **Complement** if you ever want extraction/reranking algorithms; **overlap** only if loci v2 reinvents a full mem0-style pipeline instead of staying a thin federating hub.

---

### 2. Letta (formerly MemGPT, `letta-ai/letta`)

**What it is:** Research-rooted **stateful agent platform**: memory blocks, self-editing context, long-horizon conversations, SDKs (Python/TS), and **Letta Code** as a memory-forward coding agent path.

**Indicative scale:** **~20k+** stars; Apache-2.0; releases through early 2026.

**Who uses it:** Developers building agents with explicit memory tooling; researchers and vendors building “agents that remember.”

**What it does well:** Strong **memory hierarchy** metaphor (in-context vs. archival), tooling for agent-authored edits, serious research lineage.

**Gaps:** Again, not a personal **cross-IDE filesystem federation** layer; operational footprint and product goals assume **Letta-managed** memory, not scraped rival editors.

**Overlap / complement:** **Complement** for ideas (memory blocks, quotas); **low overlap** on the specific “adapter to Codex/Cursor paths” problem.

---

### 3. Graphiti (Zep ecosystem, `getzep/graphiti`)

**What it is:** **Temporal / dynamic knowledge-graph** substrate for agent memory—episodes, provenance, hybrid search (semantic + full-text + graph), open-sourced as a library.

**Indicative scale:** **high tens of thousands** of stars on the Graphiti repo in public listings; extremely active in 2026.

**What it does well:** **Time-aware facts**, rich relationship queries, serious architecture write-ups and OSS traction.

**Gaps:** loci spec explicitly says **not a knowledge graph product**; adopting Graphiti would **scope-creep** unless L1 stays markdown + index.

**Overlap / complement:** **Complement** for **temporal provenance** inspiration; **architectural overlap** only if v2 abandons its stated non-graph positioning.

---

### 4. Zep (`getzep/zep`)

**What it is:** End-to-end **context engineering / memory platform** (OSS core ~**4–5k** stars on main repo per public counters—smaller than Graphiti—but vendor-backed, multi-language SDKs, cloud positioning).

**What it does well:** Opinionated platform, latency-focused marketing, integrates graph concepts with ingestion pipelines.

**Gaps:** Enterprise/agent-runtime framing; not targeting loci’s **personal, local-only, multi-editor** niche out of the box.

**Overlap / complement:** **Complement** as a **service blueprint** (connectors + hybrid retrieval); **not a substitute** for IDE path adapters without custom work.

---

### 5. MemoryGPT

**What it is:** **Fragmented brand**: (a) **MemGPT** research lineage now expressed primarily through **Letta**; (b) assorted GitHub repos and domains (`memorygpt.io`, forks) with uneven maintenance; some “MemoryGPT” repos show **occasional 2026** activity, others are legacy.

**Relevance:** As a **coherent competitor to loci v2**, **low**—the field has moved to **mem0 / Letta / Zep/Graphiti**. Worth citing only as **history**.

**Overlap / complement:** **None direct.**

---

### 6. LangGraph / LangChain memory primitives

**What it is:** **Checkpointers** persist graph execution state (threads, time-travel, fault tolerance); separate **short/long-term memory** patterns in docs (`InMemorySaver`, SQLite/Postgres/Redis/DynamoDB backends, **memory store** APIs for name-spaced keys).

**Who uses it:** Application authors on LangGraph.

**What it does well:** **Transactional durability** of agent *state machines*, excellent ops story.

**Gaps:** Memory = **orchestration state + scratchpad**, not “my Cursor transcripts + Serena markdown.” No built-in **IDE pack**.

**Overlap / complement:** **Complement—patterns to steal:** namespaced memory records, pluggable durable backends, thread IDs map conceptually to “repos” or “palaces.”

---

### 7. Cognee (`topoteretes/cognee`)

**What it is:** **Knowledge engine** for agent memory: ingest many formats, build graphs, vector+relational+graph stores; pitches local-first SQLite stacks; **~10k+** stars; active **2026** releases (e.g., v1.0.x line).

**What it does well:** **Ingestion breadth**, hybrid graph-vector retrieval modes, pragmatic OSS velocity.

**Gaps:** Aimed at **data+agent pipelines**, not “first normalize five IDE memory folders.” Heavy emphasis on graph/cognify flows vs. loci’s restrained L1.

**Overlap / complement:** **Complement**; could subsume scope if you let it—**guardrails needed** to avoid becoming Cognee-lite.

---

### 8. Sherpa / MemoryBank / academic lines

- **MemoryBank (2023 paper, SiliconFriend line):** Forgetting-curve inspired long-term chat memory; academically influential; codebases exist but are not standardized commercial products.
- **`feelingsonice/MemoryBank` (tooling):** SQLite-backed, multi-agent-CLI oriented memory—interesting **provenance** precedent; check freshness per-repo.
- **Sherpa (`sherpa_ai.memory`):** Beliefs/shared memory structures for agent frameworks—good **schema** ideas (events vs. facts).

**Overlap / complement:** **Complement**—steal **decay / confidence** metaphors, not the code wholesale.

---

### D.1 Summary table

| Project     | Stars (indicative) | Last active (scan) | Language focus | Audience        | vs. loci v2 |
|------------|-------------------|--------------------|----------------|-----------------|-------------|
| mem0       | very high (~50k+) | 2026               | Py/TS          | App developers  | Complement  |
| Letta      | high (~20k+)      | 2026               | Py/TS/CLI      | Agent builders  | Complement  |
| Graphiti   | very high         | 2026               | Graph engine   | Agent infra     | Complement  |
| Zep        | medium (~5k)      | 2026               | Platform       | Teams/vendors   | Complement  |
| MemoryGPT  | fragmented        | mixed              | n/a            | Legacy/misc     | Negligible  |
| LangGraph  | ecosystem         | 2026               | Py/JS          | App devs        | Complement  |
| Cognee     | high (~10k+)      | 2026               | Py             | Agent devs      | Complement  |
| MemoryBank/Sherpa | low–mid   | mixed              | Py             | Research/tools  | Ideas only  |

---

## D.2 Personal knowledge / memory products (end-user)

### 1. Obsidian + AI plugins (Smart Connections, Copilot variants)

**Product:** Local markdown vault; **Smart Connections** = local embeddings, semantic links, graph view (2026 **4.3.x** releases). Third-party Copilot-style plugins add LLM chat over notes.

**Pricing:** Obsidian **free** personal; plugins vary (**donations / optional paid** tiers depending on author).

**AI memory across IDEs?** **No**—it's **editor-centric** around the vault, not Codex/Cursor transcripts natively.

**External API?** **Indirect**—Obsidian APIs are plugin-local; not a generic HTTP memory bus.

**vs. loci v2:** **Adjacent PKM**; loci could **import/export markdown** (spec Tier 3), not compete on note UX.

---

### 2. Logseq + AI plugins

**Product:** Outliner + graph; many **community AI plugins** (AssistSeq, Copilot-style, some with MCP hooks).

**Pricing:** **Free** core; plugins vary.

**Cross-IDE memory?** **No native** IDE federation.

**API?** Plugin-dependent; no standard loci-like `get/post` across tools.

**vs. loci v2:** Same—**possible future adapter**, not current competitor.

---

### 3. Reflect.app

**Product:** Polished **networked notes** with AI; **~$10/mo** class pricing (annual discounts reported); **REST API** exists but is **append-only / limited** because of encryption model.

**Cross-IDE?** **No.**

**vs. loci v2:** **Hosted SaaS** vs. **local hub**—opposite privacy stance.

---

### 4. Mem.ai

**Product:** AI-native notes + search; **Pro ~$12/mo** with **API keys** on paid tier (per public pricing pages).

**Cross-IDE?** **No**—Mem is the IDE for notes.

**vs. loci v2:** Could ingest exports, but **not** a Windows multi-editor shim.

---

### 5. Heyday

**Product:** Browser-centric AI resurfacing; **reported shuttered ~2025** after funding/monetization struggles (secondary sources + tool graveyard pages).

**vs. loci v2:** **Cautionary tale**—personal memory SaaS without durable moat struggles.

---

### 6. Rewind.ai / Limitless lineage

**Product:** **Mac-first** “record everything” memory; pricing commonly cited **~$19/mo** class. Industry chatter claims **strategic shifts / acquisitions** in 2024–2026 window—verify before relying on a specific SKU name.

**Windows?** **Historically poor fit** for lup’s primary OS.

**vs. loci v2:** **Screen/session capture** ≠ **structured adapter federation**; privacy threat model differs.

---

### 7. Pieces.app

**Product:** **OS-level developer memory**—captures workflow across apps, long-retention “memory assistant,” local-first options + paid cloud models (**Pro ~$19/mo** commonly reported).

**Cross-IDE?** **Yes, in spirit**—aims to span tools a developer uses.

**Open API?** Product has integrations; **not** an open, documented federation bus equivalent to spec’s `MemoryAdapter` roster—treat as **proprietary hub**.

**vs. loci v2:** **Closest product competitor** for “developer memory,” but **closed product** vs. **user-owned paths + MCP**.

---

### 8. Saner.ai / Tana

**Saner.ai:** “Second brain” workspace with unify/search; **free + ~$10/mo** tiers reported; **cloud** positioning.

**Tana:** Outliner with **AI credits** pricing (~**$0 / $10 / $18** tiers); deep structure for power users.

**Cross-IDE memory?** **No**—they want to be the primary canvas.

**API?** Limited compared to developer-hub needs.

**vs. loci v2:** **Workflow competitors** for attention, not technical substitutes for adapter+MCP goals.

---

## D.3 IDE-native AI memory

### 1. Cursor “Memories” (beta)

**Public 2026 understanding:** Feature creates **memories from chats** with user approval paths; **indexing may rely on Cursor infrastructure**—community docs/forums state **privacy mode conflicts** and **server-side indexing** for scale.

**Storage:** **Not a simple open folder** of markdown; **vendor cloud involvement** (per forum + third-party explainers). Docs landing page exists (`cursor.com/docs` → Memories) but **binary/editor integration**, not portable JSONL.

**Export / external query?** **No first-class open query API** documented for third-party agents outside Cursor.

**vs. loci v2:** **Complements badly**—exactly the silo loci’s **cursor adapter** must **read**, not replace.

---

### 2. Claude Code — `CLAUDE.md` + auto memory (`MEMORY.md`)

**Mechanism (official docs, May 2026):**  
- User instructions: `CLAUDE.md` / `.claude/rules/` hierarchy.  
- Auto memory: per-repo directory under **`~/.claude/projects/<derived-key>/memory/`** with **`MEMORY.md` index** + optional topic files; **only first 200 lines *or* 25KB** of `MEMORY.md` loaded at session start; topic files on-demand.

**Export / external query?** **Plain Markdown** on disk—fully **inspectable**, scriptable, **git-agnostic** store.

**vs. loci v2:** Claude’s memory is **Claude-shaped**; loci can **index it** alongside others (spec Tier 1).

---

### 3. Codex CLI memory

**Official OpenAI docs (`developers.openai.com/codex/memories`, fetched 2026-05-14):**  
- Off by default; legal region gates.  
- **Generated local files** under **`~/.codex/memories/`** (with `CODEX_HOME` override).  
- **Human-authored** counterpart remains **`AGENTS.md` / project docs**.  
- Controls: `[features] memories = true`, per-thread `/memories`, settings for generation vs. injection.

**Export / external query?** Files are local; machine-readable but **undocumented as stable schema**—treat as **versionable target** for `get/search`.

**vs. loci v2:** **Prime federation candidate**, aligns with spec.

---

### 4. Continue.dev

**Public stance (early 2026 issues/community):** Native “memory bank” **not planned**; **MCP** recommended architecture; **`memory-mcp` example** exists in ecosystem.

**Storage:** Mostly **static `.continue/rules` + config** unless user adds MCP.

**vs. loci v2:** Continue becomes a **client** of loci MCP rather than competitor.

---

### 5. Aider

**Persistence model:** **`CONVENTIONS.md` / `.aider.conf.yml` / `--read`** = static instructions across sessions; **no built-in semantic memory index** like loci L1.

**vs. loci v2:** Same pattern—**loci complements**.

---

### 6. OpenAI Operator / ChatGPT memory

**ChatGPT memory:** Profile-stored preferences + derived memories; managed in **Settings → Personalization**; **export** via **Settings → Data controls** (zip export includes account data—**not a granular real-time memory API**).

**Operator / Agents SDK:** **Sessions** persist chat items; **long-term semantic memory** is **not** solved generically—cookbooks show **custom notes/state** patterns.

**vs. loci v2:** Cloud, vendor control, **offline/policy mismatch**.

---

## D.4 Comparable “knowledge federation” tools

### 1. Glean (enterprise search)

**Pattern:** **100+ connectors**, unified index, permission-aware retrieval, hybrid ranking—**the enterprise gold standard** for “many silos, one query.”

**Steal for loci v2:** **Connector contracts**, **timeout-per-source**, **permission sanity** (even if single-user today), **incremental indexing** discipline.

---

### 2. Komo / “Lassie” / Bloks (as named in brief)

**Komo (2026):** Positioned as **research/ops agents + answer engine**—not a Markdown-first personal hub.  

**“Lassie”:** **No credible flagship product** located under that name in scan—likely confusion with similarly named tools (`laisy`, etc.).  

**Bloks (`bloks.app`):** **Relationship/meeting intelligence CRM** for revenue professionals—**not developer memory**.

**Lesson:** “Personal federation” market is **noisy**; many brands **sound** adjacent but optimize different jobs-to-be-done.

---

### 3. Recoll / DocFetcher (desktop search)

**Pattern:** **Local full-text indexes** over heterogeneous folders; pluggable helpers; **offline**; **no LLM memory semantics**.

**Steal:** **Incremental indexing**, **MIME filters**, **snippet generation**, crash-safe batch updates.

---

### 4. Open-source “multi-source with plugins” search

Representative patterns: **OpenSearch / Elasticsearch connector framework**, **Apache Nutch** (crawl + index), **ZincSearch / Quickwit** (lighter indices). None know “Claude vs Cursor memory path,” but all embody **adapter → normalized document → inverted/vector index**.

**Steal:** Explicit **adapter boundary**, **schema versioning**, **rebuild** story—matches spec’s `--rebuild` and hybrid central vs. live query tension (Open Q5).

---

## D.5 Should loci v2 even exist? (Honest section)

### Closest competitors

1. **Pieces for Developers** — OS-wide **developer memory** with deep workflow capture; closest **end-user** analogue, but **proprietary** and not a **spec-driven adapter+MCP+federation CLI** for arbitrary on-disk stores.  
2. **mem0 (+ self-host)** — Could approximate “memory layer,” but you’ll **still** implement **Cursor/Codex/Serena** parsers and **reject cloud/extractive** defaults if sticking to the spec.  
3. **Hosted notes + API (Mem / Reflect)** — Solve “search my life,” not “normalize five IDE caches on Windows without owning my notes SaaS.”

### Is there an incumbent that “already does it”?

**No bullseye.** The exact bundle in **spec §2–5**—**local-only**, **cross-IDE**, **read-mostly adapters**, **`get/post/migrate/sync/search`**, **MCP for Claude+Cursors+Codex**, **palace markdown L1**, **explicit non-goals** (no team cloud UI)—is **not** advertised as a finished product in this scan. What exists are **near neighbors** (Pieces, mem0, enterprise Glean) that **overlap emotionally** (“remember my work”) but **miss the integration contract** or **privacy stance**.

### Unique angle (defensible differentiation)

- **Federated IDE path literacy**: treats **rival vendors’ undocumented-but-stable folders** as first-class citizens.  
- **User sovereignty**: **no account**, **no summarization mandate**, **Markdown escape hatch**.  
- **Windows realism**: many “ambient capture” competitors **neglect or exclude** Windows; spec explicitly targets **Win + macOS + Linux**.  

### Risk of being late / saturated

**High narrative competition, low exact substitution.** Many tools claim “AI memory”; buyers are fatigued. Mitigations: **ship a narrow M1** that **imports Serena + recall** and proves **cross-search**; avoid pitching “another app” — pitch **plumbing**.

### Verdict

**Build** — but treat it as **infrastructure for one disciplined user**, not a category-killing startup narrative. **Pivot** if M3 federation proves unmaintainable across volatile JSONL formats; **abort** if Pieces (or an open MCP hub) ships **documented, stable imports** for the same sources **and** you lose interest in owning the hub.

---

## Key ideas to steal

1. **Glean-style connector discipline** — timeouts, health checks, incremental sync.  
2. **mem0 / Zep-style hybrid retrieval** — BM25 + vectors + graph-like entity linking *as optional signals*, not scope creep.  
3. **LangGraph checkpointing** — namespacing, durable stores, rebuild semantics.  
4. **Graphiti/Zep temporal edge** — “fact valid between t₀–t₁” for debugging “what did I believe last month?”  
5. **Claude auto-memory layout** — index `MEMORY.md` + lazy topic files pattern mirrors loci “palace + leaf.”  
6. **Codex memory guardrails** — secret redaction + “don’t summarize hot threads” policies.  
7. **Recoll-style local index hygiene** — MIME sniffing, incremental reindex, corruption recovery.  
8. **Letta “memory blocks” UX metaphor** — helps future CLI ergonomics even if implementation differs.  
9. **Cognee breadth-of-ingest** (carefully) — import pipelines for messy Markdown dirs.  
10. **Heyday/Rewind caution** — ambient capture without ROI **dies**; **laser use-case** beats “record everything.”  

---

## References

**Specs & docs consulted (URLs)**

- loci v2 spec: `D:\Works\AI\Skills\loci-v2\specs\spec.md` (local)  
- mem0: https://github.com/mem0ai/mem0  
- Letta: https://github.com/letta-ai/letta  
- Graphiti docs: https://help.getzep.com/graphiti/getting-started/overview  
- Zep: https://github.com/getzep/zep  
- Cognee: https://github.com/topoteretes/cognee — https://docs.cognee.ai/  
- LangGraph persistence & memory: https://docs.langchain.com/oss/python/langgraph/persistence — https://docs.langchain.com/oss/python/langgraph/add-memory  
- MemoryBank paper: https://arxiv.org/abs/2305.10250  
- Sherpa memory API docs: https://docs.ai.science/en/latest/API_Docs/sherpa_ai.memory.html  
- OpenAI Codex memories: https://developers.openai.com/codex/memories  
- Anthropic Claude Code memory: https://docs.anthropic.com/en/docs/claude-code/memory  
- Cursor docs hub (Memories page path): https://docs.cursor.com/en/context/memories  
- Obsidian Smart Connections: https://github.com/brianpetro/obsidian-smart-connections — https://smartconnections.app/  
- Reflect API blog: https://reflect.app/blog/reflect-update-api  
- Mem pricing: https://get.mem.ai/pricing  
- Pieces long-term memory: https://pieces.app/features/long-term-memory  
- Glean connectors overview: https://docs.glean.com/connectors/about  
- OpenAI ChatGPT data export FAQ: https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-hi  
- OpenAI ChatGPT memory FAQ: https://help.openai.com/en/articles/8590148-memory-in-chatgpt-faq  
- Continue memory bank discussion (issue closure reference): https://github.com/continuedev/continue/issues/4615  
- Aider conventions doc: https://github.com/aider-ai/aider/blob/main/aider/website/docs/usage/conventions.md  
- Bloks product: https://www.bloks.app/  

**Secondary / explainer sources (verify independently)**

- Various 2026 tool review pages for pricing snapshots  
- Cursor community forum threads on Memories + privacy mode  
- Industry commentary on Heyday shutdown and Rewind/Limitless strategic changes  

---

*End of D-market-scan.md*
