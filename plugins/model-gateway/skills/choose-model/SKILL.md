---
name: choose-model
description: Select an explicit model, effort level, context mode, and fallback for engineering work routed through Claude Code and an LLM gateway. Use for implementation, acceptance-test authoring, contract or security review, integration review, long-context repository work, fast mechanical work, cross-family verification, or whenever a user asks which configured model should perform a task.
---

# Choose Model

<!-- Managed by claude-code-model-gateway. -->

Read `references/model-routing.md` before selecting a model.

## Select the route

1. Classify the task by role, blast radius, and required repository context.
2. Choose the narrowest capable model from the routing reference.
3. Use a different model family for adversarial review than the family that
   produced the artifact whenever the configured pool allows it.
4. Honor any project requirement for separate harnesses. Two provider models
   running as subagents in one Claude Code process are different model families,
   not different harnesses.
5. Default to safe context mode. Select experimental full-context mode only
   when the user explicitly accepts its unsupported Claude Code ceiling shim.
6. Name an explicit fallback. Never silently substitute it.
7. Return the exact Claude Code model value and effort level.

## Output

Return this compact record before dispatch:

```text
MODEL: <exact model value>
EFFORT: <level>
CONTEXT: safe | experimental-full
FALLBACK: <exact model value>
WHY: <one sentence>
```

If the selected provider fails authentication, stop or visibly retry the
declared fallback. Report both the requested and actual model.

Never route text-agent work to GPT Image 2. That model belongs to direct image
generation API calls and is intentionally outside the routing catalog.
