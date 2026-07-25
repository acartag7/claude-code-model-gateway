const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Claude Code resolves a cloud provider before it looks at ANTHROPIC_BASE_URL, so
// any one of these left exported by another setup wins and the launch quietly
// talks to Bedrock/Vertex/Foundry instead of this gateway. That is a fail-open:
// the session still works, so nothing looks wrong, while every request bypasses
// the curated catalog and the Access boundary in front of it.
const CLOUD_PROVIDER_SELECTORS = [
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
];

function accessHeaders(env) {
  const clientId = env.MODEL_GATEWAY_CF_ACCESS_CLIENT_ID;
  const clientSecret = env.MODEL_GATEWAY_CF_ACCESS_CLIENT_SECRET;
  if (!clientId && !clientSecret) return {};
  if (!clientId || !clientSecret) {
    throw new Error("Both Cloudflare Access service-token values are required");
  }
  for (const [label, value] of [["client ID", clientId], ["client secret", clientSecret]]) {
    if (value.length < 16 || value.length > 2048 || !/^[\x21-\x7E]+$/.test(value)) {
      throw new Error(`Cloudflare Access ${label} has an invalid format`);
    }
  }
  return {
    "CF-Access-Client-Id": clientId,
    "CF-Access-Client-Secret": clientSecret,
  };
}

export function resolveGateway({ requireToken = true, env = process.env } = {}) {
  const raw = env.MODEL_GATEWAY_URL;
  if (!raw) throw new Error("MODEL_GATEWAY_URL is required");
  const url = new URL(raw);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("MODEL_GATEWAY_URL must be a credential-free origin");
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("MODEL_GATEWAY_URL must use HTTPS unless it is loopback");
  }
  const token = env.MODEL_GATEWAY_API_KEY;
  if (requireToken && (
    !token
    || token.length < 16
    || token.length > 2048
    || !/^[\x21-\x7E]+$/.test(token)
  )) {
    throw new Error("MODEL_GATEWAY_API_KEY is missing or has an invalid format");
  }
  const additionalHeaders = accessHeaders(env);
  return { origin: url.origin, token, additionalHeaders };
}

export function gatewayClaudeEnvironment(base = process.env) {
  const gateway = resolveGateway({ env: base });
  const env = {
    ...base,
    ANTHROPIC_BASE_URL: gateway.origin,
    ANTHROPIC_AUTH_TOKEN: gateway.token,
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
    // Every model here is a gateway-custom id (gpt-*, zai/glm-*, grok-*). Claude
    // Code only treats a model as effort-capable when it recognises it, so
    // without this the catalog's recommendedEffort and each agent's effort are
    // silently dropped for exactly the models this repo exists to route.
    CLAUDE_CODE_ALWAYS_ENABLE_EFFORT: "1",
  };
  for (const selector of CLOUD_PROVIDER_SELECTORS) delete env[selector];
  const customHeaders = Object.entries(gateway.additionalHeaders)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
  if (customHeaders && base.ANTHROPIC_CUSTOM_HEADERS) {
    throw new Error("Unset ANTHROPIC_CUSTOM_HEADERS before enabling Cloudflare Access headers");
  }
  if (customHeaders) env.ANTHROPIC_CUSTOM_HEADERS = customHeaders;
  delete env.CLAUDE_CODE_SUBAGENT_MODEL;
  return env;
}
