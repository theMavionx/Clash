const ROOT = '/api/clash-holder/rewards';

async function request(path, token, body) {
  const response = await fetch(`${ROOT}${path}`, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: {
      'x-token': token || '',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const error = new Error(data?.error || `Holding check failed (HTTP ${response.status})`);
    error.code = data?.code || 'REQUEST_FAILED';
    throw error;
  }
  return data;
}

export function getClashHolderStatus(token) { return request('/status', token); }
export function linkClashHolderWallet(token, wallet, authProof) {
  return request('/link-wallet', token, { wallet, auth_proof: authProof });
}
export function refreshClashHolderStatus(token) { return request('/refresh', token, {}); }
export function claimClashHolderGold(token) { return request('/claim', token, {}); }

export function holderWalletAuthMessage(wallet, issuedAt) {
  return ['Clash wallet auth', 'Action: wallet-auth', `Wallet: ${String(wallet || '').trim().toLowerCase()}`,
    'DEX: robinhood', `Issued At: ${issuedAt}`].join('\n');
}
export async function createHolderWalletAuthProof(wallet, walletClient) {
  if (!walletClient?.signMessage) throw new Error('Connect an EVM wallet that can sign messages');
  const address = String(wallet || '').trim().toLowerCase();
  const issuedAt = new Date().toISOString();
  const message = holderWalletAuthMessage(address, issuedAt);
  const signature = await walletClient.signMessage({ account: wallet, message });
  return { action: 'wallet-auth', chain_type: 'evm', wallet: address,
    dex: 'robinhood', issued_at: issuedAt, message, signature };
}
