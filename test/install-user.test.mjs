import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mergeSettings } from "../scripts/install-user.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("installer preserves settings while enabling auto-compaction", () => {
  const merged = mergeSettings(
    { model: "sonnet", autoCompactEnabled: false, env: { EXISTING: "1" } },
    { model: "opus", autoCompactEnabled: true, env: { DISCOVERY: "1" } },
  );
  assert.deepEqual(merged, {
    model: "sonnet",
    autoCompactEnabled: true,
    env: { EXISTING: "1", DISCOVERY: "1" },
  });
});

test("installer rejects malformed settings before writing", () => {
  assert.throws(() => mergeSettings([], {}), /must be a JSON object/);
  assert.throws(() => mergeSettings({ env: [] }, {}), /env must be a JSON object/);
});

test("installer entrypoint configures an isolated empty profile", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "model-gateway-profile-"));
  const target = path.join(temporary, ".claude");
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(root, "scripts", "install-user.mjs"),
      "--apply",
    ], { env: { ...process.env, CLAUDE_CONFIG_DIR: target } });
    assert.match(stdout, /install_result=ok auto_compact=enabled/);
    const settings = JSON.parse(await readFile(path.join(target, "settings.json"), "utf8"));
    assert.equal(settings.autoCompactEnabled, true);
    const skill = await readFile(path.join(target, "skills", "choose-model", "SKILL.md"), "utf8");
    assert.match(skill, /name: choose-model/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
