# Claude Code Model Gateway

Use your Claude, Codex, GLM, Grok, and OpenCode Go accounts from one Claude
Code setup.

This repository turns [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
into a predictable model gateway for Claude Code. It gives every model an exact
name, keeps subagents on their assigned model, enables automatic compaction, and
checks that the models you configured are actually reachable.

It does not hide which provider ran a request, silently swap one model for
another, or pretend every model has the same context window.

> Setting this up with an agent? Give it [`llms.txt`](llms.txt), which points to
> the exact [`agent setup contract`](docs/agent-setup.md). The complete human
> walkthrough is in [`docs/setup.md`](docs/setup.md).

## Why this exists

Claude Code can talk to an Anthropic-compatible gateway, but custom models have
rough edges:

- the model picker does not reliably show non-Claude model IDs;
- a global subagent override can ignore the model assigned to an agent;
- Claude Code usually budgets unknown models as 200K, even when the provider
  supports more;
- automatic quota failover can make a different model answer without an
  obvious handoff.

This project keeps those behaviors explicit. One editable file,
[`models.yaml`](models.yaml), defines the catalog, roles, effort levels, context
evidence, and custom agents. The rest is generated or verified from it.

## What you get

- One Claude Code entrypoint for multiple model providers
- Exact model routing for commands and custom subagents
- Six generated specialist agents
- A `choose-model` skill with role and effort guidance
- Automatic compaction enabled at 95%
- Safe 200K defaults and opt-in context-window experiments
- Local and live checks for configuration drift and missing models
- A loopback-only CLIProxyAPI starter configuration

## Install the Claude Code plugin

The plugin is the easiest way to distribute the generated agents and
`choose-model` skill across projects. It is namespaced and installs no hooks,
settings, credentials, or gateway processes.

From Claude Code:

```text
/plugin marketplace add acartag7/claude-code-model-gateway
/plugin install model-gateway@claude-code-model-gateway
/reload-plugins
```

Or from a terminal:

```sh
claude plugin marketplace add acartag7/claude-code-model-gateway
claude plugin install model-gateway@claude-code-model-gateway --scope user
```

Use the namespaced skill and agents:

```text
/model-gateway:choose-model
@model-gateway:spec-critic
@model-gateway:implementer
```

The plugin handles Claude-side model routing only. Continue with the local or
remote gateway setup below so Claude Code starts with the required gateway
environment. See [plugin boundaries](docs/plugins.md) before combining it with
a process framework.

## Quick start on macOS

You need Node.js 22 or newer, pnpm 10.32.0 or newer, Claude Code 2.1.207 or
newer, and CLIProxyAPI.

```sh
corepack enable
corepack install --global pnpm@10.32.0
brew install --cask claude-code
brew install cliproxyapi

pnpm install --frozen-lockfile
pnpm run preflight
pnpm verify
```

Create a local, loopback-only gateway configuration. The first command is a
preview; the second applies it when you do not need an API-key provider. Z.AI
and OpenCode Go flags must be included on this one-time apply; see the
[complete setup guide](docs/setup.md).

```sh
pnpm run bootstrap:local
pnpm run bootstrap:local -- --apply
```

Authenticate only the providers you use:

```sh
cliproxyapi --config "$HOME/.cli-proxy-api/config.yaml" --codex-login
cliproxyapi --config "$HOME/.cli-proxy-api/config.yaml" --xai-login
```

### Anthropic authentication boundary

Do not use CLIProxyAPI's `--claude-login` option with this project. Anthropic
documents Pro and Max subscription access for its first-party Claude Code
client, while API access and billing are separate through Anthropic Console.
A consumer-plan OAuth credential is therefore not a supported general-purpose
gateway credential here. Routing it through a third-party gateway may put the
account at risk as terms and enforcement change.

For Claude models, use an Anthropic Console API credential through a supported
API integration, use first-party Claude Code directly, or use another platform
whose Anthropic access explicitly covers the intended integration. This is an
operational boundary, not legal advice. See Anthropic's
[Pro/Max Claude Code guidance](https://support.anthropic.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
and [plan-versus-API guidance](https://support.anthropic.com/en/articles/9876003-i-subscribe-to-a-paid-claude-ai-plan-why-do-i-have-to-pay-separately-for-api-usage-on-console).

Start the gateway in another terminal:

```sh
cliproxyapi --config "$HOME/.cli-proxy-api/config.yaml"
```

Load the local connection without printing the gateway key:

```sh
export MODEL_GATEWAY_URL="http://127.0.0.1:8317"
export MODEL_GATEWAY_API_KEY="$(security find-generic-password -w -a "$USER" -s claude-code-model-gateway-api-key)"
```

Preview and install the generated Claude Code profile:

```sh
pnpm run install:user
pnpm run install:user -- --apply
pnpm run doctor -- --live
```

The installer preserves unrelated settings and files. Its preview prints every
stale repository-managed agent or skill file that apply mode will remove; review
those `remove_path` lines before applying.

Then launch Claude Code with an exact model:

```sh
pnpm run launch -- safe claude-opus-4-8
pnpm run launch -- safe gpt-5.6-sol
pnpm run launch -- safe zai/glm-5.3-flash
pnpm run launch -- safe kimi-k2.7-code
```

Each launch also applies the model's `recommendedEffort` from the catalog, so the
curated effort level is what actually runs. Pass `--effort <level>` yourself to
override it for one session.

Two things the launcher enforces about the environment, both silent failures
otherwise:

- `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX` and
  `CLAUDE_CODE_USE_FOUNDRY` are cleared for the child process. Claude Code
  selects a cloud provider *before* it reads `ANTHROPIC_BASE_URL`, so one of
  these left exported by another setup would route the session around this
  gateway — and the session would still appear to work.
- `CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1` is set, because effort is otherwise
  dropped for model ids Claude Code does not recognise, which is every
  gateway-custom id in the catalog.

The [complete setup guide](docs/setup.md) includes Z.AI and OpenCode Go
configuration, isolated-profile testing, expected output, remote gateways, and
rollback.

## Included model catalog

The checked-in catalog demonstrates this curated set. What works for you still
depends on the accounts authenticated in CLIProxyAPI.

| Provider | Models |
| --- | --- |
| Anthropic | Claude Fable 5, Claude Opus 5, Claude Opus 4.8, Claude Sonnet 5 |
| OpenAI Codex | GPT 5.3 Codex Spark, GPT 5.5, GPT 5.6 Luna, GPT 5.6 Sol, GPT 5.6 Terra |
| xAI | Grok 4.5, Grok Composer 2.5 Fast |
| Z.AI | GLM 5.2, GLM 5.3 Flash |
| OpenCode Go | Hunyuan Hy4 Preview, Kimi K2.7 Code, LongCat 2.0 |

Edit only [`models.yaml`](models.yaml) when changing the catalog, then run:

```sh
pnpm generate
pnpm verify
```

## What is intentionally not automatic

### Model fallback

The default configuration can retry another credential for the same model. It
does not silently replace the requested model with a different one. If a
workflow chooses a fallback, it should record the requested model, actual
model, and reason.

### Model picker aliases

Claude Code's gateway discovery favors IDs beginning with `claude` or
`anthropic`. This project does not rename GPT, GLM, or Grok models to make them
look Claude-native. Use exact model IDs or the generated agents instead. See
[`docs/custom-models.md`](docs/custom-models.md).

### Context windows

Safe mode accepts Claude Code's conservative 200K budget for unknown custom
IDs. Experimental profiles can raise the client ceiling, but Claude Code may
still display a number that differs from the real upstream limit. Read
[`docs/context-windows.md`](docs/context-windows.md) before using `full` mode.

### Image generation

GPT Image 2 is deliberately outside the text-agent catalog. Applications can
call it through an OpenAI-compatible image endpoint, but it is not configured
as a Claude Code subagent.

## Verification

Deterministic checks make no inference calls:

```sh
pnpm verify
```

Live checks require `MODEL_GATEWAY_URL` and `MODEL_GATEWAY_API_KEY` and may use
provider quota:

```sh
pnpm run doctor -- --live
pnpm run smoke -- --model claude-opus-4-8 --model gpt-5.6-sol
```

## Security

Gateway keys and provider OAuth files grant model access. Never commit them,
put them in Claude settings, or paste them into logs. The starter configuration
binds only to `127.0.0.1`, disables remote management and request cloaking, and
requires a strong bearer key.

Remote gateways must use HTTPS. Cloudflare Access service tokens are supported
explicitly; browser-login redirects are rejected as API authentication. See
[`SECURITY.md`](SECURITY.md) and the remote-gateway section of
[`docs/setup.md`](docs/setup.md).

## Project map

- [`models.yaml`](models.yaml): the only hand-edited model and agent catalog
- [`llms.txt`](llms.txt): standards-shaped documentation index for LLMs
- [`docs/agent-setup.md`](docs/agent-setup.md): zero-context setup contract for agents
- [`docs/setup.md`](docs/setup.md): complete operator walkthrough
- [`docs/custom-models.md`](docs/custom-models.md): picker and subagent behavior
- [`docs/context-windows.md`](docs/context-windows.md): safe and experimental context handling
- [`docs/plugins.md`](docs/plugins.md): plugin installation, boundaries, and process-framework compatibility
- [`config/cliproxy.example.yaml`](config/cliproxy.example.yaml): hardened local gateway baseline

## License

[MIT](LICENSE)
