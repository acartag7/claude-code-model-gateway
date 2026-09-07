* Project: Claude Code Model Gateway
* Current category: macOS-first configuration, launcher, verification kit, and Claude Code routing plugin built around CLIProxyAPI
* Primary user: an advanced Claude Code user who already wants CLIProxyAPI and needs explicit model IDs for Claude, Codex, GLM, or Grok
* Problem: Claude Code's custom-model routing, subagent overrides, model discovery, effort handling, and context accounting can silently differ from the operator's intent
* Current maturity: public pre-release OSS at version 0.1.0; one merged PR, no tagged release, no CI workflow, no published package, and four confirmed correctness defects still present on `main`
* Strongest technical asset: a bounded, fail-closed catalog that generates routing assets and detects drift while keeping provider and context limitations explicit
* Biggest technical weakness: the advertised exact/safe routing contract is not actually enforced or proven across model overrides, context windows, and smoke verification
* Existing adoption evidence: no stars, forks, watchers, issues, external contributors, releases, or corroborated external deployments as of 2026-07-28; owner-visible clone traffic is not adoption evidence
* Product potential: a useful but narrow OSS compatibility kit if independent CLIProxyAPI users repeatedly adopt it; weak standalone paid-product potential
* Company potential: very low because the problem is narrow, mostly setup and compatibility work, the upstream behavior is unsupported, and large adjacent projects already own gateway distribution
* Most credible moat: none today; a trusted compatibility/conformance reputation could become a narrow moat only after sustained independent usage
* Career signal: good evidence of careful boundary engineering, defensive configuration handling, and adversarial review; weak evidence of production operations, adoption, product judgment, or team-scale ownership
* Builder fit: technically enjoyable and aligned with security, tooling, and model-runtime investigation, but likely to become reactive compatibility maintenance rather than durable product building
* Recommended decision: validate narrowly for four weeks, then keep as focused OSS/portfolio evidence unless repeat external usage appears
* Four-week validation target: 8 independent clean-profile activations, 3 users still using it after 14 days, 2 real operational issues or requests from repeat users, and 1 unsolicited recommendation
* Do-not-build list: gateway server, web UI, desktop app, billing, team RBAC, policy engine, automatic model router, observability platform, more providers, orchestration framework, Windows/Linux installers, or more context-window shims
