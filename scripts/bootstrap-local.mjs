import { randomBytes, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEYCHAIN_SERVICE = "claude-code-model-gateway-api-key";

function parseArguments(values) {
  const normalized = values.filter((value) => value !== "--");
  const allowed = new Set(["--apply", "--help", "--no-keychain", "--with-zai"]);
  const unknown = normalized.filter((value) => !allowed.has(value));
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  return {
    apply: normalized.includes("--apply"),
    help: normalized.includes("--help"),
    noKeychain: normalized.includes("--no-keychain"),
    withZai: normalized.includes("--with-zai"),
  };
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a mapping`);
  }
}

export function buildLocalConfig(template, { authDir, gatewayKey, zaiKey }) {
  requireRecord(template, "CLIProxy template");
  if (template.host !== "127.0.0.1" || template.port !== 8317) {
    throw new Error("CLIProxy template must remain bound to 127.0.0.1:8317");
  }
  if (!Array.isArray(template["api-keys"]) || template["api-keys"].length !== 0) {
    throw new Error("CLIProxy template must not contain an API key");
  }
  const config = structuredClone(template);
  config["auth-dir"] = authDir;
  config["api-keys"] = [gatewayKey];
  if (zaiKey !== undefined) {
    config["openai-compatibility"] = [{
      name: "zai",
      prefix: "zai",
      "base-url": "https://api.z.ai/api/coding/paas/v4",
      "api-key-entries": [{ "api-key": zaiKey }],
      models: [{
        name: "glm-5.2",
        alias: "glm-5.2",
        "display-name": "GLM 5.2",
        thinking: { levels: ["high", "max"] },
      }],
    }];
  }
  return config;
}

async function assertInstallTarget(configDir, configPath, authDir) {
  const directory = await lstat(configDir).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (directory !== null && !directory.isDirectory()) {
    throw new Error("CLIProxy config target must be a real directory, not a file or symlink");
  }
  const config = await lstat(configPath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (config !== null) throw new Error(`Refusing to overwrite existing ${configPath}`);
  const authDirectory = await lstat(authDir).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (authDirectory !== null && !authDirectory.isDirectory()) {
    throw new Error("CLIProxy auth target must be a real directory, not a file or symlink");
  }
  return { configDirExisted: directory !== null, authDirExisted: authDirectory !== null };
}

function keychainAccount() {
  const account = process.env.USER || os.userInfo().username;
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(account)) throw new Error("Keychain account has an invalid format");
  return account;
}

function keychainExists(account) {
  const result = spawnSync("security", ["find-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE], {
    stdio: "ignore",
    timeout: 20000,
  });
  if (result.status === 0) return true;
  if (result.status === 44) return false;
  throw new Error("Could not query macOS Keychain");
}

function addKeychainSecret(account, secret) {
  const result = spawnSync("security", [
    "add-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE, "-w", secret,
  ], { stdio: "ignore", timeout: 20000 });
  if (result.status !== 0) throw new Error("Could not store the gateway key in macOS Keychain");
}

function deleteKeychainSecret(account) {
  spawnSync("security", ["delete-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE], {
    stdio: "ignore",
    timeout: 20000,
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: pnpm run bootstrap:local -- [--apply] [--with-zai] [--no-keychain]");
    console.log("  --apply        Write the config after validation; default is dry-run");
    console.log("  --with-zai     Read ZAI_API_KEY and add the Z.AI GLM provider");
    console.log("  --no-keychain  Disable Keychain storage for isolated automated tests only");
    console.log("  CLIPROXY_CONFIG_DIR overrides the default ~/.cli-proxy-api target");
    return;
  }
  if (!options.noKeychain && process.platform !== "darwin") {
    throw new Error("Automatic secret storage requires macOS Keychain; use --no-keychain only for isolated tests");
  }
  const configDir = path.resolve(process.env.CLIPROXY_CONFIG_DIR || path.join(os.homedir(), ".cli-proxy-api"));
  if (configDir === path.parse(configDir).root) throw new Error("Refusing to use a filesystem root");
  const configPath = path.join(configDir, "config.yaml");
  const authDir = path.join(configDir, "accounts");
  const existing = await assertInstallTarget(configDir, configPath, authDir);

  const templateText = await readFile(path.join(root, "config", "cliproxy.example.yaml"), "utf8");
  const template = YAML.parse(templateText);
  const gatewayKey = randomBytes(48).toString("base64url");
  const zaiKey = options.withZai ? process.env.ZAI_API_KEY : undefined;
  if (options.withZai && (
    typeof zaiKey !== "string"
    || zaiKey.length < 16
    || zaiKey.length > 2048
    || !/^[\x21-\x7E]+$/.test(zaiKey)
  )) {
    throw new Error("ZAI_API_KEY has an invalid format with --with-zai");
  }
  const config = buildLocalConfig(template, { authDir, gatewayKey, zaiKey });
  const contents = YAML.stringify(config, { lineWidth: 0 });
  YAML.parse(contents);

  const account = options.noKeychain ? null : keychainAccount();
  if (account !== null && keychainExists(account)) {
    throw new Error(`Keychain item ${KEYCHAIN_SERVICE} already exists; refusing to overwrite it`);
  }
  console.log(`bootstrap_mode=${options.apply ? "apply" : "dry-run"} config=${configPath} keychain=${options.noKeychain ? "disabled" : "pending"}`);
  if (!options.apply) return;

  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await chmod(configDir, 0o700);
  await mkdir(authDir, { recursive: true, mode: 0o700 });
  await chmod(authDir, 0o700);
  const temporary = path.join(configDir, `.config.${process.pid}.${randomUUID()}.tmp`);
  let keychainAdded = false;
  try {
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (account !== null) {
      addKeychainSecret(account, gatewayKey);
      keychainAdded = true;
    }
    await rename(temporary, configPath);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (keychainAdded) deleteKeychainSecret(account);
    if (!existing.authDirExisted) await rmdir(authDir).catch(() => {});
    if (!existing.configDirExisted) await rmdir(configDir).catch(() => {});
    throw error;
  }
  console.log(`bootstrap_result=ok config=${configPath} keychain=${account === null ? "disabled" : "stored"}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`bootstrap_failed reason=${error.message}`);
    process.exitCode = 1;
  });
}
