import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("installer previews and removes only stale managed assets", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "model-gateway-reconcile-"));
  const target = path.join(temporary, ".claude");
  const staleAgent = path.join(target, "agents", "retired-agent.md");
  const userAgent = path.join(target, "agents", "keep-agent.md");
  const staleSkill = path.join(target, "skills", "choose-model", "references", "retired.md");
  const userSkill = path.join(target, "skills", "choose-model", "references", "keep.md");
  try {
    await mkdir(path.dirname(staleAgent), { recursive: true });
    await mkdir(path.dirname(staleSkill), { recursive: true });
    await writeFile(staleAgent, "<!-- Generated from models.yaml. Do not edit. -->\nretired\n");
    await writeFile(userAgent, "user-owned\n");
    await writeFile(staleSkill, "# Managed by claude-code-model-gateway.\nretired\n");
    await writeFile(userSkill, "user-owned\n");

    const preview = await execFileAsync(process.execPath, [
      path.join(root, "scripts", "install-user.mjs"),
    ], { env: { ...process.env, CLAUDE_CONFIG_DIR: target } });
    assert.match(preview.stdout, /install_mode=dry-run .* remove=2/);
    assert.match(preview.stdout, /remove_path=agents\/retired-agent\.md/);
    assert.match(preview.stdout, /remove_path=skills\/choose-model\/references\/retired\.md/);
    assert.match(await readFile(staleAgent, "utf8"), /retired/);
    assert.match(await readFile(staleSkill, "utf8"), /retired/);

    const applied = await execFileAsync(process.execPath, [
      path.join(root, "scripts", "install-user.mjs"),
      "--apply",
    ], { env: { ...process.env, CLAUDE_CONFIG_DIR: target } });
    assert.match(applied.stdout, /install_result=ok .* removed=2/);
    await assert.rejects(readFile(staleAgent, "utf8"), { code: "ENOENT" });
    await assert.rejects(readFile(staleSkill, "utf8"), { code: "ENOENT" });
    assert.equal(await readFile(userAgent, "utf8"), "user-owned\n");
    assert.equal(await readFile(userSkill, "utf8"), "user-owned\n");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
