import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadCatalog, modelMap } from "../scripts/lib/catalog.mjs";
import {
  parseLaunchArguments,
  resolveFullContextWindow,
  underPromisedFullContextAgents,
} from "../scripts/launch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("launch accepts pnpm's forwarded separator", () => {
  assert.deepEqual(
    parseLaunchArguments(["--", "safe", "gpt-5.6-terra", "--print"]),
    {
      mode: "safe",
      modelId: "gpt-5.6-terra",
      claudeArgs: ["--print"],
    },
  );
});

test("the full-context compaction window is constrained by the smallest participant", async () => {
  const catalog = await loadCatalog(root);
  const models = modelMap(catalog);
  const sol = models.get("gpt-5.6-sol");
  const glm = models.get("zai/glm-5.2");

  // implementer runs GLM at contextMode: full (1M upstream); launching Sol in
  // full mode must compact at Sol's 272K, not GLM's 1M.
  const solLaunch = resolveFullContextWindow(catalog, sol);
  assert.equal(solLaunch.window, sol.experimentalFullContext.autoCompactWindowTokens);
  assert.equal(solLaunch.constrainedBy, "gpt-5.6-sol");

  const glmLaunch = resolveFullContextWindow(catalog, glm);
  assert.ok(glmLaunch.window <= glm.experimentalFullContext.autoCompactWindowTokens);
});

test("safe mode warns when a full-context agent has no truthful ceiling", async () => {
  const catalog = await loadCatalog(root);
  assert.deepEqual(underPromisedFullContextAgents(catalog), []);

  const mutated = {
    ...catalog,
    agents: catalog.agents.map((agent) =>
      agent.name === "acceptance-author" ? { ...agent, contextMode: "full" } : agent,
    ),
  };
  assert.deepEqual(underPromisedFullContextAgents(mutated), ["acceptance-author"]);
});
