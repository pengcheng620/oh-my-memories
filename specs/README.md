# specs/

Design decisions and verdicts. AI agents reading this repo should treat these as **the authoritative source** for "why is it this way" — they were not casual choices.

| File | What it locks in |
|----|----|
| `spec.md` | Master spec — M1 acceptance criteria, scope boundaries, non-goals |
| `ceo-review-verdict.md` | Product positioning: pivot from Engine-First to Management-First, 3 categories, CC→Cursor migration priority |
| `eng-review-verdict.md` | 6 architecture decisions, 3 critical M1 gaps, parallelization plan |
| `product-formation.md` | Project naming, repo, monorepo structure, language choice (TS+Bun), CLI command set |
| `devex-review-verdict.md` | (M1, planned) — `omem` UX choices: command names, output, errors, install flow |

If you want to change one of these decisions, **read the verdict first**.
