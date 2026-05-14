# Contributing to oh-my-memories

Thanks for your interest. This project is in **pre-alpha**, so the contribution surface changes weekly.

## Before opening a PR

1. **Read `AGENTS.md`** (yes, even if you're a human — it's the fastest 5-minute orientation).
2. **Find the matching spec** in `specs/` for whatever you're changing. If your change disagrees with an existing verdict, raise an issue first; don't open a PR that contradicts a locked decision without discussion.
3. **Check the roadmap** in `docs/ROADMAP.md`. Features outside the current milestone usually get bounced.

## Adapter contributions (especially welcome)

See [`docs/ADAPTER-SDK.md`](./docs/ADAPTER-SDK.md) for the author guide. The 4 mandatory tests + cross-platform path resolution are non-negotiable; everything else we can shape together in review.

## Local dev

```bash
git clone https://github.com/pengcheng620/oh-my-memories.git
cd oh-my-memories
bun install
bun test                                  # all tests
bun run packages/cli/bin/omem -- --help   # try the CLI
bunx biome check --write .                # apply lint/format
```

## PR checklist

- [ ] All tests pass on Windows AND macOS (CI verifies, but check locally if you can)
- [ ] `bunx biome check .` is clean
- [ ] Touched files have ≥80% line coverage in their package
- [ ] No TODO without a linked issue
- [ ] Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
- [ ] PR description references the relevant spec or issue
- [ ] If you added a public API, you documented it in the package README
- [ ] If you added a new top-level CLI command, you updated `docs/CLI.md`

## Code of conduct

[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) — be kind, no harassment, etc.

## License

By contributing you agree your code is under MIT (see [`LICENSE`](./LICENSE)).
