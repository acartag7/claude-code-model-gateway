const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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
  };
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
