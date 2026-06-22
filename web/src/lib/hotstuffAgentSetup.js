/**
 * Shared Hotstuff trading agent registration (Futures + Bots).
 */
import { createHotstuffExchangeClient, createHotstuffInfoClient } from './hotstuffClient';
import { ensureHotstuffChain } from './hotstuffConfig';
import {
  hotstuffAgentStillValid,
  loadHotstuffStoredAgent,
  newHotstuffStoredAgent,
  saveHotstuffStoredAgent,
} from './hotstuffAgentStorage';

/**
 * Ensure browser agent is registered on Hotstuff (wallet signs addAgent if needed).
 */
export async function ensureHotstuffTradingAgent({
  walletAddress,
  walletClient,
  switchChain,
} = {}) {
  const hsWalletAddr = String(walletAddress || '').trim();
  if (!hsWalletAddr) throw new Error('Connect your Hotstuff EVM wallet first');
  if (!walletClient) throw new Error('Connect EVM wallet — Setup & Sync will register the Hotstuff agent.');

  if (typeof switchChain === 'function') {
    await ensureHotstuffChain(switchChain);
  }

  let agent = await loadHotstuffStoredAgent(hsWalletAddr) || await newHotstuffStoredAgent(hsWalletAddr);
  if (!agent) throw new Error('Could not create Hotstuff browser trading agent');

  const info = createHotstuffInfoClient();
  const agents = await info.allAgents({ user: hsWalletAddr }).catch(() => []);
  const registered = Array.isArray(agents) && agents.some((row) => (
    String(row?.agent_address || row?.agent || '').toLowerCase() === agent.address.toLowerCase()
    && hotstuffAgentStillValid(row)
  ));
  if (registered) return { ok: true, wallet: hsWalletAddr, agent };

  const validUntil = Date.now() + 24 * 60 * 60 * 1000;
  const exchange = createHotstuffExchangeClient(walletClient);
  await exchange.addAgent({
    agentName: 'clashofperps',
    agent: agent.address,
    forAccount: '',
    signer: hsWalletAddr,
    agentPrivateKey: agent.privateKey,
    validUntil,
    nonce: Date.now(),
  });
  agent = await saveHotstuffStoredAgent(hsWalletAddr, agent.privateKey, validUntil) || agent;
  return { ok: true, wallet: hsWalletAddr, agent };
}
