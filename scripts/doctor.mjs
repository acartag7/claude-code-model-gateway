import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./lib/catalog.mjs";
import { resolveGateway } from "./lib/gateway.mjs";
import { renderFiles } from "./generate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_RESPONSE_BYTES = 1024 * 1024;

export async function readBoundedResponse(response) {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_RESPONSE_BYTES) {
    throw new Error("Gateway catalog response exceeded 1 MiB");
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Gateway catalog response exceeded 1 MiB");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

async function checkGenerated(catalog) {
  const drift = [];
  for (const [relative, expected] of renderFiles(catalog)) {
    const current = await readFile(path.join(root, relative), "utf8").catch(() => null);
    if (current !== expected) drift.push(relative);
  }
  if (drift.length) throw new Error(`Generated files are stale: ${drift.join(", ")}`);
}

async function checkAutoCompact(settingsPath) {
  const text = await readFile(settingsPath, "utf8");
  if (text.length > 1024 * 1024) throw new Error("Claude settings file is unexpectedly large");
  const settings = JSON.parse(text);
  if (settings.autoCompactEnabled !== true) {
    throw new Error(`Auto-compaction is not enabled in ${settingsPath}`);
  }
}

async function checkLive(catalog) {
  const gateway = resolveGateway();
  const url = new URL("/v1/models?limit=1000", gateway.origin);
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${gateway.token}`,
      ...gateway.additionalHeaders,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const location = response.headers.get("location");
    const suffix = response.status >= 300 && response.status < 400 && location
      ? "; the gateway redirected instead of accepting API credentials"
      : "";
    throw new Error(`Gateway catalog request failed with HTTP ${response.status}${suffix}`);
  }
  const text = await readBoundedResponse(response);
  const payload = JSON.parse(text);
  if (!payload || !Array.isArray(payload.data)) throw new Error("Gateway catalog response has an invalid shape");
  const available = new Set(payload.data.map((entry) => entry?.id).filter((id) => typeof id === "string"));
  const missing = catalog.models.map((model) => model.id).filter((id) => !available.has(id));
  if (missing.length) throw new Error(`Gateway is missing configured models: ${missing.join(", ")}`);
}

async function main() {
  const live = process.argv.slice(2).includes("--live");
  const settingsIndex = process.argv.indexOf("--settings");
  const settingsPath = settingsIndex === -1
    ? path.join(root, "generated", "claude-settings.json")
    : path.resolve(process.argv[settingsIndex + 1] ?? "");
  const catalog = await loadCatalog(root);
  await checkGenerated(catalog);
  await checkAutoCompact(settingsPath);
  if (live) await checkLive(catalog);
  console.log(`catalog=ok generated=ok auto_compact=enabled live=${live ? "ok" : "skipped"}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`doctor_failed reason=${error.message}`);
    process.exitCode = 1;
  });
}
