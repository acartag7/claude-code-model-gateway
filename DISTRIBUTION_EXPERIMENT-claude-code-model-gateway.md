# Four-week distribution experiment

## Decision and feature gate

For four weeks, this repository is a distribution experiment, not a platform project.

No feature work starts until the weekly outreach, conversation, follow-up, public-artifact, and evidence-log quotas for the preceding week are complete. A missed quota rolls forward and blocks feature work; it does not disappear.

Allowed engineering during the experiment:

1. Fix the existing release-blocking correctness defects:
   - remove the prohibited `--claude-login` instruction;
   - make safe mode safe for models below the 200K client budget;
   - account for every callable agent in full-mode compaction;
   - accept bracketed IPv6 loopback or remove the claim that it is accepted;
   - reject `--model=<value>` and any equivalent second-model override;
   - make smoke evidence distinguish requested route from actual route, or narrow the claim.
2. Add CI for the existing verification suite.
3. Create one tagged release and one low-friction installation path needed for the canonical demo.
4. Make documentation corrections required by current Anthropic and CLIProxyAPI behavior.
5. Fix defects encountered by an external activation when the fix stays inside the current boundary.

Postponed regardless of how interesting it is:

- new models or providers;
- automatic or semantic routing;
- a gateway server or protocol translation layer;
- web UI, desktop app, TUI dashboard, billing, analytics, cost controls, RBAC, SSO, policy, or team administration;
- orchestration features, workflow engines, review pipelines, or process enforcement;
- Windows/Linux installers;
- more unsupported context-window shims;
- generic LiteLLM, Portkey, OpenRouter, or multi-client support.

## One target, one pain, one promise

**Target user:** a macOS developer who uses Claude Code daily, already runs or is actively trying to run CLIProxyAPI, and wants at least one Codex/GLM/Grok model as a named main model or subagent.

**Painful use case:** “I selected model X for this Claude Code session or subagent, but I cannot confidently prove that X ran with the intended effort and a safe context boundary.”

**Promise:** “In 15 minutes, configure one exact non-Claude route and one pinned subagent in Claude Code, then produce redacted evidence that the intended gateway route ran—without silent cross-model fallback.”

Do not sell “one gateway for every model.” CLIProxyAPI and several larger projects already sell that. Sell the narrower failure removed: silent route and context mistakes in Claude Code.

## Canonical demo

Use one repeatable, under-eight-minute recording and a written transcript:

1. Start from a new macOS user profile or isolated `CLAUDE_CONFIG_DIR`.
2. Install the repository's released artifact and plugin.
3. Point it at an already authenticated, loopback-only CLIProxyAPI instance.
4. Run the deterministic doctor.
5. Launch one selected non-Claude model.
6. Invoke one generated subagent pinned to a different configured model.
7. Show redacted gateway-side evidence for requested model, actual model, and failure behavior.
8. Deliberately request an unavailable or unsafe route and show a closed failure.
9. Remove the installation and show what remains untouched.

The demo must not display credentials, prompts containing private code, OAuth files, home-directory paths, or internal infrastructure names. It must not claim that model self-identification proves the actual route.

## Channels

Use channels where this exact problem already appears. Do not file promotional GitHub issues.

1. `r/ClaudeCode`: one demo post in week 1 and one evidence/results post in week 4.
2. `r/ClaudeAI`: one technical comparison post in week 2, centered on the failure mode and current Anthropic support boundary.
3. CLIProxyAPI GitHub Discussions: one setup/conformance post in the appropriate category after checking community rules.
4. Claude Code Router GitHub Discussions: one factual “when this narrower kit is useful versus CCR” post after checking community rules.
5. Hacker News `Show HN`: one launch in week 3 only after at least three independent activations.
6. Direct outreach: people who publicly described exact-routing, context-window, or subagent-model problems in relevant GitHub discussions/issues or community threads. Contact them only through a channel they made available; no bulk DMs and no issue spam.

## Weekly quotas

Every week:

- 20 personalized direct outreaches to qualified target users;
- 5 completed 20-minute user conversations;
- 1 public artifact;
- 5 demo invitations;
- follow up with every prior participant on the schedule below;
- update the evidence log within 24 hours.

Across four weeks:

- 80 qualified outreaches;
- 20 completed conversations;
- 20 demo invitations;
- 8 independent clean-profile activations;
- 3 users active again at day 14;
- 2 operational issues or feature requests from repeat users;
- 1 unsolicited recommendation.

An “activation” requires the external user to install into an isolated or real profile, launch a configured route, and provide redacted route evidence. A repository clone, star, page view, demo view, or “looks useful” response is not an activation.

## Week-by-week execution

### Week 1: make the claim safe and test the first three installs

- Complete the existing correctness fixes and CI only after the first 20 outreaches are sent and the first 5 conversations are booked.
- Publish the canonical demo and its exact test environment.
- Run 3 observed activations with users who already operate CLIProxyAPI.
- Record setup time, every manual intervention, every false-success state, and the alternative each user previously used.
- Public artifact: canonical demo plus a short failure-oriented setup note.

Gate to week 2: at least 15 replies or explicit non-replies classified, 5 conversations completed, and 2 external activations. Otherwise do no packaging work; revise the target/message.

### Week 2: test repeatability without hand-holding

- Send the same released instructions to 5 new qualified users.
- Observe at most the first 10 minutes, then stop helping and record where they fail.
- Follow up with week-1 users on day 7.
- Compare the workflow honestly with Claude Code Router, CLIProxyAPI's own UI ecosystem, and Claudish.
- Public artifact: a conformance matrix showing supported, unsupported, and unverified Claude Code behaviors.

Gate to week 3: at least 4 cumulative activations, including 2 without live hand-holding. Otherwise reposition around the failure users actually described; do not add features.

### Week 3: test recurring value

- Ask activated users to use the route for one real task and one later task.
- Capture whether they returned because the kit saved time or merely because the experiment asked them to.
- Publish `Show HN` only if 3 independent activations already succeeded.
- Public artifact: a redacted incident or compatibility report from real usage, including the failure and the fix or limitation.

Gate to week 4: at least 2 users have returned for a second real task and at least 1 operational need arose without prompting. Otherwise prepare to keep it as OSS/portfolio evidence.

### Week 4: test pull, willingness to pay, and recommendation

- Conduct day-14 follow-ups with all eligible users.
- Ask each active user: “What would you do if this disappeared?” and “Would you pay for maintained compatibility or deployment help? How much and from which budget?”
- Do not pitch a subscription before asking.
- Ask satisfied users to share it only after they report value; record unsolicited shares separately.
- Public artifact: results report with the full funnel, failures, and decision.

## Follow-up schedule

- Day 0: send install instructions and book the activation.
- Day 2: ask whether installation was attempted; collect the first blocker.
- Day 7: ask for the last real task run, not an opinion.
- Day 14: ask whether they used it again without prompting and what broke.
- Day 28: ask what they use now, whether they recommended it, and whether they would pay for maintenance or deployment.

No response after day 2 and day 7 is marked inactive. Do not keep nudging.

## Evidence log

Keep one row per person. Use stable anonymous IDs in any public report.

| User ID | Date/source | Qualified? | Current alternative | Pain in their words | Conversation | Demo | Install attempted | Activated | Route proof | Day-7 real use | Day-14 repeat | Operational request | Willingness to pay | Unsolicited recommendation | Outcome/notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U001 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

Weekly funnel:

| Week | Qualified outreach | Replies | Conversations | Demo invitations | Attempts | Activations | Unassisted activations | Repeat users | Operational requests | Public artifact URL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |

## Four-week decision rules

Apply the first matching outcome:

1. **Continue narrowly:** at least 8 activations, 3 day-14 repeat users, 2 real operational requests from repeat users, and 1 unsolicited recommendation. Continue only the exact compatibility/verification wedge.
2. **Reposition:** at least 15 qualified conversations reveal one repeated, urgent adjacent pain, but fewer than 4 users activate this solution. Write a new problem statement before code.
3. **Keep as portfolio/OSS:** 4–7 users activate and at least 2 repeat, but nobody identifies a budget or recurring high-cost pain. Maintain compatibility and documentation; no company roadmap.
4. **Pause:** fewer than 4 activate, or activation is consistently a one-time curiosity, despite completing all outreach and conversation quotas.
5. **Stop:** fewer than 2 activate, nobody repeats, and target users prefer existing routers or direct Claude Code configuration. Archive the product ambition; preserve the repository as a technical artifact.

Missing the outreach or conversation quota is not evidence that the market rejected the project. It is evidence that the experiment was not run, and it keeps the feature freeze in force.
