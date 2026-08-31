/**
 * Shared Hyperliquid one-tap agent setup (Futures + Bots).
 */
import {
  HYPERLIQUID_ARBITRUM_CHAIN_ID,
  createHyperliquidExchangeClient,
  createHyperliquidInfoClient,
  createHyperliquidWalletAdapter,
  getOrCreateHyperliquidAgent,
  hyperliquidAgentName,
  isHyperliquidAgentApproved,
  readHyperliquidAgentAsync,
  rememberHyperliquidAgent,
} from './hyperliquidClient.js';
import { assertCredentialScope, captureCredentialScope } from './encryptedCredentialStorage.js';

const AGENT_APPROVAL_TIMEOUT_MS = 90_000;
const AGENT_APPROVAL_POLL_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAgentApproval(walletAddr, agent, assertCurrent) {
  const deadline = Date.now() + AGENT_APPROVAL_TIMEOUT_MS;
  let last = [];
  while (Date.now() <= deadline) {
    assertCurrent();
    const info = createHyperliquidInfoClient();
    last = await info.extraAgents({ user: walletAddr }).catch(() => []);
    assertCurrent();
    const approved = isHyperliquidAgentApproved(agent, last);
    if (approved) return { ok: true, approved, agents: last };
    await sleep(AGENT_APPROVAL_POLL_MS);
  }
  return { ok: false, agents: last };
}

/**
 * Ensure HL browser agent exists and is approved on-chain (wallet popup if needed).
 */
export async function ensureHyperliquidAgentApproved({
  walletAddress,
  evmProvider,
  walletClient,
  ensureChain,
  scope: suppliedScope,
  assertCurrent: assertCallerCurrent,
} = {}) {
  const walletAddr = String(walletAddress || '').toLowerCase();
  if (!walletAddr) throw new Error('Connect your EVM wallet first');
  const scope = suppliedScope || captureCredentialScope();
  const assertCurrent = () => { assertCredentialScope(scope); assertCallerCurrent?.(); };
  assertCurrent();
  const cached = await readHyperliquidAgentAsync(walletAddr, { scope });
  assertCurrent();
  const agent = cached || getOrCreateHyperliquidAgent(walletAddr, { scope });

  const info = createHyperliquidInfoClient();
  const agents = await info.extraAgents({ user: walletAddr }).catch(() => []);
  assertCurrent();
  const approved = isHyperliquidAgentApproved(agent, agents);
  if (approved) {
    rememberHyperliquidAgent(walletAddr, agent, approved.validUntil, { scope });
    return { ok: true, wallet: walletAddr };
  }

  if (!evmProvider && !walletClient) {
    throw new Error('Connect EVM wallet — Setup & Sync will prompt for Hyperliquid agent approval.');
  }
  if (typeof ensureChain === 'function') {
    await ensureChain(HYPERLIQUID_ARBITRUM_CHAIN_ID);
    assertCurrent();
  }

  const wallet = createHyperliquidWalletAdapter({
    address: walletAddr,
    provider: evmProvider,
    walletClient,
  });
  const exchange = createHyperliquidExchangeClient(wallet);
  const result = await exchange.approveAgent({
    agentAddress: agent.address,
    agentName: hyperliquidAgentName(agent.validUntil),
  });
  assertCurrent();
  if (result?.error) throw new Error(String(result.error));

  const verified = await waitForAgentApproval(walletAddr, agent, assertCurrent);
  assertCurrent();
  if (!verified.ok) {
    throw new Error('Hyperliquid agent was signed but is not visible yet. Wait a few seconds and retry.');
  }
  rememberHyperliquidAgent(walletAddr, agent, verified.approved.validUntil, { scope });
  return { ok: true, wallet: walletAddr };
}
