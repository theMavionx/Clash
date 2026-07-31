'use strict';

// One Aptos Labs key pool for the main game-server process. NFT ownership,
// marketplace settlement, shop redemption, bridge verification, metadata
// reads and admin earnings all share this module so a limited key is cooled
// down once and skipped everywhere instead of each subsystem repeatedly
// exhausting the same credential.

const {
  AptosApiKeyPool,
  uniqueKeys,
} = require('../server-futures/aptos-key-pool');

const DEFAULT_APTOS_FULLNODE = 'https://fullnode.mainnet.aptoslabs.com/v1';
const DEFAULT_APTOS_INDEXER = 'https://indexer.mainnet.aptoslabs.com/v1/graphql';

function aptosKeysFromEnv(env = process.env) {
  return uniqueKeys([
    env.APTOS_NODE_API_KEYS,
    env.APTOS_API_KEYS,
    env.VITE_APTOS_NODE_API_KEYS,
    env.APTOS_NODE_API_KEY,
    env.APTOS_API_KEY,
    env.VITE_APTOS_NODE_API_KEY,
    // Production historically stored the same Aptos Labs credentials under
    // Decibel names. Keep them in the common pool so non-trading Aptos reads
    // benefit from the full configured set too.
    env.DECIBEL_API_KEYS,
    env.DECIBEL_API_KEY,
  ]);
}

function createAptosApiClient(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Aptos API client requires fetch');
  }
  const pool = new AptosApiKeyPool({
    keys: options.keys || aptosKeysFromEnv(env),
    cooldownMs: Number(env.APTOS_API_KEY_COOLDOWN_MS || 5 * 60 * 1000),
    now: options.now,
    logger: options.logger || console,
    logPrefix: '[aptos]',
  });

  async function fetchWithAptosKeys(url, fetchOptions = {}, metadata = {}) {
    const label = metadata.label || 'Aptos request';
    return pool.run(label, async (apiKey) => {
      const headers = new Headers(fetchOptions.headers || {});
      if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
      else headers.delete('Authorization');
      const response = await fetchImpl(url, {
        ...fetchOptions,
        headers,
      });
      if ([401, 403, 429].includes(Number(response?.status))) {
        const body = await response.clone?.().text().catch(() => '') || '';
        const error = new Error(
          `${label} failed: ${response.status} ${body || response.statusText || ''}`.trim(),
        );
        error.status = Number(response.status);
        error.body = body;
        throw error;
      }
      return response;
    }, {
      allowPublicFallback: metadata.allowPublicFallback !== false,
    });
  }

  return {
    fetch: fetchWithAptosKeys,
    run: (operation, metadata = {}) => pool.run(
      metadata.label || 'Aptos operation',
      operation,
      { allowPublicFallback: metadata.allowPublicFallback !== false },
    ),
    status: () => pool.snapshot(),
  };
}

const sharedAptosApiClient = createAptosApiClient();

function aptosFullnodeUrl(env = process.env) {
  const base = String(
    env.NFT_APTOS_RPC_URL
      || env.GAME_SHOP_APTOS_FULLNODE
      || env.APTOS_FULLNODE_URL
      || env.APTOS_FULLNODE
      || env.APTOS_RPC_URL
      || DEFAULT_APTOS_FULLNODE,
  ).replace(/\/+$/, '');
  return /\/v1$/u.test(base) ? base : `${base}/v1`;
}

function aptosIndexerUrl(env = process.env) {
  return String(env.APTOS_INDEXER_URL || DEFAULT_APTOS_INDEXER).replace(/\/+$/, '');
}

function createAptosSdkConfig(sdk, apiKey = '', env = process.env) {
  return new sdk.AptosConfig({
    network: sdk.Network?.MAINNET || 'mainnet',
    fullnode: aptosFullnodeUrl(env),
    clientConfig: apiKey ? { API_KEY: apiKey } : {},
  });
}

async function waitForAptosTransaction(txHash, options = {}) {
  const label = options.label || 'Aptos transaction';
  const attempts = Math.max(1, Number(options.attempts || 40));
  const intervalMs = Math.max(0, Number(options.intervalMs ?? 1500));
  const hash = String(txHash || '').trim();
  if (!hash) throw new Error(`${label} hash is missing`);

  for (let i = 0; i < attempts; i += 1) {
    let response = null;
    try {
      response = await sharedAptosApiClient.fetch(
        `${aptosFullnodeUrl()}/transactions/by_hash/${encodeURIComponent(hash)}`,
        { cache: 'no-store' },
        { label: `${label} confirmation` },
      );
    } catch (error) {
      if (i === attempts - 1) throw error;
    }
    if (response?.ok) {
      const data = await response.json().catch(() => null);
      if (data?.success === true) return data;
      if (data?.success === false) {
        throw new Error(`${label} failed on-chain: ${data?.vm_status || 'unknown'}`);
      }
    }
    if (i < attempts - 1 && intervalMs > 0) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  throw new Error(`${label} was submitted but confirmation timed out`);
}

module.exports = {
  DEFAULT_APTOS_FULLNODE,
  DEFAULT_APTOS_INDEXER,
  aptosApiKeyPoolStatus: sharedAptosApiClient.status,
  aptosFullnodeUrl,
  aptosIndexerUrl,
  aptosKeysFromEnv,
  createAptosSdkConfig,
  createAptosApiClient,
  fetchWithAptosKeys: sharedAptosApiClient.fetch,
  runWithAptosKeys: sharedAptosApiClient.run,
  waitForAptosTransaction,
};
