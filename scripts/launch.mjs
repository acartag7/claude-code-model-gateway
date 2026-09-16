import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, modelMap } from "./lib/catalog.mjs";
import { gatewayClaudeEnvironment } from "./lib/gateway.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.error("Usage: pnpm launch -- <model-id> [claude arguments]");
}

// Claude Code budgets a model id it recognizes natively; every unrecognized
// custom id gets one process-wide CLAUDE_CODE_MAX_CONTEXT_TOKENS value shared
// by the main model and any non-Claude subagents. The launcher sets that value
// to the smallest real upstream window among those participants, so no model in
// the process claims a window its provider would reject. Claude-family models
// keep their native [1m] ids and never receive the variable: pairing it with a
// recognized id mis-budgets same-process custom-model subagents.
export function resolveContextEnvironment(catalog, model) {
  const models = modelMap(catalog);
  const custom = [model, ...catalog.agents
    .map((agent) => models.get(agent.model))
    .filter((m) => m && m.provider !== "anthropic")];
  let window = model.contextTokens;
  let constrainedBy = model.id;
  for (const participant of custom) {
    if (participant.contextTokens < window) {
      window = participant.contextTokens;
      constrainedBy = participant.id;
    }
  }
  return { window, constrainedBy };
}

export function isAnthropic(model) {
  return model.provider === "anthropic";
}

// Curating recommendedEffort per model is pointless if the launcher never passes
// it: `claude --model X` alone runs at whatever effort happens to be globally
// active, so the documented examples silently ignored the catalog. An explicit
// user --effort still wins, in either the flag or --effort=value form.
export function resolveClaudeArguments(selected, model, claudeArgs) {
  const explicit = claudeArgs.some((argument) => (
    argument === "--effort" || argument.startsWith("--effort=")
  ));
  const effort = explicit ? [] : ["--effort", model.recommendedEffort];
  return ["--model", selected, ...effort, ...claudeArgs];
}

export function parseLaunchArguments(values) {
  const normalized = [...values];
  if (normalized[0] === "--") normalized.shift();
  const [modelId, ...claudeArgs] = normalized;
  return { modelId, claudeArgs };
}

async function main() {
  const { modelId, claudeArgs } = parseLaunchArguments(process.argv.slice(2));
  if (!modelId) {
    usage();
    process.exitCode = 2;
    return;
  }
  if (claudeArgs.includes("--model")) throw new Error("Do not pass a second --model argument");
  const catalog = await loadCatalog(root);
  const model = modelMap(catalog).get(modelId);
  if (!model) throw new Error(`Unknown model ${modelId}`);
  const selected = model.claudeCodeModel;
  const env = gatewayClaudeEnvironment();
  if (isAnthropic(model)) {
    console.error(`context_mode=native model=${modelId} window=${model.contextTokens} (Claude family; native budgeting)`);
  } else {
    const { window, constrainedBy } = resolveContextEnvironment(catalog, model);
    env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(window);
    console.error(`context_mode=catalog model=${modelId} window=${window} constrained_by=${constrainedBy} (smallest custom participant)`);
  }
  const child = spawn("claude", resolveClaudeArguments(selected, model, claudeArgs), {
    env,
    stdio: "inherit",
  });
  child.on("error", (error) => {
    console.error(`launch_failed reason=${error.code ?? "spawn-error"}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`launch_failed reason=${error.message}`);
    process.exitCode = 1;
  });
}
