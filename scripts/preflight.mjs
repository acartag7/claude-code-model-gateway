import { delimiter, join } from "node:path";
import { accessSync, constants } from "node:fs";
import { spawnSync } from "node:child_process";

function findExecutable(name, env = process.env) {
  for (const directory of (env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return null;
}

function commandVersion(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 64 * 1024,
  });
  if (result.error?.code === "ETIMEDOUT") throw new Error(`${command} --version timed out`);
  if (result.status !== 0) throw new Error(`${command} --version failed`);
  return result.stdout.trim() || result.stderr.trim();
}

function numericVersion(value, label) {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Could not parse ${label} version`);
  return match.slice(1).map(Number);
}

function atLeast(actual, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

function main() {
  const existingGateway = process.argv.slice(2).includes("--existing-gateway");
  const node = numericVersion(process.version, "Node.js");
  if (!atLeast(node, [22, 0, 0])) throw new Error("Node.js 22 or newer is required");

  const pnpm = findExecutable("pnpm");
  const claude = findExecutable("claude");
  const cliproxy = existingGateway ? null : findExecutable("cliproxyapi");
  if (!pnpm) throw new Error("pnpm is not installed or not on PATH");
  if (!claude) throw new Error("Claude Code is not installed or not on PATH");
  if (!existingGateway && !cliproxy) throw new Error("cliproxyapi is not installed or not on PATH");

  const pnpmText = commandVersion(pnpm);
  const pnpmVersion = numericVersion(pnpmText, "pnpm");
  if (!atLeast(pnpmVersion, [10, 32, 0])) throw new Error("pnpm 10.32.0 or newer is required");
  const claudeText = commandVersion(claude);
  const claudeVersion = numericVersion(claudeText, "Claude Code");
  if (!atLeast(claudeVersion, [2, 1, 207])) throw new Error("Claude Code 2.1.207 or newer is required");

  console.log(`preflight=ok node=${process.version.slice(1)} pnpm=${pnpmText} claude=${claudeText} cliproxyapi=${existingGateway ? "external" : "found"}`);
}

try {
  main();
} catch (error) {
  console.error(`preflight_failed reason=${error.message}`);
  process.exitCode = 1;
}
