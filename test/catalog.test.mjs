import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { loadCatalog, parseCatalog } from "../scripts/lib/catalog.mjs";
import { renderFiles } from "../scripts/generate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("catalog is valid and excludes image-only models", async () => {
  const catalog = await loadCatalog(root);
  assert.equal(catalog.autoCompactEnabled, true);
  assert.equal(catalog.models.some((model) => model.id === "gpt-image-2"), false);
  assert.equal(new Set(catalog.models.map((model) => model.id)).size, catalog.models.length);
});

test("generated settings enable auto-compaction", async () => {
  const files = renderFiles(await loadCatalog(root));
  const settings = JSON.parse(files.get("generated/claude-settings.json"));
  assert.equal(settings.autoCompactEnabled, true);
});

test("custom agents do not claim unsupported 1M context without an explicit opt-in", async () => {
  const catalog = await loadCatalog(root);
  const files = renderFiles(catalog);
  for (const agent of catalog.agents) {
    const model = catalog.models.find((candidate) => candidate.id === agent.model);
    const generated = files.get(`.claude/agents/${agent.name}.md`);
    if (model.provider === "anthropic") continue;
    if (agent.contextMode === "full") continue;
    assert.doesNotMatch(generated, /model: .*\[1m\]/);
  }
});

test("an agent opted into full context is generated with the experimental ceiling ID", async () => {
  const source = await readFile(path.join(root, "models.yaml"), "utf8");
  const parsed = YAML.parse(source);
  const agent = parsed.agents.find((candidate) => candidate.contextMode === "full");
  assert.ok(agent, "expected at least one agent opted into full context");
  const model = parsed.models.find((candidate) => candidate.id === agent.model);
  const files = renderFiles(parseCatalog(YAML.stringify(parsed)));
  assert.match(
    files.get(`.claude/agents/${agent.name}.md`),
    new RegExp(`model: ${model.experimentalFullContext.model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
});

test("full context is rejected for a model with no experimental profile", async () => {
  const source = await readFile(path.join(root, "models.yaml"), "utf8");
  const parsed = YAML.parse(source);
  const model = parsed.models.find((candidate) => !candidate.experimentalFullContext);
  parsed.agents[0].model = model.id;
  parsed.agents[0].contextMode = "full";
  assert.throws(() => parseCatalog(YAML.stringify(parsed)), /has no experimentalFullContext profile/);
});

test("an unsupported contextMode fails closed", async () => {
  const source = await readFile(path.join(root, "models.yaml"), "utf8");
  const parsed = YAML.parse(source);
  parsed.agents[0].contextMode = "unlimited";
  assert.throws(() => parseCatalog(YAML.stringify(parsed)), /unsupported contextMode/);
});

test("plugin agents match standalone agents and remain routing-only", async () => {
  const catalog = await loadCatalog(root);
  const files = renderFiles(catalog);
  for (const agent of catalog.agents) {
    const standalone = files.get(`.claude/agents/${agent.name}.md`);
    const plugin = files.get(`plugins/model-gateway/agents/${agent.name}.md`);
    assert.equal(plugin, standalone);
    assert.match(plugin, /supplies model and tool routing only/);
    assert.match(plugin, /Project and task instructions/);
  }
  assert.equal(
    files.get("plugins/model-gateway/skills/choose-model/SKILL.md"),
    await readFile(path.join(root, ".claude/skills/choose-model/SKILL.md"), "utf8"),
  );
  assert.match(
    files.get("plugins/model-gateway/skills/choose-model/SKILL.md"),
    /not different harnesses/,
  );
});

test("unknown fields fail closed", async () => {
  const source = await readFile(path.join(root, "models.yaml"), "utf8");
  const parsed = YAML.parse(source);
  parsed.models[0].surprise = true;
  assert.throws(() => parseCatalog(YAML.stringify(parsed)), /unknown field surprise/);
});

test("duplicate models are rejected", async () => {
  const source = await readFile(path.join(root, "models.yaml"), "utf8");
  const parsed = YAML.parse(source);
  parsed.models.push(structuredClone(parsed.models[0]));
  assert.throws(() => parseCatalog(YAML.stringify(parsed)), /duplicate model id/);
});

test("YAML aliases are rejected", async () => {
  assert.throws(
    () => parseCatalog("version: 1\nfallbackModel: &model claude-opus-4-8\nsafeCustomContextTokens: 200000\nautoCompactEnabled: true\nmodels: [*model]\nagents: []\n"),
    /aliases and cyclic references are not allowed/i,
  );
});

test("deeply nested YAML is rejected without a stack-overflow exception", () => {
  const nested = `${"[".repeat(5000)}1${"]".repeat(5000)}`;
  assert.throws(
    () => parseCatalog(nested),
    (error) => error instanceof Error && !(error instanceof RangeError),
  );
});
