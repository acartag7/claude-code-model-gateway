# Context windows in Claude Code gateways

Claude Code does not read context metadata from a gateway model catalog. Model
discovery reads only `id` and optional `display_name`, and it ignores discovered
IDs that do not start with `claude` or `anthropic`.

That creates two different numbers for custom models:

- Upstream context: what the provider actually accepts.
- Claude Code client budget: what Claude Code believes the model accepts.

Unknown custom IDs receive the conservative 200K client budget. This is safe,
but it underuses GPT 272K, Grok 500K, and several 1M windows.

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

## Subagent context budgets

A subagent's budget comes from the model ID in its generated frontmatter and
nothing else. Claude Code reads no context metadata from the gateway catalog, so
a subagent pinned to a bare custom ID such as `zai/glm-5.3-flash` is budgeted at
200K even though the upstream model accepts 1M.

Set `contextMode: full` on an agent in `models.yaml` to generate it with the
model's `experimentalFullContext` ID instead. The catalog rejects `full` for any
model that has no experimental profile, and agents default to `safe`.

Only opt in where the ceiling is truthful. GLM 5.2, GLM 5.3 Flash, Hunyuan Hy4
Preview, and LongCat 2.0 accept 1M upstream, so their `[1m]` model IDs are
accurate. A 272K or 500K model under the same shim claims a window its provider
will reject. The compaction threshold is process-wide, so one Claude Code
process cannot give such an agent a truthful threshold while another agent uses
a different window.

Sources:

- <https://code.claude.com/docs/en/llm-gateway-protocol>
- <https://code.claude.com/docs/en/model-config>
- <https://code.claude.com/docs/en/env-vars>
- <https://docs.z.ai/guides/vlm/glm-5.3-flash>
- <https://github.com/Tencent-Hunyuan/Hy4-preview>
- <https://huggingface.co/moonshotai/Kimi-K2.7-Code>
- <https://longcat.ai/blog/longcat-2.0/>
