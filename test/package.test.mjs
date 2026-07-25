import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("verify detects generated drift without rewriting it", async () => {
  const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(packageManifest.scripts.verify, "pnpm check:generated && pnpm test");
});
