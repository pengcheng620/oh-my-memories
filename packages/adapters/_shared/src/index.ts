// Shared utilities used by 2+ adapters: JSONL parsing, denylist, path helpers.
// Kept in adapters/_shared/ rather than adapter-sdk/ because adapters consume it,
// but external SDK users should not need to depend on our internal helpers.

export const PLACEHOLDER = true;
