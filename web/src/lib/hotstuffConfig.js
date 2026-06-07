import { mainnet } from 'viem/chains';

export const HOTSTUFF_API_BASE = String(import.meta.env.VITE_HOTSTUFF_API_URL || 'https://api.hotstuff.trade').replace(/\/+$/u, '');
export const HOTSTUFF_FUTURES_API = String(import.meta.env.VITE_HOTSTUFF_FUTURES_API || '/api/futures/hotstuff');
export const HOTSTUFF_CHAIN_ID = mainnet.id;
export const HOTSTUFF_CHAIN = mainnet;
export const HOTSTUFF_BROKER_ADDRESS = String(import.meta.env.VITE_HOTSTUFF_BROKER_ADDRESS || '0xB36402e87a86206D3a114a98B53f31362291fe1B').trim();
export const HOTSTUFF_BROKER_FEE_RATE = String(import.meta.env.VITE_HOTSTUFF_BROKER_FEE_RATE || '0.0001').trim();
export const HOTSTUFF_REFERRAL_CODE = String(import.meta.env.VITE_HOTSTUFF_REFERRAL_CODE || 'clashofperps').trim();
export const HOTSTUFF_REFERRAL_URL = String(
  import.meta.env.VITE_HOTSTUFF_REFERRAL_URL || `https://app.hotstuff.trade/join/${HOTSTUFF_REFERRAL_CODE || 'clashofperps'}`
).trim();
export const HOTSTUFF_CLOID_PREFIX = 'clash-hs-';
export const HOTSTUFF_USDC_COLLATERAL_ID = Number(import.meta.env.VITE_HOTSTUFF_USDC_COLLATERAL_ID || 1);
export const HOTSTUFF_USDC_DECIMALS = Number(import.meta.env.VITE_HOTSTUFF_USDC_DECIMALS || 6);
export const HOTSTUFF_BRIDGE_CHAIN_ID = Number(import.meta.env.VITE_HOTSTUFF_BRIDGE_CHAIN_ID || mainnet.id);
export const HOTSTUFF_USDC_ADDRESS = String(
  import.meta.env.VITE_HOTSTUFF_USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
).trim();
export const HOTSTUFF_BRIDGE_ADDRESS = String(
  import.meta.env.VITE_HOTSTUFF_BRIDGE_ADDRESS || '0xF15E150a8d4685B6466B2d07b644635cCFcA8b11'
).trim();

export async function ensureHotstuffChain(switchChain) {
  if (typeof switchChain === 'function') {
    await switchChain(HOTSTUFF_CHAIN_ID);
  }
  return HOTSTUFF_CHAIN_ID;
}
