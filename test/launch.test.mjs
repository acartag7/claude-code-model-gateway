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
  resolveContextEnvironment,
  isAnthropic,
} from "../scripts/launch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("launch accepts pnpm's forwarded separator", () => {
  assert.deepEqual(
    parseLaunchArguments(["--", "gpt-5.6-sol", "--print"]),
    { modelId: "gpt-5.6-sol", claudeArgs: ["--print"] },
  );
});

test("a custom model's window never exceeds the smallest installed custom agent", async () => {
  const catalog = await loadCatalog(root);
  const models = modelMap(catalog);
  // Astra is 272K upstream, but the generated agents install a 200K custom
  // model (grok-composer-2.5-fast). CLAUDE_CODE_MAX_CONTEXT_TOKENS is one
  // process-wide value for every unrecognized id, so a 272K value would make
  // that agent claim a window its provider rejects. The window is therefore
  // the smallest custom participant — the same tradeoff the old full mode
  // documented, now the default for every custom launch.
  const astra = models.get("gpt-6-astra");
  const env = resolveContextEnvironment(catalog, astra);
  assert.equal(env.window, 200000);
  assert.equal(env.constrainedBy, "grok-composer-2.5-fast");
});

test("the process-wide window is constrained by the smallest custom participant", async () => {
  const catalog = await loadCatalog(root);
  const models = modelMap(catalog);
  // A session on GLM 5.3 (1M) with non-Claude agents pinned to 200K–500K
  // models must compact at the smallest of those windows, not the main
  // model's: one process-wide value has to fit every custom participant.
  const glm = models.get("zai/glm-5.3");
  const env = resolveContextEnvironment(catalog, glm);
  const smallestAgentModel = catalog.agents
    .map((agent) => models.get(agent.model))
    .filter((m) => m.provider !== "anthropic")
    .reduce((a, b) => (a.contextTokens < b.contextTokens ? a : b));
  assert.equal(env.window, smallestAgentModel.contextTokens);
  assert.ok(env.window < glm.contextTokens);
  assert.equal(env.constrainedBy, smallestAgentModel.id);
});

test("Claude models use native budgeting and never the env var", async () => {
  const catalog = await loadCatalog(root);
  const models = modelMap(catalog);
  const opus = models.get("claude-opus-5");
  assert.ok(isAnthropic(opus));
  // Sanity: the ids in the catalog keep the [1m] suffix, which Claude Code
  // budgets natively at 1M. Pairing the env var with a recognized id would
  // mis-budget same-process custom-model subagents, so the launcher must not
  // set it for them.
  assert.equal(opus.claudeCodeModel, "claude-opus-5[1m]");
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

// The tests above pin resolveClaudeArguments itself, but not that the launcher
// actually calls it — reverting the spawn line leaves them green. This runs the
// real entrypoint against a stub `claude` on PATH and inspects the argv and
// env it received, so the wiring is covered too.
test("the real entrypoint wires model, effort, and the context env var", async () => {
  const staging = await mkdtemp(path.join(tmpdir(), "launch-e2e-"));
  try {
    await writeFile(path.join(staging, "claude"), "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$ARGV_FILE\"\nprintf '%s\\n' \"${CLAUDE_CODE_MAX_CONTEXT_TOKENS:-unset}\" > \"$ENV_FILE\"\n");
    const previous = process.env.ARGV_FILE;
    const previousEnv = process.env.ENV_FILE;
    process.env.ARGV_FILE = path.join(staging, "argv");
    process.env.ENV_FILE = path.join(staging, "envout");
    await writeFile(path.join(staging, "claude"), "#!/bin/sh\nchmod +x /dev/null 2>/dev/null; printf '%s\\n' \"$@\" > \"$ARGV_FILE\"; printf '%s\\n' \"${CLAUDE_CODE_MAX_CONTEXT_TOKENS:-unset}\" > \"$ENV_FILE\"\n");
    const { chmod } = await import("node:fs/promises");
    await chmod(path.join(staging, "claude"), 0o755);
    const child = spawn(process.execPath, [path.join(root, "scripts", "launch.mjs"), "gpt-6-astra"], {
      env: {
        ...process.env,
        PATH: `${staging}:${process.env.PATH}`,
        MODEL_GATEWAY_URL: "http://127.0.0.1:8317",
        MODEL_GATEWAY_API_KEY: "x".repeat(48),
      },
      stdio: "ignore",
    });
    const code = await new Promise((resolve) => child.on("exit", (c) => resolve(c ?? 0)));
    assert.equal(code, 0);
    const argv = (await readFile(path.join(staging, "argv"), "utf8")).trim().split("\n");
    assert.deepEqual(argv, ["--model", "gpt-6-astra", "--effort", "xhigh"]);
    const envValue = (await readFile(path.join(staging, "envout"), "utf8")).trim();
    assert.equal(envValue, "200000"); // smallest installed custom agent, not Astra 272K
    if (previous === undefined) delete process.env.ARGV_FILE; else process.env.ARGV_FILE = previous;
    if (previousEnv === undefined) delete process.env.ENV_FILE; else process.env.ENV_FILE = previous;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
});
