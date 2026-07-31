import { fetchWithAptosBrowserKeys } from './aptosBrowserKeyPool';

export const APTOS_MAINNET_FULLNODE = 'https://fullnode.mainnet.aptoslabs.com/v1';

export function aptosFullnodeUrl() {
  return String(
    (typeof window !== 'undefined' && window.APTOS_FULLNODE)
      || APTOS_MAINNET_FULLNODE,
  ).replace(/\/+$/u, '');
}

export async function waitForAptosTransaction(
  txHash,
  {
    label = 'Aptos transaction',
    attempts = 40,
    intervalMs = 1500,
  } = {},
) {
  const hash = String(txHash || '').trim();
  if (!hash) throw new Error(`${label} hash is missing`);

  for (let i = 0; i < attempts; i += 1) {
    let response = null;
    try {
      response = await fetchWithAptosBrowserKeys(
        `${aptosFullnodeUrl()}/transactions/by_hash/${encodeURIComponent(hash)}`,
        { cache: 'no-store' },
        {
          label: `${label} confirmation`,
          allowPublicFallback: true,
        },
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
    if (i < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  throw new Error(`${label} was submitted but confirmation timed out`);
}
