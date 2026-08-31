/**
 * Shared Hotstuff trading agent registration (Futures + Bots).
 */
import { createHotstuffExchangeClient, createHotstuffInfoClient } from './hotstuffClient';
import { ensureHotstuffChain } from './hotstuffConfig';
import { captureCredentialScope, assertCredentialScope } from './encryptedCredentialStorage';
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
  credentialScope,
  playerToken,
} = {}) {
  const scope = credentialScope || captureCredentialScope();
  const assertCurrent = () => assertCredentialScope(scope, { token: playerToken });
  assertCurrent();
  const hsWalletAddr = String(walletAddress || '').trim();
  if (!hsWalletAddr) throw new Error('Connect your Hotstuff EVM wallet first');
  if (!walletClient) throw new Error('Connect EVM wallet — Setup & Sync will register the Hotstuff agent.');

  if (typeof switchChain === 'function') {
    await ensureHotstuffChain(switchChain);
  }

  assertCurrent();
  let agent = await loadHotstuffStoredAgent(hsWalletAddr);
  assertCurrent();
  agent ||= await newHotstuffStoredAgent(hsWalletAddr, { scope });
  assertCurrent();
  if (!agent) throw new Error('Could not create Hotstuff browser trading agent');

  const info = createHotstuffInfoClient();
  const agents = await info.allAgents({ user: hsWalletAddr }).catch(() => []);
  assertCurrent();
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
  assertCurrent();
  agent = await saveHotstuffStoredAgent(hsWalletAddr, agent.privateKey, validUntil, { scope }) || agent;
  assertCurrent();
  return { ok: true, wallet: hsWalletAddr, agent };
}
