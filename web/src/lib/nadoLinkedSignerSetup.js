/**
 * Shared Nado linked-signer enable flow (Futures + Bots).
 */
import { createNadoClient } from '@nadohq/client';
import { createWalletClient, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  INK_CHAIN_ID,
  INK_RPC_URLS,
  NADO_CHAIN_ENV,
  NADO_SUBACCOUNT_NAME,
  inkChain,
} from './nadoConfig';
import {
  linkedSignerFromPrivateKey,
  nadoAddressToBytes32,
  nadoSignerAddress,
  readNadoLinkedSigner,
  rememberNadoLinkedSigner,
} from './nadoLinkedSignerStorage';

function createLinkedSignerWalletClient(record) {
  const account = privateKeyToAccount(record.privateKey);
  const rpcUrl = INK_RPC_URLS.split(',')[0]?.trim() || 'https://rpc-gel.inkonchain.com';
  return createWalletClient({
    account,
    chain: inkChain,
    transport: http(rpcUrl),
  });
}

function resolveWalletClients({ walletAddress, walletClient, publicClient, getWalletClient, getPublicClient }) {
  const owner = String(walletAddress || '').trim().toLowerCase();
  // Prefer Ink-bound clients. BotsPanel often passes the default walletClient
  // which is Base (8453) — Nado linkSigner then throws chainId mismatch vs 57073.
  const inkWc = typeof getWalletClient === 'function' ? getWalletClient(INK_CHAIN_ID) : null;
  const inkPc = typeof getPublicClient === 'function' ? getPublicClient(INK_CHAIN_ID) : null;
  let wc = inkWc || null;
  let pc = inkPc || null;
  if (!wc && walletClient) {
    const cid = Number(walletClient.chain?.id);
    if (!cid || cid === INK_CHAIN_ID) wc = walletClient;
  }
  if (!pc && publicClient) {
    const cid = Number(publicClient.chain?.id);
    if (!cid || cid === INK_CHAIN_ID) pc = publicClient;
  }
  if (!owner || !wc || !pc) {
    throw new Error('Connect Ink EVM wallet — Setup & Sync will link the Nado signer.');
  }
  if (Number(wc.chain?.id) && Number(wc.chain.id) !== INK_CHAIN_ID) {
    throw new Error(
      `Wallet client is on chain ${wc.chain.id}; Nado requires Ink (${INK_CHAIN_ID}). Switch network and retry.`,
    );
  }
  return { owner, walletClient: wc, publicClient: pc };
}

async function getRemoteLinkedSigner(client, walletAddr) {
  return client.subaccount.getSubaccountLinkedSignerWithRateLimit({
    subaccount: {
      subaccountOwner: walletAddr,
      subaccountName: NADO_SUBACCOUNT_NAME,
    },
  });
}

/**
 * Enable Nado one-tap linked signer (wallet signs linkSigner if needed).
 */
export async function ensureNadoLinkedSignerReady(ctx = {}) {
  if (typeof ctx.ensureChain === 'function') {
    await ctx.ensureChain(INK_CHAIN_ID);
  }
  // Re-resolve AFTER switch so getWalletClient sees Ink provider state.
  const { owner, walletClient, publicClient } = resolveWalletClients(ctx);

  const stored = readNadoLinkedSigner(owner);
  if (stored) {
    const linkedClient = createNadoClient(NADO_CHAIN_ENV, {
      publicClient,
      walletClient,
      linkedSignerWalletClient: createLinkedSignerWalletClient(stored),
    });
    const remote = await getRemoteLinkedSigner(linkedClient, owner).catch(() => null);
    if (nadoSignerAddress(remote?.signer) === stored.address) {
      return { ok: true, wallet: owner };
    }
  }

  const ownerClient = createNadoClient(NADO_CHAIN_ENV, { publicClient, walletClient });
  const created = readNadoLinkedSigner(owner) || linkedSignerFromPrivateKey(generatePrivateKey());
  const signerBytes32 = nadoAddressToBytes32(created.account.address);

  let remote = await getRemoteLinkedSigner(ownerClient, owner).catch(() => null);
  if (nadoSignerAddress(remote?.signer) !== created.address) {
    await ownerClient.subaccount.linkSigner({
      subaccountName: NADO_SUBACCOUNT_NAME,
      signer: signerBytes32,
    });
    for (let i = 0; i < 6; i += 1) {
      remote = await getRemoteLinkedSigner(ownerClient, owner).catch(() => null);
      if (nadoSignerAddress(remote?.signer) === created.address) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (nadoSignerAddress(remote?.signer) !== created.address) {
    throw new Error('Nado linked signer was submitted but is not active yet. Wait a few seconds and retry.');
  }

  rememberNadoLinkedSigner(owner, created);
  return { ok: true, wallet: owner };
}
