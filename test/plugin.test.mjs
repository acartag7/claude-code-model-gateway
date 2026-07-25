import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("marketplace exposes one namespaced routing-only plugin", async () => {
  const marketplace = JSON.parse(await readFile(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.equal(marketplace.name, "claude-code-model-gateway");
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name), ["model-gateway"]);
  assert.equal(marketplace.plugins[0].source, "./plugins/model-gateway");

  const pluginRoot = path.join(root, "plugins", "model-gateway");
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"));
  const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.name, "model-gateway");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, packageManifest.version);
  assert.equal(manifest.license, "MIT");
  assert.equal(
    await readFile(path.join(pluginRoot, "LICENSE"), "utf8"),
    await readFile(path.join(root, "LICENSE"), "utf8"),
  );

  for (const forbidden of ["settings.json", "hooks", ".mcp.json"]) {
    await assert.rejects(lstat(path.join(pluginRoot, forbidden)), { code: "ENOENT" });
  }
});
