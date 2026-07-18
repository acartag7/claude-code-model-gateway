# Context windows in Claude Code gateways

Claude Code does not read context metadata from a gateway model catalog. Model
discovery reads only `id` and optional `display_name`, and it ignores discovered
IDs that do not start with `claude` or `anthropic`.

That creates two different numbers for custom models:

- Upstream context: what the provider actually accepts.
- Claude Code client budget: what Claude Code believes the model accepts.

Unknown custom IDs receive the conservative 200K client budget. This is safe,
but it underuses GPT 272K, Grok 500K, and GLM 1M windows.

## Safe mode

Use exact model IDs and enable auto-compaction. Accept the 200K Claude Code
budget for non-Claude models. This is the default in this repository.

## Experimental full-context mode

The `full` launcher profile appends `[1m]` so Claude Code raises its client
ceiling, then sets `CLAUDE_CODE_AUTO_COMPACT_WINDOW` to the upstream model's
known capacity. Claude Code strips the suffix before sending the model ID.

Anthropic documents `[1m]` for models that genuinely support a 1M window. Using
it as a ceiling for 272K or 500K custom models is unsupported. Claude Code may
change this behavior, and its status display will still show 1M rather than the
actual upstream context.

The compaction environment variable is process-wide. Concurrent subagents with
different upstream windows cannot each receive a truthful threshold in one
Claude Code process. Use separate processes when full context matters.

Sources:

- <https://code.claude.com/docs/en/llm-gateway-protocol>
- <https://code.claude.com/docs/en/model-config>
- <https://code.claude.com/docs/en/env-vars>
