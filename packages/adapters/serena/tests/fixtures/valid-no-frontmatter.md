# Quick-Test / Diagnostic Logging Conventions

User-imposed rules for **temporary diagnostic logging** added during
investigation work (e.g. "add logs to figure out why X is missing"). These
apply when the intent is throwaway — code that will be removed once the bug
is understood — NOT for permanent telemetry.

## Rules

1. Use `console.log`, not `console.warn` / `console.error`. Diagnostics are
   observational, not warnings.
2. Skip `process.env.NODE_ENV !== 'production'` guards. The whole point is
   that this code is throwaway; gating just adds noise.
