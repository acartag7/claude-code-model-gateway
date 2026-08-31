# Complete macOS setup

This is the reference path for a new machine. It starts a loopback-only
CLIProxyAPI gateway, authenticates providers interactively, verifies the exact
model catalog, and installs the generated Claude Code configuration.

## 1. Install prerequisites

Install Node.js 22 or newer through your normal version manager, then install
the pinned pnpm release, Claude Code, and CLIProxyAPI:

```sh
corepack enable
corepack install --global pnpm@10.32.0
brew install --cask claude-code
brew install cliproxyapi
```

From this repository root:

```sh
pnpm install --frozen-lockfile
pnpm run preflight
```

Expected final line:

```text
preflight=ok node=... pnpm=... claude=... cliproxyapi=found
```

The preflight requires Claude Code 2.1.207 or newer. It checks executable
versions but makes no model request.

## 2. Create the local gateway configuration

Preview first:

```sh
pnpm run bootstrap:local
```

The preview creates nothing. If you do not need an API-key provider, apply
once:

```sh
pnpm run bootstrap:local -- --apply
```

Expected final line:

```text
bootstrap_result=ok config=.../.cli-proxy-api/config.yaml keychain=stored
```

The bootstrap:

- binds CLIProxyAPI to `127.0.0.1:8317`;
- creates a strong gateway bearer key;
- stores the key in macOS Keychain under
  `claude-code-model-gateway-api-key`;
- writes the runtime CLIProxy config with mode `0600` and its directories with
  mode `0700`;
- disables remote management, Claude request cloaking, and quota-based model
  substitution;
- refuses to overwrite an existing config or Keychain item.

CLIProxyAPI must keep the same gateway key in its runtime config, so that file
contains the key in plaintext. OAuth token files are also provider credentials.
Protect `~/.cli-proxy-api` as sensitive local state.

To include Z.AI, use its flag on the initial apply instead. First place your
Z.AI key in `ZAI_API_KEY` using your secret manager, then run:

```sh
test -n "$ZAI_API_KEY"
pnpm run bootstrap:local -- --apply --with-zai
unset ZAI_API_KEY
```

The key is read from the process environment and is never printed. Do not put
it in this repository or shell history. The generated CLIProxyAPI configuration
maps both `zai/glm-5.2` and `zai/glm-5.3-flash` to the Z.AI Coding Plan endpoint.

To include the selected OpenCode Go models, use its flag on the initial apply.
Place the subscription key in `OPENCODE_GO_API_KEY` through your secret manager,
then run:

```sh
test -n "$OPENCODE_GO_API_KEY"
pnpm run bootstrap:local -- --apply --with-opencode-go
unset OPENCODE_GO_API_KEY
```

This maps `hy4-preview`, `kimi-k2.7-code`, and `longcat-2.0` to the OpenCode Go
endpoint. To configure both API-key providers, set both environment variables
and use both flags in the same initial apply command:

```sh
test -n "$ZAI_API_KEY" && test -n "$OPENCODE_GO_API_KEY"
pnpm run bootstrap:local -- --apply --with-zai --with-opencode-go
unset ZAI_API_KEY OPENCODE_GO_API_KEY
```

Bootstrap is intentionally one-time and refuses to overwrite its configuration.
Selecting either provider with a missing, blank, malformed, or oversized key
fails before the bootstrap writes any local state.

## 3. Authenticate providers

Run only the providers you are entitled to use:

```sh
cliproxyapi --config "$HOME/.cli-proxy-api/config.yaml" --codex-login
cliproxyapi --config "$HOME/.cli-proxy-api/config.yaml" --xai-login
```

Each command opens a browser. Add `--no-browser` on a headless machine and
follow the printed callback instructions. CLIProxyAPI writes OAuth credentials
under `~/.cli-proxy-api/accounts`.

Do not add CLIProxyAPI's `--claude-login` option. Anthropic documents Pro and
Max plan access for first-party Claude Code, not as a general API credential,
and bills Anthropic Console API usage separately. This repository does not
support routing a Claude consumer-plan OAuth credential through a third-party
gateway; doing so may put the account at risk as terms and enforcement change.

Use an Anthropic Console API credential through a supported API integration,
first-party Claude Code, or another platform whose Anthropic access explicitly
covers the intended integration. This is operational guidance, not legal
advice. See Anthropic's
[Pro/Max Claude Code guidance](https://support.anthropic.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
and [plan-versus-API guidance](https://support.anthropic.com/en/articles/9876003-i-subscribe-to-a-paid-claude-ai-plan-why-do-i-have-to-pay-separately-for-api-usage-on-console).

## 4. Start and verify CLIProxyAPI

For the first run, keep the server in a separate terminal:

```sh
cliproxyapi --config "$HOME/.cli-proxy-api/config.yaml"
```

In the repository terminal, load the gateway connection without printing the
key:

```sh
export MODEL_GATEWAY_URL="http://127.0.0.1:8317"
export MODEL_GATEWAY_API_KEY="$(security find-generic-password -w -a "$USER" -s claude-code-model-gateway-api-key)"
```

Verify basic reachability:

```sh
curl --fail --silent --show-error \
  --header "Authorization: Bearer $MODEL_GATEWAY_API_KEY" \
  "$MODEL_GATEWAY_URL/v1/models" >/dev/null
```

No output and exit status zero means the authenticated catalog endpoint is
reachable.

The repository catalog intentionally contains a curated model set. If your
accounts expose a different set, edit only [`../models.yaml`](../models.yaml):
remove unavailable models and any agents that reference them, then run
`pnpm generate`. Do not create misleading aliases solely to make a model appear
Claude-native.

## 5. Verify before touching the real Claude profile

Run deterministic checks first:

```sh
pnpm verify
```

Expected summary: all tests pass, with zero failures.

Test installation in an empty profile:

```sh
export TEST_CLAUDE_CONFIG="$(mktemp -d)/.claude"
CLAUDE_CONFIG_DIR="$TEST_CLAUDE_CONFIG" pnpm run install:user
CLAUDE_CONFIG_DIR="$TEST_CLAUDE_CONFIG" pnpm run install:user -- --apply
pnpm run doctor -- --settings "$TEST_CLAUDE_CONFIG/settings.json"
```

Expected final lines include:

```text
install_result=ok auto_compact=enabled
catalog=ok generated=ok auto_compact=enabled live=skipped
```

## 6. Install and run Claude Code

Preview and apply to the real user profile:

```sh
pnpm run install:user
pnpm run install:user -- --apply
pnpm run doctor -- --settings "$HOME/.claude/settings.json"
pnpm run doctor -- --live
```

The live doctor requires every model remaining in `models.yaml` to appear in
CLIProxyAPI's authenticated catalog. Expected final line:

```text
catalog=ok generated=ok auto_compact=enabled live=ok
```

Make one real request through the shipped Claude Code entrypoint:

```sh
pnpm run smoke -- --model claude-opus-4-8
```

Expected final line:

```text
model=claude-opus-4-8 result=ok
```

`smoke` consumes provider quota. Add more `--model` arguments only after the
first route succeeds.

## Existing remote gateway

Skip local bootstrap and provider login. Export its HTTPS origin and bearer
key. If the endpoint is also protected by a Cloudflare Access service-token
policy, export both service-token values as
`MODEL_GATEWAY_CF_ACCESS_CLIENT_ID` and
`MODEL_GATEWAY_CF_ACCESS_CLIENT_SECRET`. The launcher passes only those two
allowlisted headers through Claude Code's documented custom-header mechanism.
Then run:

```sh
pnpm run preflight -- --existing-gateway
pnpm verify
pnpm run doctor -- --live
```

The gateway URL must be a credential-free origin with no path, query, or
fragment. Non-loopback gateways must use HTTPS. A browser-login redirect is not
API authentication; the doctor reports redirects as failures. Cloudflare
Access must accept the service token on both catalog and inference routes.

## Rollback

The installer does not write during preview. It preserves unrelated settings
and refuses to overwrite unrelated agents or skills. Before applying to a
non-empty profile, keep your normal backup of `~/.claude`.

Files managed by this repository are the six generated files under
`~/.claude/agents`, the `~/.claude/skills/choose-model` directory, and the
generated gateway/compaction keys merged into `~/.claude/settings.json`.

Official references:

- <https://help.router-for.me/introduction/quick-start>
- <https://help.router-for.me/configuration/provider/claude-code>
- <https://help.router-for.me/configuration/provider/codex>
- <https://help.router-for.me/configuration/provider/xai>
- <https://opencode.ai/docs/go/>
- <https://code.claude.com/docs/en/installation>
- <https://code.claude.com/docs/en/llm-gateway>
