# B. Tech-Stack Research for loci v2

> Date: 2026-05-14  
> Depth: medium  
> Spec ref: [../specs/spec.md](../specs/spec.md) (Open Q1: L1 retrieval engine, Q2: vector backend, Q4: MCP deployment shape — B.5 informs Q4 tooling)

## TL;DR — Recommended Stack

**Lexical:** Stay on **SQLite FTS5 via `better-sqlite3`** for the primary BM25 path: one `.sqlite` file next to `~/.loci/`, no extra daemon, aligns with recall/episodic-memory patterns and Windows prebuilds. **Vectors:** Pair with **`sqlite-vec` in the same DB** for the spec’s “single file, two indexes” story (`sqlite-vec` ships `sqlite-vec-windows-x64` on npm; expect occasional Node/packager edge cases per tracker issues). **Embeddings:** Default to **`fastembed` (default model BGE-small-en)** for the fastest path to a working ONNX pipeline on Node; add a **Chinese-capable** model (e.g. BGE small Chinese or multilingual) when you need strong 中文 — English-only `bge-small-en` will under-serve mixed notes. **Hybrid merge:** Start with **RRF (k≈60)** over BM25 ranks + vector ranks; treat **cross-encoder rerank** as optional/p99 polish. **MCP:** Use official **`@modelcontextprotocol/sdk` v1.x** with **stdio** for `loci serve mcp` embedded in the CLI (matches FR-IF-02/03 and “single binary, multi-role”); track the split **`@modelcontextprotocol/server` v2** when you are ready to require **Node 20+** and ESM-only.

---

## B.1 Full-text engine

### Comparison matrix (embedded Node CLI on Windows, ~10k docs)

| Candidate | Bundle / deps | Windows install | Latency @ ~10k (order of mag.) | “BM25” quality | Hybrid text+vector | License |
|-----------|----------------|-----------------|----------------------------------|----------------|----------------------|---------|
| **SQLite FTS5** + `better-sqlite3` | Native addon (~prebuilt); SQLite in-tree | **Low** — `prebuild-install` binaries for win x64/arm64; FTS5 enabled in upstream builds | **Low** — local disk index; typical interactive queries ms–tens of ms on laptop SSD for this corpus size | **FTS5 default rank** is BM25-based per SQLite docs | **Excellent** with `sqlite-vec` same connection/file | `better-sqlite3` MIT; SQLite public domain |
| **Meilisearch** | Separate server binary + HTTP client | **Medium** — install another service; Windows supported for self-host | **Low** once warm — network hop small on loopback | Strong lexical base + **typo tolerance** (product feature) | **Manual** — fuse with vectors in app layer | **MIT** Community Edition (enterprise features dual-licensed since ~v1.19) |
| **Tantivy** (Node bindings) | Native Rust bridge | **High / uneven** — e.g. community packages list **Linux/macOS prebuilds**; Windows often build-from-source or immature | **Low** when native works | Strong BM25 + mature Rust core | **Manual** | N/APackage-dependent (Tantivy Apache-2.0; bindings vary) |
| **MiniSearch** (`minisearch` **7.2.0**, 2025-09) | Pure JS; **~807 KB unpacked** on npm | **Trivial** | **Low in RAM** — 10k docs is tiny for in-memory | **Not classic BM25** — custom scoring (TF-IDF-like + fuzzy/prefix options); good relevance, different calibration | **DIY** — maintain parallel vector structure | **MIT** |
| **Orama** (`@orama/orama` **~3.1.x**, active) | Pure JS; npm claims small **gz** footprint (marketing “<2kb” refers to minimal slices; full install larger) | **Trivial** | **Low in RAM** for 10k | Full-text pipeline + filters; tune to taste | **First-class hybrid** (text + vectors in one engine) | **Apache-2.0** (verify per release) |

### Per-candidate notes (~200–400 words each)

**1) SQLite FTS5 (`better-sqlite3`)**  
Pros: Matches existing ecosystem (recall / episodic-memory SQLite story); **single-user embedded** dream; durability + atomic transactions; introspect with any SQLite tool; FTS5 ranking documented as BM25-based. Cons: Typo tolerance weaker than Meilisearch unless you add extras; multilingual tokenization needs thought for Chinese (segmentation). Fit: **Ideal** for FR-L1-03 “SQLite FTS5 副本” and NFR portability. **No micro-benchmark was run here** — expect interactive latency on a 10k-row corpus on modern Windows hardware barring pathological queries.

**2) Meilisearch**  
Pros: Polished typo tolerance and ranking UX; simple HTTP API; active project. Cons: **Violates “no extra process”** for a minimal CLI; more moving parts for log backup; overkill for solo dev. Fit: Better for a desktop “search appliance” than `loci` L1 — pick only if you want Meilisearch-level forgiving search without building it yourself.

**3) Tantivy via Node**  
Pros: Rust-grade performance and BM25 story when bindings work. Cons: **Windows is the risk vector** — binding maturity, prebuild coverage, and Node version constraints (community packages mention **Node 22+** for some). Fit: Interesting for a later optimization spike; **not** minimal for M1–M3.

**4) MiniSearch**  
Pros: Zero native toolchain pain; **excellent** for protoypes; fast to ship; huge weekly downloads. Cons: **In-memory** — rebuild on cold start unless you snapshot/serialize; not the same BM25 semantics as FTS5; duplicates persistence story SQLite already solves. Fit: Great if L1 stayed JSON-only; **less aligned** once SQLite is the source of truth.

**5) Orama**  
Pros: Modern hybrid story in one library; could replace dual index mentally. Cons: Still **in-memory-first** patterns for many deployments; overlaps with FTS5+sqlite-vec rather than complementing; another query DSL to own. Fit: Choose if you wanted **one JS engine** and were willing to **drop** SQLite FTS; conflicts slightly with spec trajectory toward SQLite parity with recall.

### Verdict (Open Q1)

**Preferred: SQLite FTS5 (`better-sqlite3`)** as primary lexical index — matches the spec bias, Windows prebuild story, and hybrid path with `sqlite-vec`. Keep **Meilisearch** as a “power user optional backend” only if typo tolerance becomes a top complaint. Treat **MiniSearch/Orama** as **prototyping or browser-adjacent** options, not L1 canonical store. Avoid **Tantivy-in-Node** until Windows support is proven for your exact Node LTS.

---

## B.2 Vector index backend

### Comparison matrix (~10k × 384-d, Node on Windows)

| Backend | Node / Windows story | Install pain | Query latency @10k (evidence) | Persistence | Hybrid w/ FTS5 |
|---------|----------------------|--------------|-------------------------------|-------------|----------------|
| **sqlite-vec** | **Official npm** + `sqlite-vec-windows-x64` package | **Low–medium** — mostly prebuilt extension; GitHub issues mention occasional **Windows/Node** packaging edge cases (PnP/Yarn) | **Not bench-marked here** — designed for modest ANN workloads in-process | **Excellent** — same `.sqlite` as FTS5 | **Native fit** — single DB connection |
| **LanceDB** (`@lancedb/lancedb`, **~0.27.x**, 2026-03) | Node **≥18**; downloads native lib per platform including Windows | **Low** | Published as low-latency embedded; **no local 10k/384 run in this note** | Columnar files — good for analytics | Join in app — still easy |
| **Chroma** (`chromadb` **~3.4.x**, **2026-04**) | **JS client = HTTP to server** | **High** for “CLI only” — need `chroma run` or cloud | Network-bound | Server/Cloud | Optional FTS in product — still **second datastore** |
| **HNSWLib** (`hnswlib-node`, native) | node-gyp; **historical Windows pain** reports | **Medium–high** | Fast if built | You bring storage | DIY |
| **Faiss** | **Python-first**; Node not first-class | High if insisting on Node | Mature ANN; **Python path** best documented | Many patterns | Awkward for Node CLI |
| **JSON + brute cosine** | Pure JS | None | **OK <5k**; at 10k borderline for p95 vs ANN | Trivial | Baseline |

### Verdict (Open Q2)

**Preferred: `sqlite-vec` + SQLite** for the engine file co-location the spec already leans toward. **LanceDB** is the best **embedded alternative** if sqlite-vec becomes a blocker (platform issues) — accept **two persistence formats** (SQLite + Lance) or migrate FTS later. **Chroma/Faiss** are misaligned with “single-user CLI, minimal daemons.” **HNSW raw** only if you enjoy maintaining native builds on Windows.

---

## B.3 Embedding model

### Comparison matrix

| Model | Local/API | Dims | Size (order of mag.) | MTEB (published) zh/EN | Fit for EN+中文 notes |
|-------|-----------|------|----------------------|-------------------------|------------------------|
| **BGE-small-en-v1.5** ONNX | Local | 384 | ~33 MB class | Strong **English**; model card positions as English retrieval | **Weak for Chinese** — pair with `bge-small-zh-v1.5` or multilingual model for real bilingual |
| **all-MiniLM-L6-v2** ONNX | Local | 384 | ~25 MB | Leaderboard average ~**55.9** reported in community tables — verify on current MTEB site | English-centric typical |
| **gte-small** | Local | 384 | ~70 MB params class | Reported **~61.36** avg on public datasheet snapshots — verify | Primarily English track |
| **text-embedding-3-small** | OpenAI API | **1536** | N/A (network) | Strong cloud baseline | Multilingual API — **violates default “no egress”** NFR unless user opts in |
| **voyage-3-lite** | Voyage API | vendor | Paid / network | Strong commercial retrieval tier | Same privacy caveats |
| **Ollama `nomic-embed-text`** | Local daemon | vendor | Pull-based | Convenient | Extra runtime; not “pure Node” |

### ONNX runtime library pick (Node on Windows)

| Library | Role | Pros | Cons |
|---------|------|------|------|
| **`onnxruntime-node`** | Direct ORT | Max control; widely used | Model + tokenizer wiring is on you |
| **`@xenova/transformers`** (*Transformers.js*) | ONNX models from HF | Convenient pipelines | Heavier cold start / bundle for CLI paths |
| **`fastembed`** | Opinionated embedder | **Defaults to ONNX + `onnxruntime-node`**, claims **BGE-small-en**; multilingual/BGE-zh options in family; **~79k weekly downloads** (npm) | Still native deps via ORT |

### Verdict

**Default local pipeline: `fastembed`** for pragmatic Node+Windows, **unless** you need minimal dependencies — then **`onnxruntime-node` + manual ONNX model** (mirrors episodic-memory more closely). Pick **Transformers.js** when you want HF hub ergonomics over startup cost.

**Model choice:** Keep **BGE-small-en** for parity with episodic-memory and strong English retrieval; **add a Chinese small embedding** (or one multilingual model like **BGE-M3-class**, accepting size cost) because the user writes **English + Chinese** and English-only retrievers will miss paraphrase across languages.

Cloud models (**OpenAI / Voyage**) = **opt-in** profiles only (`--allow-network`), per NFR.

---

## B.4 Hybrid ranking strategy

1. **Reciprocal Rank Fusion (RRF)** — unsupervised; **k≈60** constant from Cormack–Clarke–Büttcher SIGIR’09 / widely reproduced (see also vendor docs like Elasticsearch RRF). **Pros:** No training, stable across heterogeneous scores (BM25 vs cosine). **Cons:** Less interpretable weights than explicit blend.

2. **Linear weighted combination** — `α·norm(BM25)+β·cosine`. **Pros:** Tunable, easy logging. **Cons:** Requires score normalization; brittle across queries.

3. **Cross-encoder rerank** (e.g. `bge-reranker-base`) — **Pros:** Best lexical-semantic agreement per query. **Cons:** **Latency budget** risk vs NFR (`recall` w/ vectors <300ms target); batching complexity.

**Starting strategy:** **RRF across top-k lists** from FTS5 + sqlite-vec (k≈20–50 each, fuse to top-10). Add **lightweight linear priors** later for recency/confidence **after** fusion if needed. Defer **cross-encoder** to an optional `--rerank` / quality mode.

---

## B.5 MCP server SDK + skeleton

### `@modelcontextprotocol/sdk` (official v1)

- **Maturity:** **`@modelcontextprotocol/sdk` ~1.29.x** (2026-03 range) remains the high-download stable surface; **v2 splits** into `@modelcontextprotocol/server` (alpha) and targets **Node 20+ ESM-only** per upstream README.
- **Transports:** **stdio** (local CLI spawn), **Streamable HTTP** (recommended for remote), legacy **SSE** deprecated.

**fastmcp (Python):** Skipped — forces split language stack.  
**Hand-rolled JSON-RPC:** **Overkill** — wire protocol + schema validation complexity; use SDK.

### Minimal stdio skeleton (v1-style handlers)

> Pins to **`@modelcontextprotocol/sdk`** for **Node 18** compatibility per spec; swap imports for `@modelcontextprotocol/server` when adopting SDK v2.

```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "loci", version: "0.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "loci_remember", description: "Store a memory", inputSchema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } },
    { name: "loci_recall", description: "Search L1 memories", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
    { name: "loci_search", description: "Federated search", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  // dispatch req.params.name -> core engine
  return { content: [{ type: "text", text: `ok:${req.params.name}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Risks & Caveats

- **No local benchmarks executed** in this research pass — latency rows are qualitative; validate against your real `~/.loci` corpus on your machine.
- **sqlite-vec Node packaging** has open issues around Windows/pnpm/Yarn PnP — budget spike time if your package manager is exotic.
- **Tantivy Node** landscape is **fast-moving** (multiple competing bindings); prebuild matrices change monthly.
- **MCP SDK split (v1 → v2)** is active in Q1–Q2 2026 — re-check import paths before locking `design.md`.
- **License nuance:** Meilisearch dual-license for some features; always confirm for your deployment class.
- **Multilingual:** Published MTEB numbers differ by task cut; verify on the **current** leaderboard before claiming rank.

---

## References

- SQLite FTS5: https://www.sqlite.org/fts5.html  
- `better-sqlite3`: https://www.npmjs.com/package/better-sqlite3 & https://github.com/WiseLibs/better-sqlite3  
- `minisearch`: https://www.npmjs.com/package/minisearch  
- `@orama/orama`: https://www.npmjs.com/package/@orama/orama  
- Meilisearch docs / licensing blog: https://www.meilisearch.com/docs/ & https://www.meilisearch.com/blog/enterprise-license  
- `sqlite-vec`: https://www.npmjs.com/package/sqlite-vec & https://github.com/asg017/sqlite-vec  
- LanceDB JS docs: https://lancedb.github.io/lancedb/js/ & `@lancedb/lancedb` npm  
- Chroma JS client: https://www.npmjs.com/package/chromadb  
- `hnswlib-node`: https://www.npmjs.com/package/hnswlib-node  
- `@modelcontextprotocol/sdk` & TS SDK README (stdio example, v2 split): https://www.npmjs.com/package/@modelcontextprotocol/sdk & https://github.com/modelcontextprotocol/typescript-sdk  
- RRF: https://research.google/pubs/reciprocal-rank-fusion-outperforms-condorcet-and-individual-rank-learning-methods/ & https://www.elastic.co/guide/en/elasticsearch/reference/8.19/rrf.html  
- MTEB: https://github.com/embeddings-benchmark/mteb & https://embeddings-benchmark.github.io/mteb/  
- BGE-small-en model card: https://huggingface.co/BAAI/bge-small-en-v1.5  
- BGE-small-zh model card: https://huggingface.co/BAAI/bge-small-zh-v1.5  
- `fastembed` npm: https://www.npmjs.com/package/fastembed  
