const DEFAULT_SOLANA_RPC_URLS = Object.freeze([]);
const PUBLIC_SOLANA_RPC_HOSTS = new Set([
  'api.mainnet-beta.solana.com',
  'solana-rpc.publicnode.com',
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

function alchemySolanaRpcUrl(env = process.env) {
  const key = String(
    env.SOLANA_ALCHEMY_API_KEY
    || env.ALCHEMY_SOLANA_API_KEY
    || '',
  ).trim();
  return key ? `https://solana-mainnet.g.alchemy.com/v2/${encodeURIComponent(key)}` : '';
}

function tatumSolanaRpcUrl(env = process.env) {
  const key = String(
    env.SOLANA_TATUM_API_KEY
    || env.TATUM_API_KEY
    || '',
  ).trim();
  return key ? 'https://solana-mainnet.gateway.tatum.io/' : '';
}

function isPublicSolanaRpcUrl(url) {
  try {
    return PUBLIC_SOLANA_RPC_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function solanaRpcUrls(extraUrls = [], env = process.env) {
  const extras = Array.isArray(extraUrls) ? extraUrls : [extraUrls];
  const urls = [
    alchemySolanaRpcUrl(env),
    heliusSolanaRpcUrl(env),
    ...splitSolanaRpcUrls(env.NFT_SOLANA_RPC_URL),
    ...splitSolanaRpcUrls(env.SOLANA_RPC_URL),
    ...splitSolanaRpcUrls(env.VITE_SOLANA_RPC_URL),
    ...extras.flatMap(splitSolanaRpcUrls),
    tatumSolanaRpcUrl(env),
    ...DEFAULT_SOLANA_RPC_URLS,
  ];
  return Array.from(new Set(urls.filter((url) => (
    /^https?:\/\//i.test(String(url || '')) && !isPublicSolanaRpcUrl(url)
  ))));
}

function solanaPrimaryRpcUrl(extraUrls = [], env = process.env) {
  return solanaRpcUrls(extraUrls, env)[0] || '';
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
  return solanaNonHeliusRpcUrls(urls)[0] || preferredUrl || (urls || []).find(Boolean) || '';
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
  if (isHeliusSolanaRpcUrl(url)) return heliusBatchSafeFetch;
  try {
    if (new URL(url).hostname === 'solana-mainnet.gateway.tatum.io') {
      return (input, init = {}) => {
        const headers = new Headers(init.headers || {});
        headers.set('x-api-key', process.env.SOLANA_TATUM_API_KEY || process.env.TATUM_API_KEY || '');
        return fetch(input, { ...init, headers });
      };
    }
  } catch {}
  return undefined;
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
  if (rpcUrls.length === 0) {
    throw new Error(`${label} failed: no Solana RPC endpoint is configured`);
  }
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
  alchemySolanaRpcUrl,
  createSolanaConnection,
  heliusSolanaRpcUrl,
  isPublicSolanaRpcUrl,
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
