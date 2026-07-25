import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, modelMap } from "./lib/catalog.mjs";
import { gatewayClaudeEnvironment } from "./lib/gateway.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.error("Usage: pnpm launch -- <safe|full> <model-id> [claude arguments]");
}

// Claude Code applies one compaction threshold per process, shared by the main
// model and every subagent. The only safe value is the smallest upstream window
// among the participants that claim a raised ceiling: a larger value lets a
// smaller-window model reach its provider limit before compaction ever fires.
export function resolveFullContextWindow(catalog, model) {
  const models = modelMap(catalog);
  const participants = [model];
  for (const agent of catalog.agents) {
    if (agent.contextMode !== "full") continue;
    participants.push(models.get(agent.model));
  }
  let constrainedBy = model;
  let window = model.experimentalFullContext.autoCompactWindowTokens;
  for (const participant of participants) {
    const candidate = participant.experimentalFullContext.autoCompactWindowTokens;
    if (candidate < window) {
      window = candidate;
      constrainedBy = participant;
    }
  }
  return { window, constrainedBy: constrainedBy.id };
}

export function underPromisedFullContextAgents(catalog) {
  const models = modelMap(catalog);
  return catalog.agents
    .filter((agent) => agent.contextMode === "full")
    .filter((agent) => models.get(agent.model).contextTokens < 1000000)
    .map((agent) => agent.name);
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
  const [mode, modelId, ...claudeArgs] = normalized;
  return { mode, modelId, claudeArgs };
}

async function main() {
  const { mode, modelId, claudeArgs } = parseLaunchArguments(process.argv.slice(2));
  if (!new Set(["safe", "full"]).has(mode) || !modelId) {
    usage();
    process.exitCode = 2;
    return;
  }
  if (claudeArgs.includes("--model")) throw new Error("Do not pass a second --model argument");
  const catalog = await loadCatalog(root);
  const model = modelMap(catalog).get(modelId);
  if (!model) throw new Error(`Unknown model ${modelId}`);
  let selected = model.claudeCodeModel;
  const env = gatewayClaudeEnvironment();
  if (mode === "full") {
    if (!model.experimentalFullContext) throw new Error(`${modelId} has no full-context profile`);
    selected = model.experimentalFullContext.model;
    const { window, constrainedBy } = resolveFullContextWindow(catalog, model);
    env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(window);
    env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = String(catalog.autoCompactPercent);
    console.error(`context_mode=experimental model=${modelId} auto_compact_window=${window} constrained_by=${constrainedBy} percent=${env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE}`);
  } else {
    const underPromised = underPromisedFullContextAgents(catalog);
    if (underPromised.length > 0) {
      console.error(`context_warning mode=safe agents=${underPromised.join(",")} reason=raised-ceiling-without-process-compaction-window`);
    }
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
