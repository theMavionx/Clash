/**
 * Shared Nado linked-signer enable flow (Futures + Bots).
 */
import { createNadoClient } from '@nadohq/client';
import { createWalletClient, getAddress, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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
import { reconcileNadoLinkedSigner } from './nadoLinkedSignerReconcile';

function createLinkedSignerWalletClient(record) {
  const account = privateKeyToAccount(record.privateKey);
  const rpcUrl = (Array.isArray(INK_RPC_URLS) ? INK_RPC_URLS[0] : String(INK_RPC_URLS || '').split(',')[0])
    ?.trim() || 'https://rpc-gel.inkonchain.com';
  return createWalletClient({
    account,
    chain: inkChain,
    transport: http(rpcUrl),
  });
}

function checksumOwner(walletAddress) {
  const raw = String(walletAddress || '').trim();
  if (!raw) return '';
  try {
    return getAddress(raw);
  } catch {
    return raw.toLowerCase();
  }
}

function rewriteChainIdError(err) {
  const msg = String(err?.shortMessage || err?.message || err || '');
  if (/chainId should be same as current chainId/i.test(msg) || (/chainId/i.test(msg) && /current chainId/i.test(msg))) {
    return new Error(
      `Nado requires Ink (chain ${INK_CHAIN_ID}). Switch your wallet to Ink and retry Setup & Sync.`,
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

async function assertProviderOnInk(walletClient) {
  if (!walletClient?.request) return;
  let hex;
  try {
    hex = await walletClient.request({ method: 'eth_chainId' });
  } catch {
    return;
  }
  const id = Number(hex);
  if (Number.isFinite(id) && id !== INK_CHAIN_ID) {
    throw new Error(
      `Wallet is still on chain ${id}. Nado requires Ink (${INK_CHAIN_ID}). Switch network and retry.`,
    );
  }
}

function resolveWalletClients({ walletAddress, walletClient, publicClient, getWalletClient, getPublicClient }) {
  const owner = checksumOwner(walletAddress);
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
  try {
    if (typeof ctx.ensureChain === 'function') {
      await ctx.ensureChain(INK_CHAIN_ID);
    }
    // Re-resolve AFTER switch so getWalletClient sees Ink provider state.
    const { owner, walletClient, publicClient } = resolveWalletClients(ctx);
    await assertProviderOnInk(walletClient);

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
    await reconcileNadoLinkedSigner({
      stored: readNadoLinkedSigner(owner),
      createStandardSigner: async () => linkedSignerFromPrivateKey(
        (await ownerClient.subaccount.createStandardLinkedSigner(NADO_SUBACCOUNT_NAME)).privateKey,
      ),
      getRemote: () => getRemoteLinkedSigner(ownerClient, owner),
      linkSigner: async signer => {
        try {
          await ownerClient.subaccount.linkSigner({
            subaccountName: NADO_SUBACCOUNT_NAME,
            signer,
          });
        } catch (err) {
          throw rewriteChainIdError(err);
        }
      },
      remember: record => rememberNadoLinkedSigner(owner, record),
      normalizeSigner: nadoSignerAddress,
      encodeSigner: nadoAddressToBytes32,
    });
    return { ok: true, wallet: owner };
  } catch (err) {
    throw rewriteChainIdError(err);
  }
}
