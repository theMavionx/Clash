// GMX (Arbitrum) destination for ClashBot copy bots: a GMX one-click (1CT)
// subaccount approved by the player's wallet. Mirrors ClashBot's website
// connector (egorble/copy-trading src/copyTrading/venues/gmx.ts) without the
// GMX SDK: the game ships @gmx-io/sdk 1.5 whose API paths predate GMX's /v1
// routes, so the same HTTP calls are made directly (GMX API sends CORS *).
//
// Trade-only: the subaccount key can only submit orders through GMX's
// subaccount router within the approved count/expiry; it cannot withdraw.
// The player's main key never leaves the wallet.
import { encodeFunctionData, keccak256, maxUint256, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const CHAIN_ID = 42161;
const API_URL = 'https://arbitrum.gmxapi.io';
const USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
/** GMX SyntheticsRouter on Arbitrum (the "router" spender of @gmx-io/sdk configs/contracts). */
const SYNTHETICS_ROUTER = '0x7452c558d45f8afc8c83dae62c3f8a5be19c71f6';
/** ClashBot attribution, enforced by its server (server/config.ts gmxReferralCode / gmxUiFeeReceiver / gmxMaxUiFeeBps). */
const REFERRAL_CODE = 'clashofperps';
const UI_FEE_RECEIVER = '0x412a02ba415e5969596e6f0a35f9439760a3468f';
const MAX_UI_FEE_BPS = 2;
const SUBACCOUNT_MESSAGE = 'Generate a GMX 1CT (One-Click Trading) session. Only sign this message on a trusted website.';
const APPROVAL_SECONDS = 30 * 24 * 60 * 60;
const APPROVAL_ACTIONS = 100_000n;
const ERC20_APPROVE_ABI = [{
  type: 'function', name: 'approve', stateMutability: 'nonpayable',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
}];

export const requirements = {
  chain: 'evm',
  label: 'Your wallet signs a GMX one-click trading session and a 30-day subaccount approval (plus a USDC approval to the GMX router if missing). The subaccount can only place orders; it cannot withdraw.',
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function address(value, label) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(text)) throw new Error(`${label} is invalid`);
  return text;
}

async function gmxApi(path, body) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, body === undefined
      ? { headers: { accept: 'application/json' } }
      : { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('GMX is unreachable right now. Try again in a moment.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : `GMX request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

function provider(walletCtx) {
  const value = walletCtx?.evmProvider;
  if (!value?.request) throw new Error('Connect your EVM wallet to set up GMX.');
  return value;
}

async function personalSign(wallet, owner, message) {
  const hex = stringToHex(message);
  try {
    return String(await wallet.request({ method: 'personal_sign', params: [hex, owner] }));
  } catch (first) {
    if (first?.code === 4001) throw new Error('GMX session signature was rejected in the wallet.');
    try { return String(await wallet.request({ method: 'personal_sign', params: [owner, hex] })); } catch { throw first; }
  }
}

async function waitForReceipt(wallet, hash) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const receipt = await wallet.request({ method: 'eth_getTransactionReceipt', params: [hash] }).catch(() => null);
    if (receipt) {
      if (receipt.status !== '0x1') throw new Error('The USDC approval for GMX failed on-chain.');
      return;
    }
    await sleep(1_500);
  }
  throw new Error('The USDC approval for GMX is still pending. Retry after it confirms.');
}

const big = (value) => {
  try { return BigInt(value ?? 0); } catch { return 0n; }
};

/**
 * @param {{ walletCtx: object, onProgress?: (message: string) => void, requiredAllocationUsd?: number }} ctx
 * @returns {Promise<{ destinationAccount: string, credential: object }>}
 */
export async function connect(ctx) {
  const { walletCtx, onProgress, onStage } = ctx || {};
  onStage?.('wallet');
  const wallet = provider(walletCtx);
  const owner = address(walletCtx?.evmWalletAddress || walletCtx?.walletAddress, 'GMX wallet');
  onStage?.('network');
  if (typeof walletCtx?.ensureChain === 'function') await walletCtx.ensureChain(CHAIN_ID);

  // GMX's deterministic one-click subaccount: keccak256 of the owner's
  // signature over GMX's fixed 1CT message (same derivation as GMX and ClashBot).
  onStage?.('session');
  onProgress?.('Sign the GMX one-click trading session in your wallet…');
  const sessionSignature = await personalSign(wallet, owner, SUBACCOUNT_MESSAGE);
  const privateKey = keccak256(sessionSignature);
  const subaccount = privateKeyToAccount(privateKey).address.toLowerCase();
  if (subaccount === owner) throw new Error('GMX subaccount derivation failed');

  onStage?.('approval');
  const status = await gmxApi('/v1/subaccounts/status', { account: owner, subaccountAddress: subaccount });
  const requestedExpiry = BigInt(Math.floor(Date.now() / 1000) + APPROVAL_SECONDS);
  const expiresAt = big(status?.expiresAt) > requestedExpiry ? big(status.expiresAt) : requestedExpiry;
  const maxAllowedCount = big(status?.currentActionsCount) + APPROVAL_ACTIONS;
  const prepared = await gmxApi('/v1/subaccounts/approval/prepare', {
    account: owner, subaccountAddress: subaccount, shouldAdd: status?.active !== true,
    expiresAt: expiresAt.toString(), maxAllowedCount: maxAllowedCount.toString(),
  });
  const domain = prepared?.domain || {};
  const message = prepared?.message || {};
  // Same checks as @gmx-io/sdk validateSubaccountApprovalTypedData plus ClashBot's credential rules.
  if (Number(domain.chainId) !== CHAIN_ID || String(message.subaccount || '').toLowerCase() !== subaccount
    || Number(message.desChainId) !== CHAIN_ID || String(message.deadline) !== String(message.expiresAt)
    || !/^0x0{64}$/i.test(String(message.integrationId || ''))) {
    throw new Error('GMX returned an unexpected subaccount approval. Try again.');
  }
  const primaryType = prepared.primaryType || Object.keys(prepared.types || {}).find((key) => key !== 'EIP712Domain');
  if (!primaryType) throw new Error('GMX approval is missing its typed-data type');
  onProgress?.('Approve the GMX one-click subaccount in your wallet…');
  const typedData = JSON.stringify({
    domain,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
      ],
      ...prepared.types,
    },
    primaryType,
    message,
  });
  let signature;
  try {
    signature = String(await wallet.request({ method: 'eth_signTypedData_v4', params: [owner, typedData] }));
  } catch (error) {
    if (error?.code === 4001) throw new Error('GMX subaccount approval was rejected in the wallet.');
    throw error;
  }
  const approval = {
    subaccount: String(message.subaccount).toLowerCase(),
    shouldAdd: Boolean(message.shouldAdd),
    expiresAt: big(message.expiresAt).toString(),
    maxAllowedCount: big(message.maxAllowedCount).toString(),
    actionType: String(message.actionType).toLowerCase(),
    nonce: big(message.nonce ?? prepared.nonce).toString(),
    desChainId: big(message.desChainId).toString(),
    deadline: big(message.deadline).toString(),
    integrationId: String(message.integrationId).toLowerCase(),
    signature,
    signedAt: Date.now(),
    signatureChainId: Number(domain.chainId),
    subaccountRouterAddress: String(prepared.relayRouterAddress || domain.verifyingContract || '').toLowerCase(),
  };

  // Orders draw USDC collateral through the GMX router.
  onStage?.('collateral');
  const allowances = await gmxApi(`/v1/allowances?address=${owner}&spender=router`);
  const usdcAllowance = big((Array.isArray(allowances) ? allowances : []).find((row) => String(row?.address || '').toLowerCase() === USDC)?.allowance);
  const required = BigInt(Math.max(1, Math.ceil(Number(ctx?.requiredAllocationUsd || 1) * 1_000_000)));
  if (usdcAllowance < required) {
    onProgress?.('Approve USDC for the GMX router in your wallet…');
    const data = encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [SYNTHETICS_ROUTER, maxUint256] });
    const hash = String(await wallet.request({ method: 'eth_sendTransaction', params: [{ from: owner, to: USDC, data, value: '0x0' }] }));
    onProgress?.('Waiting for the USDC approval to confirm…');
    await waitForReceipt(wallet, hash);
  }

  return {
    destinationAccount: owner,
    credential: {
      owner, subaccount, privateKey, approval, chainId: CHAIN_ID,
      referralCode: REFERRAL_CODE, uiFeeReceiver: UI_FEE_RECEIVER, maxUiFeeBps: MAX_UI_FEE_BPS,
    },
  };
}
