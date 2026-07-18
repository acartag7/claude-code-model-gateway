import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { gatewayClaudeEnvironment, resolveGateway } from "../scripts/lib/gateway.mjs";

const key = randomBytes(32).toString("hex");

test("gateway requires HTTPS away from loopback", () => {
  assert.throws(
    () => resolveGateway({ env: { MODEL_GATEWAY_URL: "http://example.com", MODEL_GATEWAY_API_KEY: key } }),
    /must use HTTPS/,
  );
});

test("gateway accepts loopback HTTP", () => {
  const gateway = resolveGateway({ env: { MODEL_GATEWAY_URL: "http://127.0.0.1:8317", MODEL_GATEWAY_API_KEY: key } });
  assert.equal(gateway.origin, "http://127.0.0.1:8317");
});

test("gateway rejects control characters in bearer keys", () => {
  assert.throws(
    () => resolveGateway({
      env: {
        MODEL_GATEWAY_URL: "https://example.com",
        MODEL_GATEWAY_API_KEY: `${key}\n`,
      },
    }),
    /invalid format/,
  );
});

test("gateway rejects embedded credentials and paths", () => {
  assert.throws(
    () => resolveGateway({ env: { MODEL_GATEWAY_URL: "https://user@example.com", MODEL_GATEWAY_API_KEY: key } }),
    /credential-free origin/,
  );
  assert.throws(
    () => resolveGateway({ env: { MODEL_GATEWAY_URL: "https://example.com/v1", MODEL_GATEWAY_API_KEY: key } }),
    /credential-free origin/,
  );
});

test("launcher environment clears global subagent override", () => {
  const env = gatewayClaudeEnvironment({
    MODEL_GATEWAY_URL: "https://example.com",
    MODEL_GATEWAY_API_KEY: key,
    CLAUDE_CODE_SUBAGENT_MODEL: "claude-opus-4-8",
  });
  assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL, undefined);
  assert.equal(env.ANTHROPIC_BASE_URL, "https://example.com");
  assert.equal(env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY, "1");
});

test("Cloudflare Access service-token headers require a complete pair", () => {
  assert.throws(
    () => resolveGateway({
      env: {
        MODEL_GATEWAY_URL: "https://example.com",
        MODEL_GATEWAY_API_KEY: key,
        MODEL_GATEWAY_CF_ACCESS_CLIENT_ID: randomBytes(24).toString("hex"),
      },
    }),
    /Both Cloudflare Access service-token values are required/,
  );
});

test("Cloudflare Access service-token headers reach Claude Code explicitly", () => {
  const clientId = randomBytes(24).toString("hex");
  const clientSecret = randomBytes(32).toString("hex");
  const env = gatewayClaudeEnvironment({
    MODEL_GATEWAY_URL: "https://example.com",
    MODEL_GATEWAY_API_KEY: key,
    MODEL_GATEWAY_CF_ACCESS_CLIENT_ID: clientId,
    MODEL_GATEWAY_CF_ACCESS_CLIENT_SECRET: clientSecret,
  });
  assert.equal(
    env.ANTHROPIC_CUSTOM_HEADERS,
    `CF-Access-Client-Id: ${clientId}\nCF-Access-Client-Secret: ${clientSecret}`,
  );
});

test("Cloudflare Access refuses to overwrite unrelated custom headers", () => {
  assert.throws(
    () => gatewayClaudeEnvironment({
      MODEL_GATEWAY_URL: "https://example.com",
      MODEL_GATEWAY_API_KEY: key,
      MODEL_GATEWAY_CF_ACCESS_CLIENT_ID: randomBytes(24).toString("hex"),
      MODEL_GATEWAY_CF_ACCESS_CLIENT_SECRET: randomBytes(32).toString("hex"),
      ANTHROPIC_CUSTOM_HEADERS: "X-Existing: retained",
    }),
    /Unset ANTHROPIC_CUSTOM_HEADERS/,
  );
});
