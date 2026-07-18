import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildLocalConfig } from "../scripts/bootstrap-local.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("local bootstrap writes a locked-down config without printing its key", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "model-gateway-bootstrap-"));
  const configDir = path.join(temporary, "cli");
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(root, "scripts", "bootstrap-local.mjs"),
      "--apply",
      "--no-keychain",
    ], { env: { ...process.env, CLIPROXY_CONFIG_DIR: configDir } });
    const configPath = path.join(configDir, "config.yaml");
    const config = YAML.parse(await readFile(configPath, "utf8"));
    const gatewayKey = config["api-keys"][0];
    assert.equal(typeof gatewayKey, "string");
    assert.ok(gatewayKey.length >= 64);
    assert.doesNotMatch(stdout, new RegExp(gatewayKey));
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config["disable-claude-cloak-mode"], true);
    assert.deepEqual(config["quota-exceeded"], {
      "switch-project": false,
      "switch-preview-model": false,
      "antigravity-credits": false,
    });
    assert.equal((await stat(configDir)).mode & 0o777, 0o700);
    assert.equal((await stat(configPath)).mode & 0o777, 0o600);

    await assert.rejects(
      execFileAsync(process.execPath, [
        path.join(root, "scripts", "bootstrap-local.mjs"),
        "--apply",
        "--no-keychain",
      ], { env: { ...process.env, CLIPROXY_CONFIG_DIR: configDir } }),
      /Refusing to overwrite existing/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Z.AI is added only when its key is explicitly supplied", () => {
  const gatewayKey = randomBytes(48).toString("base64url");
  const zaiKey = randomBytes(32).toString("base64url");
  const template = {
    host: "127.0.0.1",
    port: 8317,
    "auth-dir": "unused",
    "api-keys": [],
  };
  const withoutZai = buildLocalConfig(template, { authDir: "/tmp/auth", gatewayKey });
  assert.equal(withoutZai["openai-compatibility"], undefined);
  const withZai = buildLocalConfig(template, { authDir: "/tmp/auth", gatewayKey, zaiKey });
  assert.equal(withZai["openai-compatibility"][0].prefix, "zai");
  assert.equal(withZai["openai-compatibility"][0]["api-key-entries"][0]["api-key"], zaiKey);
  assert.equal(withZai["openai-compatibility"][0].models[0].alias, "glm-5.2");
});
