import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./lib/catalog.mjs";
import { gatewayClaudeEnvironment } from "./lib/gateway.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

async function run(model, env) {
  const { stdout } = await execFileAsync("claude", [
    "--model",
    model.claudeCodeModel,
    "--print",
    "--no-session-persistence",
    "--tools=",
    `Reply with exactly: MODEL_OK ${model.id}`,
  ], { env, maxBuffer: 1024 * 1024, timeout: 10 * 60 * 1000 });
  if (!stdout.includes(`MODEL_OK ${model.id}`)) {
    throw new Error(`${model.id} failed the Claude Code smoke test`);
  }
}

async function main() {
  const all = process.argv.includes("--all");
  const requested = process.argv.filter((value, index, values) => values[index - 1] === "--model");
  if (!all && requested.length === 0) throw new Error("Pass --all or one or more --model <id> arguments");
  const catalog = await loadCatalog(root);
  const selected = all ? catalog.models : catalog.models.filter((model) => requested.includes(model.id));
  if (selected.length !== (all ? catalog.models.length : new Set(requested).size)) {
    throw new Error("One or more requested model IDs are unknown");
  }
  const env = gatewayClaudeEnvironment();
  for (const model of selected) {
    await run(model, env);
    console.log(`model=${model.id} result=ok`);
  }
}

main().catch((error) => {
  console.error(`smoke_failed reason=${error.message}`);
  process.exitCode = 1;
});
