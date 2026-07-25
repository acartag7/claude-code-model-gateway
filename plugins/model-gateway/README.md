# Model Gateway plugin

This Claude Code plugin provides the generated model-routing agents and the
`/model-gateway:choose-model` skill. It does not install CLIProxyAPI, authenticate
providers, set gateway credentials, or replace project workflow instructions.

The agents are namespaced by Claude Code. For example:

```text
@model-gateway:spec-critic
@model-gateway:implementer
```

Project instructions remain authoritative. In a governed repository, give the
namespaced agent the repository's exact role prompt; this plugin supplies only
the configured model, effort, and tool boundary.

If a process requires two seats to use different harnesses, two agents inside
the same Claude Code process do not satisfy that rule merely because their
models come from different providers.
