// Trade-only exchange connections handed to ClashBot for server-side copy
// execution (practice and live). Nothing here ever touches a main-wallet key:
//
// - Hyperliquid: a fresh API (agent) wallet dedicated to ClashBot, approved by
//   the player's wallet with `approveAgent` (name "clashbot-copy", 180 days).
//   Agents can trade but cannot withdraw or transfer. If the wallet has not yet
//   approved ClashBot's builder at >= 0.01%, it signs that approval too
//   (ClashBot charges min(0.02%, approved) per order).
// - NADO: the linked signer the game already uses (Futures -> NADO one tap).
//   Linked signers can place and cancel orders only.
// - RISEx: the game's registered session key (trade-only, builder 1 bps).
// - BULK: the game's agent wallet (agents cannot transfer or withdraw).
//
// The key leaves the browser exactly once, over HTTPS to the Clash server,
// which signs it through to ClashBot's partner API. ClashBot verifies it at the
// venue and stores it AES-256-GCM encrypted in the player's own namespace.
import bs58 from 'bs58';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  HYPERLIQUID_ARBITRUM_CHAIN_ID,
  createHyperliquidExchangeClient,
  createHyperliquidInfoClient,
  createHyperliquidWalletAdapter,
} from '../../lib/hyperliquidClient';
import { readNadoLinkedSigner } from '../../lib/nadoLinkedSignerStorage';
import { readRisexSigner } from '../../lib/risexClient';
import { bulkAgentKey, validateBulkAgent } from '../../lib/bulkOneTap';
import { readEncryptedCredential } from '../../lib/encryptedCredentialStorage';
import { evmWalletsForPlayer } from '../../lib/botGameAuth';

/** ClashBot's Hyperliquid builder (server/copy-trading/hyperliquid-outbox.ts). */
export const CLASHBOT_HYPERLIQUID_BUILDER = '0xe2723c1a95692096b4f967eb928f5cc55f098db5';
const HL_AGENT_DAYS = 180;
const HL_MIN_BUILDER_TENTH_BPS = 10;

/** Destinations available from the game, with how their trade-only key is obtained. */
export const GAME_COPY_DESTINATIONS = {
  hyperliquid: {
    chain: 'evm',
    authorize: 'Your wallet signs one approval that creates a ClashBot-only API wallet (trading only, no withdrawals, 180 days). If needed it also approves ClashBot\'s 0.01% builder fee.',
  },
  nado: {
    chain: 'evm',
    authorize: 'ClashBot receives the NADO linked signer the game already uses. A linked signer can place and cancel orders only; it cannot withdraw.',
    setup: 'Turn on one-tap trading in Futures -> NADO first.',
  },
  risex: {
    chain: 'evm',
    authorize: 'ClashBot receives the RISEx session key the game already registered. Session keys trade only; they cannot withdraw.',
    setup: 'Enable one-tap trading in Futures -> RISEx first.',
  },
  bulk: {
    chain: 'solana',
    authorize: 'ClashBot receives the BULK agent wallet the game already registered. Agents cannot transfer or withdraw.',
    setup: 'Enable one-tap trading in Futures -> BULK first.',
  },
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function evmOwners(player, venue, walletCtx) {
  return evmWalletsForPlayer(player, venue, walletCtx || {}).filter((value) => /^0x[0-9a-f]{40}$/.test(value));
}

/** The account ClashBot copies into (the player's own wallet on that venue). */
export function defaultDestinationAccount(venue, player, walletCtx) {
  if (GAME_COPY_DESTINATIONS[venue]?.chain === 'solana') return walletCtx?.solanaWalletAddress || '';
  return evmOwners(player, venue, walletCtx)[0] || '';
}

/** Whether the game already holds the trade-only key (no wallet prompt needed). */
export function hasGameConnection(venue, owner) {
  try {
    if (venue === 'nado') return Boolean(readNadoLinkedSigner(owner)?.privateKey);
    if (venue === 'risex') return Boolean(readRisexSigner(owner)?.privateKey);
  } catch {
    return false;
  }
  return false;
}

async function authorizeHyperliquid(owner, walletCtx, onProgress) {
  if (!walletCtx?.evmProvider && !walletCtx?.walletClient) throw new Error('Connect your EVM wallet to authorise ClashBot on Hyperliquid.');
  const connected = String(walletCtx.evmWalletAddress || walletCtx.walletAddress || '').toLowerCase();
  if (connected && connected !== owner) throw new Error(`Switch your wallet to ${owner.slice(0, 6)}…${owner.slice(-4)} to authorise this account.`);
  if (typeof walletCtx.ensureChain === 'function') await walletCtx.ensureChain(HYPERLIQUID_ARBITRUM_CHAIN_ID);
  const exchange = createHyperliquidExchangeClient(createHyperliquidWalletAdapter({
    address: owner, provider: walletCtx.evmProvider, walletClient: walletCtx.walletClient,
  }));
  const info = createHyperliquidInfoClient();
  const approvedFee = Number(await info.maxBuilderFee({ user: owner, builder: CLASHBOT_HYPERLIQUID_BUILDER }).catch(() => 0)) || 0;
  if (approvedFee < HL_MIN_BUILDER_TENTH_BPS) {
    onProgress?.('Approve the 0.01% ClashBot builder fee in your wallet…');
    const result = await exchange.approveBuilderFee({ builder: CLASHBOT_HYPERLIQUID_BUILDER, maxFeeRate: '0.01%' });
    if (result?.status === 'err' || result?.error) throw new Error(String(result?.response || result?.error || 'Builder fee approval failed'));
  }
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address.toLowerCase();
  const validUntil = Date.now() + HL_AGENT_DAYS * 24 * 60 * 60 * 1000;
  onProgress?.('Approve the ClashBot API wallet in your wallet…');
  const approval = await exchange.approveAgent({ agentAddress: address, agentName: `clashbot-copy valid_until ${validUntil}` });
  if (approval?.status === 'err' || approval?.error) throw new Error(String(approval?.response || approval?.error || 'Agent approval failed'));
  onProgress?.('Waiting for Hyperliquid to confirm…');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const agents = await info.extraAgents({ user: owner }).catch(() => []);
    if (Array.isArray(agents) && agents.some((row) => String(row?.address || '').toLowerCase() === address)) {
      return { privateKey, address, validUntil };
    }
    await sleep(1500);
  }
  throw new Error('Hyperliquid has not confirmed the ClashBot API wallet yet. Try again in a moment.');
}

async function readBulkAgent(owner) {
  const record = validateBulkAgent(await readEncryptedCredential(bulkAgentKey(owner, 'mainnet')), owner, 'mainnet');
  if (!record?.secretKey || record.enabled !== true) throw new Error(GAME_COPY_DESTINATIONS.bulk.setup);
  const seed = bs58.decode(record.secretKey);
  const hex = Array.from(seed, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    schema: 'bulk.agent.v1', owner, agentPublicKey: record.publicKey, privateKey: `0x${hex}`,
    onboardingProvenance: 'wallet-signed-agent-wallet-v1',
  };
}

/**
 * Produce the trade-only credential for `venue`/`owner`. May open wallet
 * prompts (Hyperliquid). Throws a player-facing message when the game has no
 * usable connection yet.
 */
export async function obtainTradeOnlyCredential({ venue, owner, walletCtx, onProgress }) {
  switch (venue) {
    case 'hyperliquid':
      return authorizeHyperliquid(String(owner).toLowerCase(), walletCtx, onProgress);
    case 'nado': {
      const signer = readNadoLinkedSigner(owner);
      if (!signer?.privateKey) throw new Error(GAME_COPY_DESTINATIONS.nado.setup);
      return { privateKey: signer.privateKey, signerAddress: signer.address, subaccountName: 'default' };
    }
    case 'risex': {
      const signer = readRisexSigner(owner);
      if (!signer?.privateKey) throw new Error(GAME_COPY_DESTINATIONS.risex.setup);
      return { privateKey: signer.privateKey, expiresAt: Number(signer.expiresAt), builderFeeMaxHundredthBps: 100 };
    }
    case 'bulk':
      return readBulkAgent(owner);
    default:
      throw new Error('This exchange is not available for in-game copy bots yet.');
  }
}
