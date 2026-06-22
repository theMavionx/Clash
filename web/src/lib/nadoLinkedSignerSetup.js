/**
 * Shared Nado linked-signer enable flow (Futures + Bots).
 */
import { createNadoClient } from '@nadohq/client';
import { createWalletClient, http, zeroAddress } from 'viem';
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
  const wc = walletClient
    || (typeof getWalletClient === 'function' ? getWalletClient(INK_CHAIN_ID) : null);
  const pc = publicClient
    || (typeof getPublicClient === 'function' ? getPublicClient(INK_CHAIN_ID) : null);
  if (!owner || !wc || !pc) {
    throw new Error('Connect Ink EVM wallet — Setup & Sync will link the Nado signer.');
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
  const { owner, walletClient, publicClient } = resolveWalletClients(ctx);
  if (typeof ctx.ensureChain === 'function') {
    await ctx.ensureChain(INK_CHAIN_ID);
  }

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
