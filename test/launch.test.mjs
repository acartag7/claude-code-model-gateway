import path from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadCatalog, modelMap } from "../scripts/lib/catalog.mjs";
import {
  parseLaunchArguments,
  resolveClaudeArguments,
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

test("launch passes the catalog's recommended effort", async () => {
  const catalog = await loadCatalog(root);
  const model = modelMap(catalog).get("claude-opus-5");
  assert.deepEqual(
    resolveClaudeArguments("claude-opus-5[1m]", model, ["--print"]),
    ["--model", "claude-opus-5[1m]", "--effort", model.recommendedEffort, "--print"],
  );
});

test("an explicit effort argument wins over the catalog", async () => {
  const catalog = await loadCatalog(root);
  const model = modelMap(catalog).get("claude-opus-5");
  for (const override of [["--effort", "low"], ["--effort=low"]]) {
    const resolved = resolveClaudeArguments("claude-opus-5", model, override);
    assert.deepEqual(resolved, ["--model", "claude-opus-5", ...override]);
    assert.equal(resolved.filter((argument) => argument.startsWith("--effort")).length, 1);
  }
});

// The two tests above pin resolveClaudeArguments itself, but not that the
// launcher actually calls it — reverting the spawn line leaves them green. This
// runs the real entrypoint against a stub `claude` on PATH and inspects the argv
// it received, so the wiring is covered too.
test("the launcher entrypoint really forwards effort to claude", async () => {
  const stubDir = await mkdtemp(path.join(tmpdir(), "gateway-launch-"));
  const argvLog = path.join(stubDir, "argv.txt");
  await writeFile(
    path.join(stubDir, "claude"),
    `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argvLog)}\n`,
    { mode: 0o755 },
  );
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "launch.mjs"), "safe", "claude-opus-5"], {
      env: {
        ...process.env,
        PATH: `${stubDir}:${process.env.PATH}`,
        MODEL_GATEWAY_URL: "https://example.com",
        MODEL_GATEWAY_API_KEY: "0".repeat(32),
      },
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`launch exited ${code}`))));
  });
  const forwarded = (await readFile(argvLog, "utf8")).trim().split("\n");
  const catalog = await loadCatalog(root);
  const model = modelMap(catalog).get("claude-opus-5");
  assert.deepEqual(forwarded, ["--model", model.claudeCodeModel, "--effort", model.recommendedEffort]);
  await rm(stubDir, { recursive: true, force: true });
});
