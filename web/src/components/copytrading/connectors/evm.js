// Shared EVM wallet helpers for ClashBot venue connectors. Only signatures
// leave the wallet; the player's key never does.
import { stringToHex } from 'viem';
import { signTypedDataCompat } from '../../../lib/risexClient';

export function evmOwner(walletCtx) {
  const owner = String(walletCtx?.evmWalletAddress || walletCtx?.walletAddress || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner)) throw new Error('Connect your EVM wallet in the game first.');
  if (!walletCtx?.evmProvider?.request && !walletCtx?.walletClient) throw new Error('Connect your EVM wallet in the game first.');
  return owner;
}

/** personal_sign of a UTF-8 message by `owner`. */
export async function personalSign(walletCtx, owner, message) {
  if (walletCtx?.walletClient?.signMessage) {
    return walletCtx.walletClient.signMessage({ account: owner, message });
  }
  return walletCtx.evmProvider.request({ method: 'personal_sign', params: [stringToHex(message), owner] });
}

/** eth_signTypedData_v4 of a typed-data object (domain/types/primaryType/message). */
export function signTypedData(walletCtx, owner, typedData) {
  return signTypedDataCompat({
    provider: walletCtx?.evmProvider, walletClient: walletCtx?.walletClient, account: owner,
    domain: typedData.domain, types: typedData.types, primaryType: typedData.primaryType, message: typedData.message,
  });
}

export const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
