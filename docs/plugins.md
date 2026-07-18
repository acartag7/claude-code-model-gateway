# Claude Code plugin

The `model-gateway` plugin distributes the generated agents and the
`choose-model` skill without copying them directly into every Claude profile.
It is deliberately only the Claude-side routing layer.

## Install

Add this repository as a marketplace and install the plugin at user scope:

```sh
claude plugin marketplace add acartag7/claude-code-model-gateway
claude plugin install model-gateway@claude-code-model-gateway --scope user
```

Inside Claude Code, run `/reload-plugins`. The skill is available as:

```text
/model-gateway:choose-model
```

Custom agents are namespaced as well:

```text
@model-gateway:spec-critic
@model-gateway:acceptance-author
@model-gateway:implementer
@model-gateway:integration-reviewer
@model-gateway:independent-reviewer
@model-gateway:fast-worker
```

Update or remove it with Claude Code's normal plugin commands:

```sh
claude plugin marketplace update claude-code-model-gateway
claude plugin uninstall model-gateway@claude-code-model-gateway --scope user
```

## What the plugin owns

- Exact model and effort values for each generated agent
- Agent tool restrictions from `models.yaml`
- The namespaced `choose-model` skill
- The generated routing reference

## What remains outside the plugin

- Installing and running CLIProxyAPI
- Provider OAuth and API credentials
- Gateway bearer keys and Cloudflare Access credentials
- `ANTHROPIC_BASE_URL` and other process environment variables
- Auto-compaction settings
- Safe versus experimental context-window launch profiles
- Machine-level setup, doctor checks, and live smoke tests

Claude Code copies installed plugins into its cache. A plugin cannot rely on
scripts elsewhere in this repository, and it cannot change the environment of
the Claude process that already loaded it. Use the repository launcher or a
future companion CLI for those machine-level responsibilities.

## Process frameworks and Engineering OS

There is no file or namespace collision with Engineering OS. Plugin skills and
agents are scoped under `model-gateway`, and the plugin ships no settings,
hooks, process prompts, or enforcement.

The responsibility split is:

```text
Engineering OS  -> tier, stage order, exact role prompt, artifacts, gates
model-gateway   -> exact model, effort, and tool boundary for one seat
CLIProxyAPI     -> provider authentication and request routing
process-guard   -> enforcement outside the agent runtime
```

Project and task instructions always win. For example, fill Engineering OS's
implementer template first, then give that exact task to
`@model-gateway:implementer`. The plugin's generated prompt explicitly says it
is only a routing seat and does not replace the project's process contract.

One current Engineering OS rule cannot be collapsed into a single Claude Code
workflow: its acceptance author must use a different harness from the coder.
Using `@model-gateway:acceptance-author` and `@model-gateway:implementer` in the
same Claude Code process would not satisfy that rule merely because the models
come from different providers. Keep those seats in separate required harnesses,
or change the Engineering OS contract explicitly before treating model-family
separation as sufficient.

## Source and validation

`models.yaml` remains the model and agent source of truth. `pnpm generate`
writes both the standalone `.claude/` assets and the plugin copies. Validation:

```sh
pnpm verify
pnpm run plugin:validate
```

The plugin manifest has an explicit version. Every plugin release must bump
both `package.json` and `plugins/model-gateway/.claude-plugin/plugin.json`; the
test suite requires them to match.
