/**
 * Bot sync uses the same browser credentials + auth flows as Futures.
 * Call ensureGameExchangeReady() before POST /api/v1/accounts.
 */
import { readHyperliquidAgentAsync } from './hyperliquidClient';
import { ensureHyperliquidAgentApproved } from './hyperliquidAgentSetup';
import { ensureHotstuffTradingAgent } from './hotstuffAgentSetup';
import { HOTSTUFF_CHAIN_ID } from './hotstuffConfig';
import { loadHotstuffStoredAgent } from './hotstuffAgentStorage';
import { ensureNadoLinkedSignerReady } from './nadoLinkedSignerSetup';
import { readNadoLinkedSigner } from './nadoLinkedSignerStorage';
import { readPacificaAgent, findAnyPacificaAgent, listStoredPacificaMasters } from './pacificaAgentStorage';
import { bindPacificaAgent } from './pacificaBind';
import { registeredDexWallet, playerLoginWallet } from './playerDexAccounts';
import { readAvantisSmartWalletDelegate } from './avantisSmartWallet';
import { getFlashOneTapAgent } from './flashOneTap';
import { enableFlashOneTapSession } from './flashOneTapSetup';
import { ensureKatanaOneTapReady, loadKatanaStoredCredentials, loadKatanaStoredOneTapSigner } from './katanaOneTapSetup';
import {
  enableAvantisSmartWallet,
  refreshAvantisSmartWalletStatus,
} from './avantisSmartWalletSetup';
import { readOstiumSmartWalletDelegate } from './ostiumSmartWallet';
import { loadOstiumDelegate } from './ostiumDelegateWallet';
import {
  enableOstiumOneTap,
  refreshOstiumOneTapStatus,
} from './ostiumOneTapSetup';
import { OSTIUM_CHAIN_ID } from './ostiumConfig';
import { resolveDecibelActivation } from './decibelSubaccountCache';

export function solanaWalletsForPlayer(player, dex = '', ctx = {}) {
  const out = [];
  const add = (value) => {
    const w = String(value || '').trim();
    if (w && !out.includes(w)) out.push(w);
  };
  add(ctx.solanaWalletAddress);
  if (dex) add(registeredDexWallet(player, dex, 'solana'));
  add(registeredDexWallet(player, '', 'solana'));
  add(playerLoginWallet(player, 'solana'));
  return out;
}

export function evmWalletsForPlayer(player, dex = '', ctx = {}) {
  const out = [];
  const add = (value) => {
    const w = String(value || '').trim().toLowerCase();
    if (w && !out.includes(w)) out.push(w);
  };
  add(ctx.evmWalletAddress || ctx.walletAddress);
  if (dex) add(registeredDexWallet(player, dex, 'evm'));
  add(registeredDexWallet(player, '', 'evm'));
  add(playerLoginWallet(player, 'evm'));
  return out;
}

async function ensurePacificaReady(player, ctx = {}) {
  const { signMessage, walletAddress, solanaWalletAddress } = ctx;
  const preferred = [];
  const add = (w) => {
    const v = String(w || '').trim();
    if (v && !preferred.includes(v)) preferred.push(v);
  };
  add(solanaWalletAddress || walletAddress);
  for (const w of solanaWalletsForPlayer(player, 'pacifica', ctx)) {
    add(w);
  }
  for (const m of listStoredPacificaMasters()) add(m);

  const existing = await findAnyPacificaAgent(preferred);
  if (existing?.privateKey) return { ok: true, wallet: existing.master };

  const primary = preferred[0] || '';
  if (!primary) {
    return { ok: false, error: 'Connect Solana Phantom (same wallet as Futures → Pacifica).' };
  }

  if (!signMessage) {
    return {
      ok: false,
      error: 'Agent key not found. Click Connect bot — Phantom will ask for a signature (same as Futures).',
    };
  }

  try {
    await bindPacificaAgent({
      walletAddr: primary,
      masterSign: async (bytes) => {
        const sig = await signMessage(bytes);
        return sig instanceof Uint8Array ? sig : new Uint8Array(sig);
      },
    });
    const agent = await readPacificaAgent(primary);
    if (agent?.privateKey) return { ok: true, wallet: primary };
    return { ok: false, error: 'Pacifica agent bind finished but the key was not saved in the browser.' };
  } catch (e) {
    return { ok: false, error: e?.message || 'Pacifica agent bind failed' };
  }
}

async function ensureHyperliquidReady(player, ctx = {}) {
  const wallets = evmWalletsForPlayer(player, 'hyperliquid', ctx);
  const primary = (ctx.walletAddress || ctx.evmWalletAddress || wallets[0] || '').toLowerCase();
  if (!primary) {
    return { ok: false, error: 'Connect your EVM wallet in the game (Futures → Hyperliquid).' };
  }

  for (const w of [primary, ...wallets.filter((x) => x !== primary)]) {
    const agent = await readHyperliquidAgentAsync(w);
    if (agent?.privateKey) return { ok: true, wallet: w };
  }

  try {
    await ensureHyperliquidAgentApproved({
      walletAddress: primary,
      evmProvider: ctx.evmProvider,
      walletClient: ctx.walletClient,
      ensureChain: ctx.ensureChain,
    });
    const agent = await readHyperliquidAgentAsync(primary);
    if (agent?.privateKey) return { ok: true, wallet: primary };
    return { ok: false, error: 'Hyperliquid agent setup finished but key was not saved.' };
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/user rejected|denied|cancelled|canceled/i.test(msg)) {
      return { ok: false, error: 'Signature cancelled in wallet.' };
    }
    return { ok: false, error: msg || 'Hyperliquid agent setup failed' };
  }
}

async function ensureHotstuffReady(player, ctx = {}) {
  const wallets = evmWalletsForPlayer(player, 'hotstuff', ctx);
  const primary = (ctx.walletAddress || ctx.evmWalletAddress || wallets[0] || '').toLowerCase();
  if (!primary) {
    return { ok: false, error: 'Connect your EVM wallet (Futures → Hotstuff).' };
  }

  for (const w of [primary, ...wallets.filter((x) => x !== primary)]) {
    const agent = await loadHotstuffStoredAgent(w);
    if (agent?.privateKey) return { ok: true, wallet: w };
  }

  const walletClient = typeof ctx.getWalletClient === 'function'
    ? ctx.getWalletClient(HOTSTUFF_CHAIN_ID)
    : ctx.walletClient;

  try {
    await ensureHotstuffTradingAgent({
      walletAddress: primary,
      walletClient,
      switchChain: ctx.switchChain || ctx.ensureChain,
    });
    const agent = await loadHotstuffStoredAgent(primary);
    if (agent?.privateKey) return { ok: true, wallet: primary };
    return { ok: false, error: 'Hotstuff agent setup finished but key was not saved.' };
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/user rejected|denied|cancelled|canceled/i.test(msg)) {
      return { ok: false, error: 'Signature cancelled in wallet.' };
    }
    return { ok: false, error: msg || 'Hotstuff agent setup failed' };
  }
}

async function ensureNadoReady(player, ctx = {}) {
  const wallets = evmWalletsForPlayer(player, 'nado', ctx);
  const primary = (ctx.walletAddress || ctx.evmWalletAddress || wallets[0] || '').toLowerCase();
  if (!primary) {
    return { ok: false, error: 'Connect your Ink EVM wallet (Futures → Nado).' };
  }

  for (const w of [primary, ...wallets.filter((x) => x !== primary)]) {
    const linked = readNadoLinkedSigner(w);
    if (linked?.privateKey) return { ok: true, wallet: w };
  }

  try {
    await ensureNadoLinkedSignerReady({
      walletAddress: primary,
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      getWalletClient: ctx.getWalletClient,
      getPublicClient: ctx.getPublicClient,
      ensureChain: ctx.ensureChain,
    });
    const linked = readNadoLinkedSigner(primary);
    if (linked?.privateKey) return { ok: true, wallet: primary };
    return { ok: false, error: 'Nado linked signer setup finished but key was not saved.' };
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/user rejected|denied|cancelled|canceled/i.test(msg)) {
      return { ok: false, error: 'Signature cancelled in wallet.' };
    }
    return { ok: false, error: msg || 'Nado linked signer setup failed' };
  }
}

async function ensureOstiumReady(player, ctx = {}) {
  const wallets = evmWalletsForPlayer(player, 'ostium', ctx);
  const primary = (ctx.walletAddress || ctx.evmWalletAddress || wallets[0] || '').toLowerCase();
  const ordered = primary ? [primary, ...wallets.filter((w) => w !== primary)] : wallets;
  const publicClient = ctx.getPublicClient?.(OSTIUM_CHAIN_ID) || ctx.publicClient;
  const walletClient = ctx.getWalletClient?.(OSTIUM_CHAIN_ID) || ctx.walletClient;
  const ensureChain = ctx.ensureChain
    ? () => ctx.ensureChain(OSTIUM_CHAIN_ID)
    : null;

  for (const w of ordered) {
    const futuresDelegate = await loadOstiumDelegate(w).catch(() => null);
    const legacy = readOstiumSmartWalletDelegate(w);
    const hasKey = !!(futuresDelegate?.privateKey || legacy?.privateKey);
    if (!hasKey) continue;
    if (publicClient) {
      const status = await refreshOstiumOneTapStatus(publicClient, w);
      if (status?.active && !status.needsEth) {
        return { ok: true, wallet: w };
      }
      // Active but gas empty — fall through to enableOstiumOneTap (top-up).
      if (status?.active && status.needsEth && walletClient) {
        break;
      }
      if (status?.active && status.needsEth && !walletClient) {
        return {
          ok: false,
          error:
            `One-tap delegate needs ETH for gas (${status.address || 'delegate'}). `
            + 'Connect MetaMask and click «Top up one-tap gas».',
        };
      }
    } else {
      return { ok: true, wallet: w };
    }
  }

  if (!primary) {
    return {
      ok: false,
      error: 'Connect your Arbitrum wallet in Bots (same as Futures → Ostium).',
    };
  }

  if (!walletClient || !publicClient) {
    return {
      ok: false,
      error: 'Connect Arbitrum MetaMask. Click One tap + Sync — setDelegate, USDC approve, and gas top-up.',
    };
  }

  try {
    const result = await enableOstiumOneTap({
      walletClient,
      walletAddr: primary,
      publicClient,
      ensureChain,
      topUpGas: true,
    });
    if (!result?.active && !result?.address) {
      return { ok: false, error: 'Ostium one-tap setup finished but delegate was not saved.' };
    }
    const out = { ok: true, wallet: primary };
    if (result.needsEth || result.needs_eth) {
      const addr = String(result.address || '');
      const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : 'delegate';
      return {
        ok: false,
        error:
          `One-tap gas still low on ${short}. `
          + 'Confirm MetaMask has Arbitrum ETH, then click «Top up one-tap gas». '
          + 'Bot orders fail with “insufficient funds for gas” until the delegate is funded.',
      };
    }
    return out;
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/user rejected|denied/i.test(msg)) {
      return { ok: false, error: 'Signature cancelled in wallet.' };
    }
    return { ok: false, error: msg || 'Ostium one-tap setup failed' };
  }
}

async function ensureAvantisReady(player, ctx = {}) {
  const wallets = evmWalletsForPlayer(player, 'avantis', ctx);
  const primary = (ctx.walletAddress || ctx.evmWalletAddress || wallets[0] || '').toLowerCase();
  const ordered = primary ? [primary, ...wallets.filter((w) => w !== primary)] : wallets;
  const { walletClient, publicClient, ensureChain } = ctx;

  for (const w of ordered) {
    const delegate = readAvantisSmartWalletDelegate(w);
    if (!delegate?.privateKey) continue;
    if (publicClient) {
      const status = await refreshAvantisSmartWalletStatus(publicClient, w);
      if (status?.active) return { ok: true, wallet: w };
    } else {
      return { ok: true, wallet: w };
    }
  }

  if (!primary) {
    return {
      ok: false,
      error: 'Connect your Base wallet in Bots (same as Futures → Avantis).',
    };
  }

  if (!walletClient || !publicClient) {
    return {
      ok: false,
      error: 'Connect your Base wallet. Click Smart Wallet + Sync — your wallet will prompt for setDelegate and USDC approve.',
    };
  }

  try {
    const result = await enableAvantisSmartWallet({
      walletClient,
      walletAddr: primary,
      publicClient,
      ensureChain,
    });
    if (!result.active) {
      return { ok: false, error: 'On-chain delegate did not match after setup. Try again.' };
    }
    const out = { ok: true, wallet: primary };
    if (result.needs_eth) {
      const short = `${result.address.slice(0, 6)}…${result.address.slice(-4)}`;
      out.warning = `Fund delegate ${short} with ~0.001 Base ETH for bot gas.`;
    }
    return out;
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/user rejected|denied/i.test(msg)) {
      return { ok: false, error: 'Signature cancelled in wallet.' };
    }
    return { ok: false, error: msg || 'Avantis Smart Wallet setup failed' };
  }
}

async function ensureKatanaReady(player, ctx = {}) {
  const creds = await loadKatanaStoredCredentials();
  if (!creds) {
    return { ok: false, error: 'No Katana API credentials. Activate Katana in Futures.' };
  }
  const wallets = evmWalletsForPlayer(player, 'katana', ctx);
  const primary = String(creds.wallet || ctx.walletAddress || ctx.evmWalletAddress || wallets[0] || '').trim();
  if (!primary) {
    return { ok: false, error: 'Connect EVM wallet for Katana (same wallet as Futures → Katana).' };
  }
  const stored = await loadKatanaStoredOneTapSigner(primary);
  if (stored?.privateKey) return { ok: true, wallet: primary };
  return ensureKatanaOneTapReady({
    ...ctx,
    walletAddress: primary,
    evmWalletAddress: primary,
  });
}

async function ensureDecibelReady(player, ctx = {}) {
  const resolved = await resolveDecibelActivation(player, ctx);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error
        || 'No Decibel activation. Futures → Decibel → enable fast trading (Petra signs delegate to server API wallet).',
    };
  }

  const token = ctx.playerToken;
  if (token) {
    try {
      const res = await fetch('/api/futures/decibel/signer', {
        headers: { 'x-token': token, 'x-dex': 'decibel' },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error: body?.error || 'Decibel server signer unavailable (check DECIBEL_API_WALLET_PRIVATE_KEY on prod).',
        };
      }
      if (body?.gas_ok === false) {
        return {
          ok: false,
          error: `Decibel server API wallet (${String(body.public_key || '').slice(0, 10)}…) needs APT for gas (~0.2 APT).`,
        };
      }
    } catch {
      return { ok: false, error: 'Could not verify Decibel server signer on prod.' };
    }
  }

  return { ok: true, wallet: resolved.wallet, subaccount: resolved.subaccount };
}

async function ensureFlashReady(player, ctx = {}) {
  const wallets = solanaWalletsForPlayer(player, 'flash', ctx);
  const preferred = [];
  const add = (w) => {
    const v = String(w || '').trim();
    if (v && !preferred.includes(v)) preferred.push(v);
  };
  add(ctx.solanaWalletAddress || ctx.walletAddress);
  for (const w of wallets) add(w);

  const isUsable = (agent) => {
    if (!agent?.secretKey || !agent.enabled || !agent.delegated || !agent.sessionToken) return false;
    const validUntil = Number(agent.validUntil || 0);
    return validUntil > Math.ceil(Date.now() / 1000) + 60;
  };

  for (const sol of preferred) {
    const agent = await getFlashOneTapAgent(sol);
    if (isUsable(agent)) return { ok: true, wallet: sol };
  }

  const primary = preferred[0] || '';
  if (!primary) {
    return { ok: false, error: 'Connect Solana Phantom (Futures → Flash).' };
  }

  const { solWallet, playerToken } = ctx;
  if (!solWallet?.publicKey) {
    return {
      ok: false,
      error: 'Connect Solana Phantom — Connect bot will enable Flash one-tap (same as Futures).',
    };
  }

  try {
    const result = await enableFlashOneTapSession({
      solWallet,
      walletAddr: primary,
      playerToken,
    });
    if (result?.error) return { ok: false, error: result.error };
    const agent = await getFlashOneTapAgent(primary);
    if (isUsable(agent)) return { ok: true, wallet: primary };
    return { ok: false, error: 'Flash one-tap setup finished but session is not active yet.' };
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/user rejected|denied|cancelled|canceled|blocked/i.test(msg)) {
      return { ok: false, error: 'Signature cancelled or blocked in wallet.' };
    }
    return { ok: false, error: msg || 'Flash one-tap setup failed' };
  }
}

/**
 * Run game-equivalent readiness check (and inline auth where possible).
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function ensureGameExchangeReady(exchangeId, player, ctx = {}) {
  const ex = String(exchangeId || '').toLowerCase();
  if (ex === 'pacifica') return ensurePacificaReady(player, ctx);
  if (ex === 'flash') return ensureFlashReady(player, ctx);
  if (ex === 'hyperliquid') return ensureHyperliquidReady(player, ctx);
  if (ex === 'hotstuff') return ensureHotstuffReady(player, ctx);
  if (ex === 'nado') return ensureNadoReady(player, ctx);
  if (ex === 'avantis') return ensureAvantisReady(player, ctx);
  if (ex === 'ostium') return ensureOstiumReady(player, ctx);
  if (ex === 'decibel') return ensureDecibelReady(player, ctx);
  if (ex === 'katana') return ensureKatanaReady(player, ctx);
  return { ok: true };
}
