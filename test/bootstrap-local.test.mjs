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

test("API-key providers are added only when their keys are explicitly supplied", () => {
  const gatewayKey = randomBytes(48).toString("base64url");
  const openCodeGoKey = randomBytes(32).toString("base64url");
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
  assert.deepEqual(withZai["openai-compatibility"][0].models, [
    {
      name: "glm-5.2",
      alias: "glm-5.2",
      "display-name": "GLM 5.2",
      thinking: { levels: ["high", "max"] },
    },
    {
      name: "glm-5.3-flash",
      alias: "glm-5.3-flash",
      "display-name": "GLM 5.3 Flash",
      thinking: { levels: ["low", "high", "max"] },
    },
  ]);

  const withOpenCodeGo = buildLocalConfig(template, {
    authDir: "/tmp/auth",
    gatewayKey,
    openCodeGoKey,
  });
  assert.equal(withOpenCodeGo["openai-compatibility"][0].name, "opencode-go");
  assert.equal(
    withOpenCodeGo["openai-compatibility"][0]["api-key-entries"][0]["api-key"],
    openCodeGoKey,
  );
  assert.deepEqual(withOpenCodeGo["openai-compatibility"][0].models, [
    {
      name: "hy4-preview",
      alias: "hy4-preview",
      "display-name": "Hunyuan Hy4 Preview",
    },
    {
      name: "kimi-k2.7-code",
      alias: "kimi-k2.7-code",
      "display-name": "Kimi K2.7 Code",
    },
    {
      name: "longcat-2.0",
      alias: "longcat-2.0",
      "display-name": "LongCat 2.0",
    },
  ]);

  const withBoth = buildLocalConfig(template, {
    authDir: "/tmp/auth",
    gatewayKey,
    openCodeGoKey,
    zaiKey,
  });
  assert.deepEqual(
    withBoth["openai-compatibility"].map((provider) => provider.name),
    ["zai", "opencode-go"],
  );
});

test("local bootstrap writes OpenCode Go routing without printing its key", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "model-gateway-bootstrap-opencode-"));
  const configDir = path.join(temporary, "cli");
  const openCodeGoKey = randomBytes(32).toString("base64url");
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      path.join(root, "scripts", "bootstrap-local.mjs"),
      "--apply",
      "--no-keychain",
      "--with-opencode-go",
    ], {
      env: {
        ...process.env,
        CLIPROXY_CONFIG_DIR: configDir,
        OPENCODE_GO_API_KEY: openCodeGoKey,
      },
    });
    assert.doesNotMatch(stdout, new RegExp(openCodeGoKey));
    assert.doesNotMatch(stderr, new RegExp(openCodeGoKey));
    const configPath = path.join(configDir, "config.yaml");
    const config = YAML.parse(await readFile(configPath, "utf8"));
    const provider = config["openai-compatibility"].find(
      (candidate) => candidate.name === "opencode-go",
    );
    assert.equal(provider["api-key-entries"][0]["api-key"], openCodeGoKey);
    assert.deepEqual(
      provider.models.map((model) => model.alias),
      ["hy4-preview", "kimi-k2.7-code", "longcat-2.0"],
    );
    assert.equal((await stat(configDir)).mode & 0o777, 0o700);
    assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("API-key provider flags reject invalid keys before creating local state", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "model-gateway-bootstrap-invalid-"));
  try {
    const providers = [
      { environmentName: "ZAI_API_KEY", optionName: "--with-zai" },
      { environmentName: "OPENCODE_GO_API_KEY", optionName: "--with-opencode-go" },
    ];
    const invalidValues = [
      undefined,
      "",
      `${randomBytes(16).toString("hex")} `,
      "x".repeat(2049),
    ];
    for (const [providerIndex, provider] of providers.entries()) {
      for (const [valueIndex, invalidValue] of invalidValues.entries()) {
        const configDir = path.join(temporary, `cli-${providerIndex}-${valueIndex}`);
        const env = { ...process.env, CLIPROXY_CONFIG_DIR: configDir };
        if (invalidValue === undefined) delete env[provider.environmentName];
        else env[provider.environmentName] = invalidValue;
        await assert.rejects(
          execFileAsync(process.execPath, [
            path.join(root, "scripts", "bootstrap-local.mjs"),
            "--apply",
            "--no-keychain",
            provider.optionName,
          ], { env }),
          new RegExp(`${provider.environmentName} has an invalid format with ${provider.optionName}`),
        );
        await assert.rejects(stat(configDir), { code: "ENOENT" });
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
