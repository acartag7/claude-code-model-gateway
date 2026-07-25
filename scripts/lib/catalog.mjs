import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const MAX_CATALOG_BYTES = 256 * 1024;
const ROOT_KEYS = new Set([
  "version",
  "fallbackModel",
  "safeCustomContextTokens",
  "autoCompactEnabled",
  "autoCompactPercent",
  "models",
  "agents",
]);
const MODEL_KEYS = new Set([
  "id",
  "name",
  "provider",
  "contextTokens",
  "contextEvidence",
  "claudeCodeModel",
  "recommendedEffort",
  "roles",
  "experimentalFullContext",
]);
const EXPERIMENT_KEYS = new Set([
  "model",
  "autoCompactWindowTokens",
  "note",
]);
const AGENT_KEYS = new Set([
  "name",
  "description",
  "model",
  "effort",
  "tools",
  "contextMode",
]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const CONTEXT_MODES = new Set(["safe", "full"]);

function fail(message) {
  throw new Error(`Invalid models.yaml: ${message}`);
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be a mapping`);
  }
}

function rejectUnknown(record, allowed, label) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field ${key}`);
  }
}

function requireString(value, label, pattern = null) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240) {
    fail(`${label} must be a non-empty bounded string`);
  }
  if (value.includes("\n") || value.includes("\r")) {
    fail(`${label} must be a single line`);
  }
  if (pattern && !pattern.test(value)) fail(`${label} has an invalid format`);
  return value;
}

function requireInteger(value, label, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${label} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    fail(`${label} must be a non-empty bounded list`);
  }
  return value.map((entry, index) =>
    requireString(entry, `${label}[${index}]`, /^[A-Za-z0-9][A-Za-z0-9./_-]*$/),
  );
}

export function validateCatalog(catalog) {
  assertRecord(catalog, "root");
  rejectUnknown(catalog, ROOT_KEYS, "root");
  if (catalog.version !== 1) fail("version must be 1");
  requireString(catalog.fallbackModel, "fallbackModel", /^[a-z0-9][a-z0-9./_-]*$/);
  requireInteger(catalog.safeCustomContextTokens, "safeCustomContextTokens", 1000);
  if (catalog.autoCompactEnabled !== true) fail("autoCompactEnabled must be true");
  requireInteger(catalog.autoCompactPercent, "autoCompactPercent", 1);
  if (catalog.autoCompactPercent > 100) fail("autoCompactPercent must not exceed 100");
  if (!Array.isArray(catalog.models) || catalog.models.length === 0 || catalog.models.length > 64) {
    fail("models must be a non-empty bounded list");
  }
  if (!Array.isArray(catalog.agents) || catalog.agents.length === 0 || catalog.agents.length > 64) {
    fail("agents must be a non-empty bounded list");
  }

  const modelIds = new Set();
  for (const [index, model] of catalog.models.entries()) {
    assertRecord(model, `models[${index}]`);
    rejectUnknown(model, MODEL_KEYS, `models[${index}]`);
    const id = requireString(model.id, `models[${index}].id`, /^[a-z0-9][a-z0-9./_-]*$/);
    if (modelIds.has(id)) fail(`duplicate model id ${id}`);
    modelIds.add(id);
    requireString(model.name, `models[${index}].name`);
    requireString(model.provider, `models[${index}].provider`, /^[a-z0-9][a-z0-9-]*$/);
    requireInteger(model.contextTokens, `models[${index}].contextTokens`, 1000);
    requireString(model.contextEvidence, `models[${index}].contextEvidence`, /^[a-z0-9][a-z0-9-]*$/);
    requireString(model.claudeCodeModel, `models[${index}].claudeCodeModel`, /^[a-z0-9][a-z0-9./_\[\]-]*$/);
    requireString(model.recommendedEffort, `models[${index}].recommendedEffort`);
    if (!EFFORTS.has(model.recommendedEffort)) fail(`${id} has unsupported recommendedEffort`);
    requireStringArray(model.roles, `models[${index}].roles`);
    if (model.experimentalFullContext !== undefined) {
      assertRecord(model.experimentalFullContext, `${id}.experimentalFullContext`);
      rejectUnknown(model.experimentalFullContext, EXPERIMENT_KEYS, `${id}.experimentalFullContext`);
      requireString(model.experimentalFullContext.model, `${id}.experimentalFullContext.model`, /^[a-z0-9][a-z0-9./_\[\]-]*$/);
      const window = requireInteger(
        model.experimentalFullContext.autoCompactWindowTokens,
        `${id}.experimentalFullContext.autoCompactWindowTokens`,
        1000,
      );
      if (window > model.contextTokens) fail(`${id} experimental window exceeds upstream context`);
      requireString(model.experimentalFullContext.note, `${id}.experimentalFullContext.note`);
    }
  }
  if (!modelIds.has(catalog.fallbackModel)) fail("fallbackModel does not exist");
  if (modelIds.has("gpt-image-2")) fail("gpt-image-2 is not an agent model and must not be routed");

  const agentNames = new Set();
  for (const [index, agent] of catalog.agents.entries()) {
    assertRecord(agent, `agents[${index}]`);
    rejectUnknown(agent, AGENT_KEYS, `agents[${index}]`);
    const name = requireString(agent.name, `agents[${index}].name`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    if (agentNames.has(name)) fail(`duplicate agent name ${name}`);
    agentNames.add(name);
    requireString(agent.description, `agents[${index}].description`);
    requireString(agent.model, `agents[${index}].model`, /^[a-z0-9][a-z0-9./_-]*$/);
    if (!modelIds.has(agent.model)) fail(`${name} references unknown model ${agent.model}`);
    requireString(agent.effort, `agents[${index}].effort`);
    if (!EFFORTS.has(agent.effort)) fail(`${name} has unsupported effort`);
    if (agent.tools !== undefined) requireStringArray(agent.tools, `agents[${index}].tools`);
    if (agent.contextMode !== undefined) {
      requireString(agent.contextMode, `agents[${index}].contextMode`);
      if (!CONTEXT_MODES.has(agent.contextMode)) fail(`${name} has unsupported contextMode`);
      if (agent.contextMode === "full") {
        const target = catalog.models.find((candidate) => candidate.id === agent.model);
        if (!target.experimentalFullContext) {
          fail(`${name} requests full context but ${agent.model} has no experimentalFullContext profile`);
        }
      }
    }
  }

  return catalog;
}

export function parseCatalog(text) {
  const document = YAML.parseDocument(text, {
    maxAliasCount: 0,
    merge: false,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) fail(document.errors[0].message);
  try {
    return validateCatalog(document.toJS({ maxAliasCount: 0 }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid models.yaml:")) throw error;
    fail("aliases and cyclic references are not allowed");
  }
}

export async function loadCatalog(root = process.cwd()) {
  const file = path.join(root, "models.yaml");
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size > MAX_CATALOG_BYTES) {
    fail("models.yaml must be a regular file no larger than 256 KiB");
  }
  return parseCatalog(await readFile(file, "utf8"));
}

export function modelMap(catalog) {
  return new Map(catalog.models.map((model) => [model.id, model]));
}
