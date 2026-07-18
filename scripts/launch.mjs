import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, modelMap } from "./lib/catalog.mjs";
import { gatewayClaudeEnvironment } from "./lib/gateway.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.error("Usage: pnpm launch -- <safe|full> <model-id> [claude arguments]");
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
    env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(model.experimentalFullContext.autoCompactWindowTokens);
    env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = String(catalog.autoCompactPercent);
    console.error(`context_mode=experimental model=${modelId} auto_compact_window=${env.CLAUDE_CODE_AUTO_COMPACT_WINDOW} percent=${env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE}`);
  }
  const child = spawn("claude", ["--model", selected, ...claudeArgs], {
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
