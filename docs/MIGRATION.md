# MIGRATION.md — moving memories between AI tools

> **Status**: M2 feature. M1 is read-only. This doc describes the M2 design.

## Why migrate

You moved from Claude Code to Cursor as your primary IDE. You don't want to lose 6 months of context.

Or: you have 4 AI tools, you want one of them to be the "primary memory home", and the others to back into it.

## The basic flow

```bash
# 1. See what would happen (default: dry-run, never destructive without --apply)
omem migrate --from claude-code --to cursor

# Output:
# Would copy 1,247 records from claude-code to cursor:
#   - 1,180 sessions in last 90 days
#   - 67 older (use --since 90d to filter)
# Would skip 23 (already exist in destination, hash match)
# Strategy: copy (default). Use --strategy=move to delete from source.
# Conflicts: 4 records have different content with same id. Use --on-conflict=keep|overwrite|both.
# Run with --apply to commit.

# 2. Apply
omem migrate --from claude-code --to cursor --apply
```

## Strategies

| Strategy | What it does |
|----|----|
| `copy` (default) | Read source, write destination. Source untouched. |
| `move` | Read source, write destination, then delete source. **Use only if you trust the migration**. |
| `link` (where supported) | Create a symlink/hardlink. Saves disk; risks coupling lifecycle. |

## Conflict resolution

Records can collide if:
- Same `id` exists in both (e.g. you've been writing to both for a while)
- Same `sessionId` + `timestamp` but different `text` (rare, schema drift)

Strategies:
- `--on-conflict=keep` — leave destination alone, log skipped
- `--on-conflict=overwrite` — destination gets source's version
- `--on-conflict=both` — write source as a new record with suffixed id (default)

## Filters

```bash
# Only memories from the last 30 days
omem migrate --from cc --to cursor --since 30d

# Only one project
omem migrate --from cc --to cursor --project /path/to/repo

# Only specific session
omem migrate --from cc --to cursor --session abc-123
```

## Rollback

`omem migrate --apply` writes a rollback manifest to `~/.omem/migrations/<timestamp>.json`. To undo:

```bash
omem migrate --rollback ~/.omem/migrations/2026-05-14_142305.json
```

(Rollback works for `copy` and `link` strategies. `move` deletes source — there is nothing to roll back to.)

## What this is NOT

- **Not a sync.** Migration is a one-shot transfer. There's no daemon keeping two sources synchronized.
- **Not a backup tool.** For backup, use `omem export --all` (single archive), not migrate.
- **Not a format converter for arbitrary data.** Migrate operates on `MemoryRecord` (the canonical shape adapters produce). If a source has data the canonical shape doesn't capture, it's lost in migration. (We log what was dropped.)
