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

test("GLM 5.3 Flash keeps its verified routing and context contract", async () => {
  const catalog = await loadCatalog(root);
  const model = catalog.models.find((candidate) => candidate.id === "zai/glm-5.3-flash");
  assert.deepEqual(model, {
    id: "zai/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    provider: "zai",
    contextTokens: 1000000,
    contextEvidence: "provider-docs",
    claudeCodeModel: "zai/glm-5.3-flash",
    recommendedEffort: "max",
    roles: ["fast-implementation", "general-engineering"],
  });
});

test("generated settings enable auto-compaction", async () => {
  const files = renderFiles(await loadCatalog(root));
  const settings = JSON.parse(files.get("generated/claude-settings.json"));
  assert.equal(settings.autoCompactEnabled, true);
});

test("the picker lineup lists every catalog model including non-Claude ids", async () => {
  const catalog = await loadCatalog(root);
  const files = renderFiles(catalog);
  const picker = JSON.parse(files.get("generated/claude-settings.json")).modelPicker;
  assert.equal(picker.replaceBuiltInOptions, false);
  assert.deepEqual(
    picker.options.map((row) => row.model),
    catalog.models.map((model) => model.claudeCodeModel),
  );
  // Discovery alone can never surface these; the lineup is their only path
  // into /model. If this drops to zero, the gateway sessions lose them.
  const nonClaude = picker.options.filter((row) => !/claude|anthropic/i.test(row.model));
  assert.ok(nonClaude.length >= 10, `expected the non-Claude majority, got ${nonClaude.length}`);
  for (const row of picker.options) {
    assert.ok(row.label && row.description, `row ${row.model} needs label and description`);
    assert.ok(!/\n/.test(row.description), "descriptions must stay one line");
  }
});

test("custom agents pin bare ids; only Claude models keep [1m]", async () => {
  const catalog = await loadCatalog(root);
  const files = renderFiles(catalog);
  for (const agent of catalog.agents) {
    const model = catalog.models.find((candidate) => candidate.id === agent.model);
    const generated = files.get(`.claude/agents/${agent.name}.md`);
    if (model.provider === "anthropic") {
      assert.match(generated, /model: .*\[1m\]/);
    } else {
      assert.doesNotMatch(generated, /model: .*\[1m\]/);
    }
  }
});

test("an agent referencing an unknown model fails closed", async () => {
  const source = await readFile(path.join(root, "models.yaml"), "utf8");
  const parsed = YAML.parse(source);
  parsed.agents[0].model = "gpt-nonexistent";
  assert.throws(() => parseCatalog(YAML.stringify(parsed)), /references unknown model/);
});

test("removed legacy fields fail closed", async () => {
  const source = await readFile(path.join(root, "models.yaml"), "utf8");
  const parsed = YAML.parse(source);
  parsed.models[0].experimentalFullContext = { model: "x[1m]", autoCompactWindowTokens: 100000, note: "y" };
  assert.throws(() => parseCatalog(YAML.stringify(parsed)), /unknown field experimentalFullContext/);
  parsed.models[0].experimentalFullContext = undefined;
  parsed.agents[0].contextMode = "full";
  assert.throws(() => parseCatalog(YAML.stringify(parsed)), /unknown field contextMode/);
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
