import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./lib/catalog.mjs";
import { renderFiles } from "./generate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_FILE_BYTES = 1024 * 1024;
const generatedMarker = "<!-- Generated from models.yaml. Do not edit. -->";
const managedMarker = "Managed by claude-code-model-gateway";
const MAX_MANAGED_ENTRIES = 512;

function assertSettings(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Claude settings must be a JSON object");
  }
  if (value.env !== undefined && (value.env === null || typeof value.env !== "object" || Array.isArray(value.env))) {
    throw new Error("Claude settings env must be a JSON object");
  }
}

export function mergeSettings(current, generated) {
  assertSettings(current);
  assertSettings(generated);
  return {
    ...current,
    autoCompactEnabled: true,
    env: {
      ...(current.env ?? {}),
      ...(generated.env ?? {}),
    },
  };
}

async function readBounded(file, { optional = false } = {}) {
  const metadata = await lstat(file).catch((error) => {
    if (optional && error.code === "ENOENT") return null;
    throw error;
  });
  if (metadata === null) return null;
  if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) {
    throw new Error(`${file} must be a regular file no larger than 1 MiB`);
  }
  return readFile(file, "utf8");
}

async function atomicWrite(file, contents, mode) {
  const parent = path.dirname(file);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const temporary = path.join(parent, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await chmod(temporary, mode);
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function installableFiles(rendered) {
  const files = new Map();
  for (const [relative, contents] of rendered) {
    if (relative.startsWith(".claude/agents/")) {
      files.set(relative.slice(".claude/".length), contents);
    }
  }
  for (const relative of [
    ".claude/skills/choose-model/SKILL.md",
    ".claude/skills/choose-model/agents/openai.yaml",
    ".claude/skills/choose-model/references/model-routing.md",
  ]) {
    files.set(relative.slice(".claude/".length), null);
  }
  return files;
}

function isManaged(contents) {
  return contents.includes(generatedMarker) || contents.includes(managedMarker);
}

async function collectManagedFiles(directory, relativeDirectory, desired, stale, state, depth) {
  const metadata = await lstat(directory).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (metadata === null) return;
  if (!metadata.isDirectory()) throw new Error(`${directory} must be a real directory`);
  const entries = await readdir(directory, { withFileTypes: true });
  state.entries += entries.length;
  if (state.entries > MAX_MANAGED_ENTRIES) throw new Error("Managed Claude asset directories contain too many entries");
  for (const entry of entries) {
    const relative = path.join(relativeDirectory, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (depth === 0) continue;
      await collectManagedFiles(absolute, relative, desired, stale, state, depth - 1);
      continue;
    }
    if (!entry.isFile() || desired.has(relative)) continue;
    const contents = await readBounded(absolute);
    if (isManaged(contents)) stale.push(relative);
  }
}

async function staleManagedFiles(targetRoot, files) {
  const desired = new Set(files.keys());
  const stale = [];
  const state = { entries: 0 };
  await collectManagedFiles(path.join(targetRoot, "agents"), "agents", desired, stale, state, 0);
  await collectManagedFiles(
    path.join(targetRoot, "skills", "choose-model"),
    path.join("skills", "choose-model"),
    desired,
    stale,
    state,
    4,
  );
  return stale.sort();
}

async function removeManagedFile(targetRoot, relative) {
  const file = path.join(targetRoot, relative);
  const contents = await readBounded(file);
  if (!isManaged(contents)) throw new Error(`Refusing to remove changed ${file}`);
  await unlink(file);
}

async function main() {
  const argumentsFromCli = process.argv.slice(2).filter((value) => value !== "--");
  const apply = argumentsFromCli.includes("--apply");
  const force = argumentsFromCli.includes("--force");
  const unknown = argumentsFromCli.filter((value) => !new Set(["--apply", "--force"]).has(value));
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(", ")}`);

  const targetRoot = path.resolve(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"));
  if (targetRoot === path.parse(targetRoot).root) throw new Error("Refusing to install into a filesystem root");
  const targetMetadata = await lstat(targetRoot).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (targetMetadata !== null && !targetMetadata.isDirectory()) {
    throw new Error("Claude config target must be a real directory, not a file or symlink");
  }

  const catalog = await loadCatalog(root);
  const rendered = renderFiles(catalog);
  const generatedSettings = JSON.parse(rendered.get("generated/claude-settings.json"));
  const settingsPath = path.join(targetRoot, "settings.json");
  const currentSettingsText = await readBounded(settingsPath, { optional: true });
  const currentSettings = currentSettingsText === null ? {} : JSON.parse(currentSettingsText);
  const mergedSettings = `${JSON.stringify(mergeSettings(currentSettings, generatedSettings), null, 2)}\n`;

  const files = installableFiles(rendered);
  for (const [relative, generatedContents] of files) {
    const source = path.join(root, ".claude", relative);
    const contents = generatedContents ?? await readBounded(source);
    files.set(relative, contents);
    const destination = path.join(targetRoot, relative);
    const existing = await readBounded(destination, { optional: true });
    if (existing !== null && existing !== contents && !force) {
      const managed = isManaged(existing);
      if (!managed) throw new Error(`Refusing to overwrite existing ${destination}; rerun with --force after review`);
    }
  }

  const stale = await staleManagedFiles(targetRoot, files);

  console.log(`install_mode=${apply ? "apply" : "dry-run"} target=${targetRoot} files=${files.size + 1} remove=${stale.length}`);
  for (const relative of stale) console.log(`remove_path=${relative}`);
  if (!apply) return;
  for (const [relative, contents] of files) {
    await atomicWrite(path.join(targetRoot, relative), contents, 0o644);
  }
  await atomicWrite(settingsPath, mergedSettings, 0o600);
  for (const relative of stale) await removeManagedFile(targetRoot, relative);
  console.log(`install_result=ok auto_compact=enabled removed=${stale.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`install_failed reason=${error.message}`);
    process.exitCode = 1;
  });
}
