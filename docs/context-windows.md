# Context windows in Claude Code gateways

Claude Code does not read context metadata from a gateway model catalog. Model
discovery keeps only `id`, `display_name`, and `description`, and keeps an
entry only when its `id` contains `claude` or `anthropic` (case-insensitive,
anywhere in the string — the older startswith behavior changed in Claude Code
v2.1.223).

That creates two different numbers for custom models:

- Upstream context: what the provider actually accepts.
- Claude Code client budget: what Claude Code believes the model accepts.

## How budgets are decided now

Claude Code 2.1.273 resolves a model's window in this order:

1. **Claude-family ids** are budgeted natively, including `[1m]` suffixes.
2. **`CLAUDE_CODE_MAX_CONTEXT_TOKENS`** applies to any id Claude Code does not
   recognize — one process-wide value for the main model and every
   unrecognized-id subagent in the process.
3. Otherwise a custom id is budgeted at a conservative **200K**.

This repository's launcher sets that variable from the catalog:

- **Claude models** launch with their native `[1m]` ids and never receive the
  variable. Pairing it with a recognized id would mis-budget same-process
  custom-model subagents.
- **Custom models** launch with bare ids, and the launcher sets
  `CLAUDE_CODE_MAX_CONTEXT_TOKENS` to the model's real `contextTokens` from
  `models.yaml` — clamped to the smallest non-Claude agent installed by the
  catalog, because the value is process-wide and a larger value would make a
  smaller-window agent claim a window its provider rejects.

There is no separate safe/full mode anymore; the old
`experimentalFullContext` `[1m]` shims and `contextMode` agent opt-ins are
removed from the schema. The `[1m]` suffix remains in use only where it is
truthful: Claude models that genuinely support a 1M window.

## Measured, not guessed

`contextTokens` values come from the provider registry the gateway runs on, or
provider documentation. `contextEvidence` records the source class
(`provider-docs`, `embedded-registry`, `provider-catalog-fallback`,
`unverified-default`). Models with `unverified-default` claim the safe 200K
until a real long-context request measures the true window.

## Subagent context budgets

A subagent's budget comes from the model ID in its generated frontmatter and
the process-wide `CLAUDE_CODE_MAX_CONTEXT_TOKENS` value, nothing else. Claude
Code reads no context metadata from the gateway catalog.

Consequence: concurrent subagents on different custom models cannot each get
a truthful window in one Claude Code process. The launcher's clamp is the
mitigation — no installed agent claims more than the process value allows.
Use separate processes when per-agent windows matter.

Sources:

- <https://code.claude.com/docs/en/llm-gateway-protocol>
- <https://code.claude.com/docs/en/model-config>
- <https://code.claude.com/docs/en/env-vars>
