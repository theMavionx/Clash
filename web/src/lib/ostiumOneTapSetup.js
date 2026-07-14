/**
 * Ostium Bots one-tap — same model as Futures useOstium.ensureOneTapReady:
 * browser-held delegate key + setDelegate + USDC approve + MetaMask gas top-up.
 * User does NOT paste MetaMask private key; ETH comes from connected wallet.
 */
import { formatEther, parseEther } from 'viem';
import {
  TRADING_ADDRESS,
  TRADING_STORAGE_ADDRESS,
  USDC_ADDRESS,
  ERC20_ABI,
  TRADING_ABI,
  fetchOstiumDelegate,
} from './ostiumContract';
import {
  OSTIUM_DELEGATE_MIN_ETH,
  OSTIUM_DELEGATE_TARGET_ETH,
  OSTIUM_CHAIN_ID,
} from './ostiumConfig';
import {
  ensureOstiumDelegate,
  loadOstiumDelegate,
} from './ostiumDelegateWallet';

const TX_TIMEOUT_MS = 90_000;
const MAX_UINT256 = (1n << 256n) - 1n;

function safeParseEther(value, fallback) {
  try {
    return parseEther(String(value || fallback));
  } catch {
    return parseEther(fallback);
  }
}

const DELEGATE_GAS_MIN_WEI = safeParseEther(OSTIUM_DELEGATE_MIN_ETH, '0.00005');
const DELEGATE_GAS_TARGET_WEI = safeParseEther(OSTIUM_DELEGATE_TARGET_ETH, '0.00030');

async function waitForReceiptWithTimeout(publicClient, hash) {
  try {
    return await publicClient.waitForTransactionReceipt({ hash, timeout: TX_TIMEOUT_MS });
  } catch (e) {
    if (/timed? ?out|WaitForTransactionReceipt/i.test(String(e?.message || e))) {
      const err = new Error('Transaction pending too long — check MetaMask and retry');
      err.code = 'TX_TIMEOUT';
      throw err;
    }
    throw e;
  }
}

export async function refreshOstiumOneTapStatus(publicClient, walletAddr) {
  const owner = String(walletAddr || '').toLowerCase();
  if (!owner || !publicClient) return null;

  const local = await loadOstiumDelegate(owner).catch(() => null);
  const onchain = await fetchOstiumDelegate(publicClient, owner);
  const onchainLower = String(onchain || '').toLowerCase();

  if (!local?.address) {
    return {
      address: null,
      onchainDelegate: onchain || null,
      active: false,
      eth: 0,
      ethRaw: 0n,
      needsEth: true,
      mode: 'futures_one_tap',
    };
  }

  let ethRaw = 0n;
  try {
    ethRaw = await publicClient.getBalance({ address: local.address });
  } catch {
    ethRaw = 0n;
  }

  return {
    address: local.address,
    onchainDelegate: onchain || null,
    active: onchainLower === String(local.address).toLowerCase(),
    eth: Number(formatEther(ethRaw)),
    ethRaw,
    needsEth: ethRaw < DELEGATE_GAS_MIN_WEI,
    mode: 'futures_one_tap',
  };
}

async function ensureOstiumUsdcApproval({ walletClient, walletAddr, publicClient }) {
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
  if (allowance >= MAX_UINT256 / 2n) return null;

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [TRADING_STORAGE_ADDRESS, MAX_UINT256],
  });
  await waitForReceiptWithTimeout(publicClient, hash);
  return hash;
}

function gasWithBuffer(value, fallback = 50_000n, bufferBps = 2_500n) {
  const gas = typeof value === 'bigint' && value > 0n ? value : fallback;
  return (gas * (10_000n + bufferBps) + 9_999n) / 10_000n;
}

async function topUpDelegateGasFromMetamask({
  walletClient,
  walletAddr,
  publicClient,
  delegateAddress,
  force = false,
}) {
  const current = await publicClient.getBalance({ address: delegateAddress }).catch(() => 0n);
  if (current >= DELEGATE_GAS_MIN_WEI && !force) {
    return { skipped: true, eth: Number(formatEther(current)) };
  }
  const target = DELEGATE_GAS_TARGET_WEI > DELEGATE_GAS_MIN_WEI
    ? DELEGATE_GAS_TARGET_WEI
    : DELEGATE_GAS_MIN_WEI;
  const amount = current >= target ? 0n : target - current;
  if (amount <= 0n) return { skipped: true, eth: Number(formatEther(current)) };

  // Arbitrum + Infura: bare sendTransaction often lands with gas=21000 and
  // fails "gas required exceeds allowance (21000)". Futures useOstium sets an
  // explicit buffered limit — mirror that here.
  let gasLimit = gasWithBuffer(50_000n, 50_000n);
  let gasCost = 0n;
  try {
    const [estimatedGas, gasPrice] = await Promise.all([
      publicClient
        .estimateGas({
          account: walletAddr,
          to: delegateAddress,
          value: amount,
        })
        .catch(() => 50_000n),
      publicClient.getGasPrice().catch(() => 0n),
    ]);
    gasLimit = gasWithBuffer(estimatedGas, 50_000n);
    // Floor: never ship the L1-style 21k default on Arbitrum.
    if (gasLimit < 50_000n) gasLimit = 50_000n;
    gasCost = gasLimit * gasPrice;
  } catch {
    gasLimit = 80_000n;
  }

  const walletBalance = await publicClient.getBalance({ address: walletAddr }).catch(() => null);
  const cushion = gasCost > 0n ? gasCost : parseEther('0.00005');
  if (walletBalance != null && walletBalance < amount + cushion) {
    const err = new Error(
      `Need ~${formatEther(amount + cushion)} ETH on MetaMask (Arbitrum) to fund one-tap gas. `
      + `Balance: ${formatEther(walletBalance)} ETH.`,
    );
    err.code = 'OSTIUM_DELEGATE_GAS_INSUFFICIENT';
    throw err;
  }

  const hash = await walletClient.sendTransaction({
    account: walletAddr,
    chain: walletClient.chain,
    to: delegateAddress,
    value: amount,
    gas: gasLimit,
  });
  await waitForReceiptWithTimeout(publicClient, hash);
  const after = await publicClient.getBalance({ address: delegateAddress }).catch(() => current + amount);
  return {
    skipped: false,
    tx_hash: hash,
    amount_eth: Number(formatEther(amount)),
    eth: Number(formatEther(after)),
  };
}

/**
 * Force MetaMask → delegate ETH top-up (Bots Accounts when SYNCED but gas=0).
 */
export async function topUpOstiumDelegateGas({
  walletClient,
  walletAddr,
  publicClient,
  ensureChain,
  force = true,
}) {
  if (!walletClient || !walletAddr || !publicClient) {
    throw new Error('Connect your Arbitrum MetaMask first');
  }
  if (typeof ensureChain === 'function') {
    await ensureChain(OSTIUM_CHAIN_ID);
  }
  const delegate = await ensureOstiumDelegate(walletAddr);
  const topUp = await topUpDelegateGasFromMetamask({
    walletClient,
    walletAddr,
    publicClient,
    delegateAddress: delegate.address,
    force,
  });
  const status = await refreshOstiumOneTapStatus(publicClient, walletAddr);
  return {
    address: delegate.address,
    eth: status?.eth ?? topUp.eth,
    needs_eth: !!status?.needsEth,
    gas_top_up: topUp,
    active: !!status?.active,
  };
}

/**
 * One-click Futures-parity setup for Bots:
 * 1) create/load browser delegate
 * 2) MetaMask: setDelegate(delegate)
 * 3) MetaMask: USDC approve
 * 4) MetaMask: top up ~0.0003 ETH to delegate (if needed)
 */
export async function enableOstiumOneTap({
  walletClient,
  walletAddr,
  publicClient,
  ensureChain,
  topUpGas = true,
}) {
  if (!walletClient || !walletAddr || !publicClient) {
    throw new Error('Connect your Arbitrum MetaMask first');
  }
  if (typeof ensureChain === 'function') {
    await ensureChain(OSTIUM_CHAIN_ID);
  }

  const delegate = await ensureOstiumDelegate(walletAddr);
  let setDelegateHash = null;
  const current = await fetchOstiumDelegate(publicClient, walletAddr);
  if (String(current || '').toLowerCase() !== String(delegate.address).toLowerCase()) {
    setDelegateHash = await walletClient.writeContract({
      address: TRADING_ADDRESS,
      abi: TRADING_ABI,
      functionName: 'setDelegate',
      args: [delegate.address],
    });
    await waitForReceiptWithTimeout(publicClient, setDelegateHash);
  }

  await ensureOstiumUsdcApproval({ walletClient, walletAddr, publicClient });

  let topUp = { skipped: true };
  if (topUpGas) {
    topUp = await topUpDelegateGasFromMetamask({
      walletClient,
      walletAddr,
      publicClient,
      delegateAddress: delegate.address,
    });
  }

  const status = await refreshOstiumOneTapStatus(publicClient, walletAddr);
  if (!status?.active) {
    throw new Error('On-chain delegate did not match after setup. Confirm MetaMask txs and retry.');
  }

  return {
    address: delegate.address,
    privateKey: delegate.privateKey,
    active: true,
    needs_eth: !!status.needsEth,
    eth: status.eth,
    set_delegate_tx: setDelegateHash,
    gas_top_up: topUp,
    mode: 'futures_one_tap',
  };
}

/** @deprecated alias — Bots used Smart Wallet naming; Futures calls it one tap. */
export const enableOstiumSmartWallet = enableOstiumOneTap;
export const refreshOstiumSmartWalletStatus = refreshOstiumOneTapStatus;
