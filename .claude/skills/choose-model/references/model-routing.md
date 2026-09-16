<!-- Generated from models.yaml. Do not edit. -->

# Model routing reference

Use exact model IDs. The launcher sets each custom model's real upstream
context window via CLAUDE_CODE_MAX_CONTEXT_TOKENS; Claude models use native
budgeting.

| Model | Claude Code value | Effort | Upstream context | Best for | Evidence |
|---|---|---:|---:|---|---|
| Claude Fable 5.1 | `claude-fable-5-1[1m]` | high | 1,000,000 | hardest-synthesis, long-running-reasoning, multistep-research | provider-docs |
| Claude Opus 5 | `claude-opus-5[1m]` | xhigh | 1,000,000 | agentic-coding, long-horizon-implementation, code-review, contract-review | provider-docs |
| GPT 5.6 Sol | `gpt-5.6-sol` | xhigh | 272,000 | acceptance-design, complex-implementation, research | provider-docs |
| GPT 6.0 Astra | `gpt-6-astra` | xhigh | 272,000 | hardest-synthesis, complex-implementation, integration-review | provider-docs |
| Daybreak Blue | `gpt-daybreak-blue-latest` | high | 272,000 | defensive-security, security-review, adversarial-review | provider-docs |
| Grok 4.5 | `grok-4.5` | high | 500,000 | independent-review, cross-family-reasoning | provider-docs |
| Grok Composer 2.5 Fast | `grok-composer-2.5-fast` | high | 200,000 | fast-exploration, narrow-mechanical-work | provider-docs |
| GLM 5.3 | `zai/glm-5.3` | max | 1,000,000 | implementation, large-repository-work, general-engineering | provider-docs |
| GLM 5.3 Flash | `zai/glm-5.3-flash` | max | 1,000,000 | fast-implementation, general-engineering | provider-docs |
| Composer 2.5 | `composer-2.5` | high | 200,000 | cursor-agent, general-engineering | provider-catalog-fallback |
| Composer 2.5 Fast | `composer-2.5-fast` | high | 200,000 | fast-implementation, narrow-mechanical-work | provider-catalog-fallback |
| Kimi K2.7 Code | `kimi-k2.7-code` | high | 262,144 | coding-implementation, repository-work | provider-docs |

Default fallback: `claude-opus-5[1m]`.

This table selects models, not process isolation. If a project requires two
seats to use different harnesses, two subagents in one Claude Code process do
not satisfy that requirement.

Do not select GPT Image 2 as an agent. It is a direct image-generation API
model and is intentionally absent from this routing table.
