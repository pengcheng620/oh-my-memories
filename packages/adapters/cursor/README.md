# @oh-my-memories/adapter-cursor

Cursor adapter — reads `~/.cursor/projects/<project-id>/agent-transcripts/*.jsonl`.

## Storage layout

```
~/.cursor/
└── projects/
    └── <encoded-cwd>/
        └── agent-transcripts/
            └── <transcript-uuid>/
                └── <transcript-uuid>.jsonl
```

On Windows: `%USERPROFILE%\.cursor\projects\...`
