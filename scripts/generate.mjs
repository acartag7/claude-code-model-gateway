import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, modelMap } from "./lib/catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = "plugins/model-gateway";
const generatedMarker = "<!-- Generated from models.yaml. Do not edit. -->";
const generatedHeader = `${generatedMarker}\n`;

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}

function renderAgent(agent, model) {
  const lines = [
    "---",
    `name: ${agent.name}`,
    `description: ${JSON.stringify(agent.description)}`,
    `model: ${model.claudeCodeModel}`,
    `effort: ${agent.effort}`,
  ];
  if (agent.tools) lines.push(`tools: ${agent.tools.join(", ")}`);
  lines.push(
    "---",
    "",
    generatedMarker,
    "",
    "This agent supplies model and tool routing only. Project and task instructions",
    "remain the process contract and always take precedence.",
    "Follow the task contract exactly. Report evidence, uncertainty, and blockers.",
    "Do not silently switch models or weaken acceptance criteria.",
    "",
  );
  return lines.join("\n");
}

function renderRoutingReference(catalog) {
  const fallback = modelMap(catalog).get(catalog.fallbackModel).claudeCodeModel;
  const rows = catalog.models.map((model) =>
    `| ${escapeCell(model.name)} | \`${model.claudeCodeModel}\` | ${model.recommendedEffort} | ${model.contextTokens.toLocaleString("en-US")} | ${model.roles.join(", ")} | ${model.contextEvidence} |`,
  );
  return `${generatedHeader}
# Model routing reference

Use exact model IDs. Custom models use Claude Code's conservative 200K client
budget in safe mode even when the upstream context is larger.

| Model | Claude Code value | Effort | Upstream context | Best for | Evidence |
|---|---|---:|---:|---|---|
${rows.join("\n")}

Default fallback: \`${fallback}\`.

This table selects models, not process isolation. If a project requires two
seats to use different harnesses, two subagents in one Claude Code process do
not satisfy that requirement.

Do not select GPT Image 2 as an agent. It is a direct image-generation API
model and is intentionally absent from this routing table.
`;
}

export function renderFiles(catalog) {
  const models = modelMap(catalog);
  const fallback = models.get(catalog.fallbackModel);
  const files = new Map();
  for (const agent of catalog.agents) {
    const contents = renderAgent(agent, models.get(agent.model));
    files.set(`.claude/agents/${agent.name}.md`, contents);
    files.set(`${pluginRoot}/agents/${agent.name}.md`, contents);
  }
  const routingReference = renderRoutingReference(catalog);
  files.set(
    ".claude/skills/choose-model/references/model-routing.md",
    routingReference,
  );
  files.set(`${pluginRoot}/skills/choose-model/references/model-routing.md`, routingReference);
  files.set(
    `${pluginRoot}/skills/choose-model/SKILL.md`,
    readFileSync(path.join(root, ".claude", "skills", "choose-model", "SKILL.md"), "utf8"),
  );
  files.set(
    "generated/claude-settings.json",
    `${JSON.stringify({
      model: fallback.claudeCodeModel,
      effortLevel: "high",
      alwaysThinkingEnabled: true,
      autoCompactEnabled: catalog.autoCompactEnabled,
      env: {
        CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
        CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: String(catalog.autoCompactPercent),
      },
    }, null, 2)}\n`,
  );
  files.set(
    "generated/model-profiles.json",
    `${JSON.stringify({
      safeCustomContextTokens: catalog.safeCustomContextTokens,
      autoCompactPercent: catalog.autoCompactPercent,
      profiles: Object.fromEntries(catalog.models.map((model) => [model.id, {
        safeModel: model.claudeCodeModel,
        upstreamContextTokens: model.contextTokens,
        recommendedEffort: model.recommendedEffort,
        experimentalFullContext: model.experimentalFullContext ?? null,
      }])),
    }, null, 2)}\n`,
  );
  return files;
}

async function safeWrite(relative, contents) {
  const destination = path.resolve(root, relative);
  if (!destination.startsWith(`${root}${path.sep}`)) throw new Error("Generated path escaped repository root");
  const parent = path.dirname(destination);
  await mkdir(parent, { recursive: true, mode: 0o755 });
  const rootReal = await realpath(root);
  const parentReal = await realpath(parent);
  if (parentReal !== rootReal && !parentReal.startsWith(`${rootReal}${path.sep}`)) {
    throw new Error("Generated directory escaped repository root");
  }
  const temporary = path.join(parentReal, `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await chmod(temporary, 0o644);
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function staleGeneratedAgentsIn(directory, relativeDirectory, files) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  if (entries.length > 256) throw new Error("Agent directory contains too many entries");
  const stale = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    const relative = `${relativeDirectory}/${entry.name}`;
    if (files.has(relative)) continue;
    const file = path.join(directory, entry.name);
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.size > 256 * 1024) continue;
    const contents = await readFile(file, "utf8");
    if (contents.includes(generatedMarker)) stale.push(relative);
  }
  return stale;
}

async function staleGeneratedAgents(files) {
  const directories = [
    [path.join(root, ".claude", "agents"), ".claude/agents"],
    [path.join(root, pluginRoot, "agents"), `${pluginRoot}/agents`],
  ];
  const stale = [];
  for (const [directory, relative] of directories) {
    stale.push(...await staleGeneratedAgentsIn(directory, relative, files));
  }
  return stale;
}

async function main() {
  const check = process.argv.slice(2).includes("--check");
  const catalog = await loadCatalog(root);
  const files = renderFiles(catalog);
  const drift = [];
  for (const [relative, contents] of files) {
    if (check) {
      const current = await readFile(path.join(root, relative), "utf8").catch(() => null);
      if (current !== contents) drift.push(relative);
    } else {
      await safeWrite(relative, contents);
    }
  }
  const stale = await staleGeneratedAgents(files);
  if (check) drift.push(...stale);
  else {
    for (const relative of stale) await unlink(path.join(root, relative));
  }
  if (drift.length > 0) throw new Error(`Generated files are stale: ${drift.join(", ")}`);
  console.log(check ? "Generated files are current." : `Generated ${files.size} files.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
