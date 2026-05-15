---
title: FMPanel API Error Handling Pattern
tags: [fmpanel, api, errors]
date: 2026-04-02
---

# FMPanel API Error Handling Pattern

When ApiClient surfaces a transport failure, the bridge wraps it in a
`BridgeError` with the upstream HTTP code and the original payload preserved
for debugging.

## Rules

1. Never swallow 5xx silently — escalate to the toast layer.
2. 4xx with a structured `{ code, message }` body is rendered inline.
3. Network errors (timeout, ECONNRESET) are retried up to 3x with backoff.
