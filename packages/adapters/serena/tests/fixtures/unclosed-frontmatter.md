---
title: Never Closed
tags: [a, b]

# Never Closed

This file opens a frontmatter block with `---` but never closes it before
the body starts. The adapter must not hang trying to parse "the rest of
the file" as YAML; it must give up cleanly, count this as malformed, and
emit a record with the entire file content (including the opening `---`)
as `text`.
