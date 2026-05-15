---
title: Broken Note
tags: [unclosed
date 2026-05-01
no-colon-here just text
---

# Broken Note

This file's frontmatter is intentionally malformed — `tags` array is never
closed, `date` is missing the colon, and there's a freeform line that does
not match `key: value`. The adapter must NOT crash; it should fall back to
treating the whole file as plain markdown body and surface the issue via
`lastScanStats.corruptLines`.
