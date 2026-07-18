<!-- Generated from models.yaml. Do not edit. -->

# Model routing reference

Use exact model IDs. Custom models use Claude Code's conservative 200K client
budget in safe mode even when the upstream context is larger.

| Model | Claude Code value | Effort | Upstream context | Best for | Evidence |
|---|---|---:|---:|---|---|
| Claude Fable 5 | `claude-fable-5[1m]` | high | 1,000,000 | hardest-synthesis, long-running-reasoning | provider-docs |
| Claude Opus 4.8 | `claude-opus-4-8[1m]` | xhigh | 1,000,000 | contract-review, security-review, adversarial-review | provider-docs |
| Claude Sonnet 5 | `claude-sonnet-5[1m]` | high | 1,000,000 | daily-engineering, orchestration | provider-docs |
| GPT 5.6 Sol | `gpt-5.6-sol` | xhigh | 272,000 | acceptance-design, complex-implementation, research | account-catalog |
| GPT 5.6 Terra | `gpt-5.6-terra` | high | 272,000 | general-implementation, integration-review | account-catalog |
| GPT 5.5 | `gpt-5.5` | high | 272,000 | deep-coding, complex-reasoning | account-catalog |
| GPT 5.3 Codex Spark | `gpt-5.3-codex-spark` | high | 128,000 | fast-coding, narrow-mechanical-work | account-catalog |
| Grok 4.5 | `grok-4.5` | high | 500,000 | independent-review, cross-family-reasoning | provider-docs |
| Grok Composer 2.5 Fast | `grok-composer-2.5-fast` | high | 200,000 | fast-exploration, narrow-mechanical-work | conservative-unverified |
| GLM 5.2 | `zai/glm-5.2` | max | 1,000,000 | implementation, large-repository-work | environment-verified |

Default fallback: `claude-opus-4-8[1m]`.

Do not select GPT Image 2 as an agent. It is a direct image-generation API
model and is intentionally absent from this routing table.
