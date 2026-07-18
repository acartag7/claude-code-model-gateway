# Agent setup contract

Use this contract to set up Claude Code Model Gateway with no prior machine or
conversation context. The human-edited source of truth is `models.yaml`.
Generated agents and settings must always match it. Never invent model IDs,
aliases, context sizes, provider availability, credentials, or successful live
results.

## Objective

On a new macOS machine, leave the operator with:

1. a validated loopback-only CLIProxyAPI configuration;
2. the selected providers authenticated by the human through their browser;
3. the generated Claude Code agents, skill, and settings installed;
4. deterministic checks passing;
5. the authenticated model catalog checked; and
6. at least one real model request passing when the operator authorizes quota use.

Do not claim setup is complete before those applicable checks pass.

## Read order

1. `README.md` for product intent and honest limitations.
2. `docs/setup.md` for the exact setup commands and expected output.
3. `models.yaml` for configured models, agents, effort, and context evidence.
4. `docs/custom-models.md` for model-picker and subagent constraints.
5. `docs/context-windows.md` before enabling any `full` profile.
6. `SECURITY.md` before changing network exposure or credential handling.

## Hard rules

- Use pnpm. The repository pins pnpm 10.32.0.
- Require Node.js 22 or newer.
- Treat `models.yaml` as the only editable catalog.
- After any catalog change, run `pnpm generate` and `pnpm verify`.
- Never hand-edit generated agents, generated settings, or generated profiles.
- Never print, log, commit, or copy gateway keys, API keys, OAuth files, or
  Cloudflare Access secrets into repository files.
- Never read a secret merely to prove that it exists. Use exit status or a
  redacted check.
- Never expose the local starter configuration beyond `127.0.0.1`.
- Never enable CLIProxyAPI remote management for this setup.
- Never enable request cloaking.
- Never silently substitute a different model. A fallback must record the
  requested model, actual model, and reason.
- Never rename a non-Claude model with a Claude prefix to force it into the
  model picker.
- Never claim a context window from the model name alone. Keep the evidence in
  `models.yaml` and the limitation in `docs/context-windows.md`.
- Browser OAuth is a human step. Pause for the operator to authenticate; never
  attempt to extract or display OAuth credentials.
- Run deterministic checks before live inference tests.
- Do not run `smoke` without making clear that it consumes provider quota.

## New local setup

Run from the repository root:

```sh
corepack enable
corepack install --global pnpm@10.32.0
brew install --cask claude-code
brew install cliproxyapi
pnpm install --frozen-lockfile
pnpm run preflight
pnpm verify
```

Required deterministic result:

- `preflight=ok ...`
- generated files current
- zero failed tests

Preview local bootstrap before applying it:

```sh
pnpm run bootstrap:local
pnpm run bootstrap:local -- --apply
```

Required result:

- `bootstrap_result=ok`
- runtime config mode `0600`
- runtime config and auth directories mode `0700`
- host `127.0.0.1`, port `8317`
- bearer key stored in macOS Keychain

For Z.AI, require the human to provide `ZAI_API_KEY` through their secret
manager, then use the documented `--with-zai` flow in `docs/setup.md`. Never
place the key in a command argument, repository file, or shell history.

Ask the human to run only the provider login commands they need:

```sh
cliproxyapi --config "$HOME/.cli-proxy-api/config.yaml" --claude-login
cliproxyapi --config "$HOME/.cli-proxy-api/config.yaml" --codex-login
cliproxyapi --config "$HOME/.cli-proxy-api/config.yaml" --xai-login
```

Start CLIProxyAPI in a separate terminal:

```sh
cliproxyapi --config "$HOME/.cli-proxy-api/config.yaml"
```

Load the gateway connection without displaying the bearer key:

```sh
export MODEL_GATEWAY_URL="http://127.0.0.1:8317"
export MODEL_GATEWAY_API_KEY="$(security find-generic-password -w -a "$USER" -s claude-code-model-gateway-api-key)"
```

Test an isolated Claude profile before modifying the real one:

```sh
export TEST_CLAUDE_CONFIG="$(mktemp -d)/.claude"
CLAUDE_CONFIG_DIR="$TEST_CLAUDE_CONFIG" pnpm run install:user
CLAUDE_CONFIG_DIR="$TEST_CLAUDE_CONFIG" pnpm run install:user -- --apply
pnpm run doctor -- --settings "$TEST_CLAUDE_CONFIG/settings.json"
```

Required result:

- `install_result=ok auto_compact=enabled`
- `catalog=ok generated=ok auto_compact=enabled live=skipped`

Only then preview and apply to the real profile:

```sh
pnpm run install:user
pnpm run install:user -- --apply
pnpm run doctor -- --settings "$HOME/.claude/settings.json"
pnpm run doctor -- --live
```

Required live result:

- `catalog=ok generated=ok auto_compact=enabled live=ok`

With the operator's approval to consume quota, run one model first:

```sh
pnpm run smoke -- --model claude-opus-4-8
```

Required result:

- `model=claude-opus-4-8 result=ok`

## Existing remote gateway

Do not run local bootstrap or provider login. Require a credential-free HTTPS
origin in `MODEL_GATEWAY_URL` and its bearer key in `MODEL_GATEWAY_API_KEY`.
For a Cloudflare Access service-token policy, require both
`MODEL_GATEWAY_CF_ACCESS_CLIENT_ID` and
`MODEL_GATEWAY_CF_ACCESS_CLIENT_SECRET`. Never accept only one.

Then run:

```sh
pnpm run preflight -- --existing-gateway
pnpm verify
pnpm run doctor -- --live
```

A redirect to browser login is a failure, not successful API authentication.

## Catalog changes

When the operator adds or removes a model:

1. Confirm the exact model ID from the authenticated `/v1/models` response or
   provider documentation.
2. Edit only `models.yaml`.
3. Remove agents that reference an unavailable model or explicitly update them.
4. Run `pnpm generate`.
5. Review every generated diff.
6. Run `pnpm verify`.
7. Run `pnpm run doctor -- --live` against the intended gateway.
8. Run a real smoke request only with quota approval.

## Failure handling

- `preflight_failed`: fix the named missing or old executable, then rerun.
- `bootstrap_failed`: do not overwrite the existing config or Keychain item;
  inspect and resolve the collision explicitly.
- `doctor_failed` with HTTP 302: the endpoint requires browser authentication
  and is not accepting the configured API credentials.
- `doctor_failed` with missing models: compare `models.yaml` against the exact
  authenticated catalog. Do not fabricate aliases.
- provider auth failure: reauthenticate that provider. Do not silently route to
  another model.
- context mismatch: return to safe mode. Do not raise a client limit without
  evidence for the upstream limit.

## Completion report

Report concrete evidence only:

- operating system and tool versions;
- deterministic test pass count;
- bootstrap result without any secret values;
- isolated-profile install result;
- live catalog result;
- each model actually smoke-tested;
- any interactive OAuth step still awaiting the human;
- any unavailable configured model;
- whether the real Claude profile was modified.
