/**
 * Standalone Avantis Smart Wallet setup (setDelegate + USDC approve).
 * Shared by Futures (useAvantis) and Bots (ensureAvantisReady).
 */
import { formatEther } from 'viem';
import {
  TRADING_ADDRESS,
  TRADING_STORAGE_ADDRESS,
  USDC_ADDRESS,
  ERC20_ABI,
  TRADING_ABI,
  fetchAvantisDelegate,
} from './avantisContract';
import {
  AVANTIS_SMART_WALLET_MIN_ETH,
  getOrCreateAvantisSmartWalletDelegate,
  readAvantisSmartWalletDelegate,
} from './avantisSmartWallet';

const TX_TIMEOUT_MS = 90_000;
const MAX_UINT256 = (1n << 256n) - 1n;

async function waitForReceiptWithTimeout(publicClient, hash) {
  try {
    return await publicClient.waitForTransactionReceipt({ hash, timeout: TX_TIMEOUT_MS });
  } catch (e) {
    if (/timed? ?out|WaitForTransactionReceipt/i.test(String(e?.message || e))) {
      const err = new Error('Transaction pending too long — check your wallet and retry');
      err.code = 'TX_TIMEOUT';
      throw err;
    }
    throw e;
  }
}

/** On-chain + local delegate status (no React state). */
export async function refreshAvantisSmartWalletStatus(publicClient, walletAddr) {
  const owner = String(walletAddr || '').toLowerCase();
  if (!owner || !publicClient) return null;

  const local = readAvantisSmartWalletDelegate(owner);
  const onchain = await fetchAvantisDelegate(publicClient, owner);
  const onchainLower = String(onchain || '').toLowerCase();

  let ethRaw = 0n;
  if (local?.address) {
    try {
      ethRaw = await publicClient.getBalance({ address: local.address });
    } catch {
      ethRaw = 0n;
    }
  }

  if (!local) {
    return {
      address: null,
      validUntil: 0,
      onchainDelegate: onchain || null,
      active: false,
      eth: 0,
      ethRaw: 0n,
      needsEth: true,
    };
  }

  return {
    address: local.address,
    validUntil: local.validUntil,
    onchainDelegate: onchain || null,
    active: onchainLower === String(local.address).toLowerCase(),
    eth: Number(formatEther(ethRaw)),
    ethRaw,
    needsEth: ethRaw < AVANTIS_SMART_WALLET_MIN_ETH,
  };
}

let approvalInFlight = null;

/** Approve USDC for Avantis TradingStorage (max allowance, one popup). */
export async function ensureAvantisUsdcApproval({ walletClient, walletAddr, publicClient }) {
  if (!walletClient || !walletAddr || !publicClient) {
    throw new Error('Wallet not connected');
  }
  if (approvalInFlight) return approvalInFlight;

  const run = (async () => {
    let allowance;
    try {
      allowance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [walletAddr, TRADING_STORAGE_ADDRESS],
      });
    } catch {
      throw new Error('Could not read USDC allowance — RPC unavailable');
    }
    if (allowance >= MAX_UINT256) return null;

    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [TRADING_STORAGE_ADDRESS, MAX_UINT256],
    });
    await waitForReceiptWithTimeout(publicClient, hash);

    let visible = false;
    for (let i = 0; i < 8; i++) {
      try {
        const cur = await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [walletAddr, TRADING_STORAGE_ADDRESS],
        });
        if (cur >= MAX_UINT256) {
          visible = true;
          break;
        }
      } catch { /* transient RPC */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!visible) {
      throw new Error('USDC approval not yet visible on-chain — retry in a few seconds');
    }
    return hash;
  })();

  approvalInFlight = run;
  try {
    return await run;
  } finally {
    approvalInFlight = null;
  }
}

/**
 * One-click Smart Wallet: local delegate + on-chain setDelegate + USDC approve.
 * User signs 1–2 wallet popups; delegate key stays in browser storage.
 */
export async function enableAvantisSmartWallet({
  walletClient,
  walletAddr,
  publicClient,
  ensureChain,
}) {
  if (!walletClient || !walletAddr || !publicClient) {
    throw new Error('Wallet not connected');
  }
  if (typeof ensureChain === 'function') {
    await ensureChain();
  }

  const delegate = getOrCreateAvantisSmartWalletDelegate(walletAddr);
  let hash = null;
  const current = await fetchAvantisDelegate(publicClient, walletAddr);
  if (String(current || '').toLowerCase() !== String(delegate.address).toLowerCase()) {
    hash = await walletClient.writeContract({
      address: TRADING_ADDRESS,
      abi: TRADING_ABI,
      functionName: 'setDelegate',
      args: [delegate.address],
    });
    await waitForReceiptWithTimeout(publicClient, hash);
  }

  await ensureAvantisUsdcApproval({ walletClient, walletAddr, publicClient });
  const status = await refreshAvantisSmartWalletStatus(publicClient, walletAddr);

  return {
    tx_hash: hash,
    address: delegate.address,
    active: !!status?.active,
    needs_eth: !!status?.needsEth,
    eth: status?.eth ?? 0,
    valid_until: delegate.validUntil,
  };
}
