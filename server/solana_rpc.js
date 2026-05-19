const DEFAULT_SOLANA_RPC_URLS = Object.freeze([
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
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
    ...DEFAULT_SOLANA_RPC_URLS,
    heliusSolanaRpcUrl(env),
  ];
  return Array.from(new Set(urls.filter((url) => /^https?:\/\//i.test(String(url || '')))));
}

function solanaPrimaryRpcUrl(extraUrls = [], env = process.env) {
  return solanaRpcUrls(extraUrls, env)[0] || DEFAULT_SOLANA_RPC_URLS[0];
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
  heliusSolanaRpcUrl,
  solanaPrimaryRpcUrl,
  solanaRpcUrls,
  splitSolanaRpcUrls,
  withSolanaRpcFallback,
};
