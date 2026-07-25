# Custom models and subagents

Use exact model IDs in commands and subagent frontmatter:

```sh
pnpm run launch -- safe gpt-5.6-sol
```

```yaml
model: gpt-5.6-sol
effort: xhigh
```

Do not set `CLAUDE_CODE_SUBAGENT_MODEL` globally. It overrides the model chosen
by each custom agent. The launcher removes that variable before starting Claude
Code so project agent frontmatter remains authoritative.

## The model picker limitation

Claude Code's gateway discovery only adds IDs beginning with `claude` or
`anthropic`. Prefixing unrelated models with a Claude family name can make them
appear in `/model`, but it also changes capability detection, model labels, and
context accounting.

This repository therefore treats `/model` discovery as convenience, not truth.
Use exact IDs, generated custom agents, or the `choose-model` skill for reliable
routing.

## Fallback

Claude Code fallback chains do not activate for authentication, billing,
rate-limit, request-size, or transport errors. A provider authentication outage
must be handled explicitly by the caller, with the requested model, actual
model, and fallback reason recorded.

Sources:

- <https://code.claude.com/docs/en/model-config>
- <https://code.claude.com/docs/en/sub-agents>
