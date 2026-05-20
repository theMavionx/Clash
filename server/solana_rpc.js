const DEFAULT_SOLANA_RPC_URLS = Object.freeze([
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
]);

function splitSolanaRpcUrls(raw) {
  return String(raw || '')
    .split(/[,\s]+/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function heliusSolanaRpcUrl(env = process.env) {
  const key = String(
    env.SOLANA_HELIUS_API_KEY
    || env.HELIUS_API_KEY
    || env.NFT_SOLANA_HELIUS_API_KEY
    || env.VITE_HELIUS_API_KEY
    || env.VITE_SOLANA_HELIUS_API_KEY
    || '',
  ).trim();
  return key ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}` : '';
}

function solanaRpcUrls(extraUrls = [], env = process.env) {
  const extras = Array.isArray(extraUrls) ? extraUrls : [extraUrls];
  const urls = [
    ...splitSolanaRpcUrls(env.NFT_SOLANA_RPC_URL),
    ...splitSolanaRpcUrls(env.SOLANA_RPC_URL),
    ...splitSolanaRpcUrls(env.VITE_SOLANA_RPC_URL),
    ...extras.flatMap(splitSolanaRpcUrls),
    heliusSolanaRpcUrl(env),
    ...DEFAULT_SOLANA_RPC_URLS,
  ];
  return Array.from(new Set(urls.filter((url) => /^https?:\/\//i.test(String(url || '')))));
}

function solanaPrimaryRpcUrl(extraUrls = [], env = process.env) {
  return solanaRpcUrls(extraUrls, env)[0] || DEFAULT_SOLANA_RPC_URLS[0];
}

function isHeliusSolanaRpcUrl(url) {
  try {
    return /(^|\.)helius-rpc\.com$/i.test(new URL(url).hostname);
  } catch {
    return /helius-rpc\.com/i.test(String(url || ''));
  }
}

function solanaRpcSupportsBatch(url) {
  return !isHeliusSolanaRpcUrl(url);
}

function solanaNonHeliusRpcUrls(urls = solanaRpcUrls()) {
  return (urls || []).filter((url) => url && !isHeliusSolanaRpcUrl(url));
}

function solanaBatchSafeRpcUrl(preferredUrl, urls = solanaRpcUrls()) {
  if (preferredUrl && solanaRpcSupportsBatch(preferredUrl)) return preferredUrl;
  return solanaNonHeliusRpcUrls(urls)[0] || preferredUrl || DEFAULT_SOLANA_RPC_URLS[0];
}

function parseJsonRpcBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return null; }
  }
  if (body instanceof Uint8Array) {
    try { return JSON.parse(new TextDecoder().decode(body)); } catch { return null; }
  }
  return null;
}

function jsonRpcErrorForRequest(request, code, message, data = undefined) {
  return {
    jsonrpc: '2.0',
    id: request?.id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

async function readJsonRpcResponse(response, request) {
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (payload && typeof payload === 'object') return payload;
  return jsonRpcErrorForRequest(
    request,
    response.ok ? -32700 : response.status,
    response.ok ? 'Invalid JSON-RPC response' : `HTTP ${response.status}`,
    text ? text.slice(0, 500) : undefined,
  );
}

async function heliusBatchSafeFetch(input, init = {}) {
  const body = parseJsonRpcBody(init?.body);
  if (!Array.isArray(body)) return fetch(input, init);
  if (body.length === 0) {
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const rows = await Promise.all(body.map(async (request) => {
    const response = await fetch(input, {
      ...init,
      body: JSON.stringify(request),
    });
    return readJsonRpcResponse(response, request);
  }));
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function solanaRpcFetchForUrl(url) {
  return isHeliusSolanaRpcUrl(url) ? heliusBatchSafeFetch : undefined;
}

function solanaConnectionConfig(url, commitmentOrConfig = 'confirmed') {
  const customFetch = solanaRpcFetchForUrl(url);
  if (!customFetch) return commitmentOrConfig;
  if (!commitmentOrConfig || typeof commitmentOrConfig === 'string') {
    return { commitment: commitmentOrConfig || 'confirmed', fetch: customFetch };
  }
  return {
    ...commitmentOrConfig,
    fetch: commitmentOrConfig.fetch || customFetch,
  };
}

function createSolanaConnection(ConnectionCtor, url, commitmentOrConfig = 'confirmed') {
  return new ConnectionCtor(url, solanaConnectionConfig(url, commitmentOrConfig));
}

async function withSolanaRpcFallback(task, {
  urls = null,
  extraUrls = [],
  label = 'Solana RPC task',
  onError = null,
} = {}) {
  const rpcUrls = urls || solanaRpcUrls(extraUrls);
  let lastError = null;
  for (const rpcUrl of rpcUrls) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await task(rpcUrl);
    } catch (err) {
      lastError = err;
      if (typeof onError === 'function') onError(err, rpcUrl);
    }
  }
  const message = lastError?.message || String(lastError || 'all RPCs failed');
  const err = new Error(`${label} failed across ${rpcUrls.length} RPC endpoint(s): ${message}`);
  err.cause = lastError;
  err.rpcUrlsTried = rpcUrls;
  throw err;
}

module.exports = {
  DEFAULT_SOLANA_RPC_URLS,
  createSolanaConnection,
  heliusSolanaRpcUrl,
  isHeliusSolanaRpcUrl,
  solanaBatchSafeRpcUrl,
  solanaConnectionConfig,
  solanaRpcFetchForUrl,
  solanaNonHeliusRpcUrls,
  solanaPrimaryRpcUrl,
  solanaRpcSupportsBatch,
  solanaRpcUrls,
  splitSolanaRpcUrls,
  withSolanaRpcFallback,
};
