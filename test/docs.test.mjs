import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function markdownLinks(text) {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
}

async function assertRepositoryPathExists(reference, source) {
  const withoutFragment = reference.split("#", 1)[0];
  if (!withoutFragment || withoutFragment.startsWith("http://") || withoutFragment.startsWith("https://")) return;
  const target = path.resolve(path.dirname(source), decodeURIComponent(withoutFragment));
  assert.ok(target.startsWith(`${root}${path.sep}`) || target === root, `Link escapes repository: ${reference}`);
  await access(target);
}

test("human documentation has no broken repository links", async () => {
  for (const relative of ["README.md", "docs/setup.md", "docs/agent-setup.md", "docs/plugins.md"]) {
    const source = path.join(root, relative);
    const text = await readFile(source, "utf8");
    for (const reference of markdownLinks(text)) {
      await assertRepositoryPathExists(reference, source);
    }
  }
});

test("llms.txt follows the proposed file-list shape", async () => {
  const text = await readFile(path.join(root, "llms.txt"), "utf8");
  const lines = text.split("\n");
  assert.match(lines[0], /^# [^#]/, "llms.txt must begin with one H1");
  assert.ok(lines.some((line) => line.startsWith("> ")), "llms.txt requires a summary blockquote");

  let inFileList = false;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      inFileList = true;
      continue;
    }
    if (inFileList && line.trim() !== "") {
      assert.match(line, /^- \[[^\]]+\]\(https:\/\/[^)]+\)(?:: .+)?$/, `Invalid llms.txt file-list entry: ${line}`);
    }
  }

  const repositoryPrefix = "https://github.com/acartag7/claude-code-model-gateway/blob/main/";
  for (const reference of markdownLinks(text)) {
    if (!reference.startsWith(repositoryPrefix)) continue;
    const relative = reference.slice(repositoryPrefix.length);
    await access(path.join(root, relative));
  }
});
