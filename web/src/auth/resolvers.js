// Resolver hooks — each reads one wallet source and returns either
//   { wallet, chain, source, email? } when ready, or null when not yet.
// `useAuthFlow` aggregates these in priority order. Resolvers MUST be pure:
// no side-effects, no registration calls; just map upstream state.

import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivy, useWallets as usePrivyEvmWallets } from '@privy-io/react-auth';
import { useWallets as usePrivySolanaWallets } from '@privy-io/react-auth/solana';
import { useEvmWallet } from '../contexts/EvmWalletContext';

// ── Solana ────────────────────────────────────────────────────────

// Any Solana adapter that finished connecting — includes both the
// Farcaster mini-app-solana wallet (auto-registered as Wallet Standard
// inside a frame) and any user-selected extension (Phantom, Solflare).
// We don't try to distinguish them here — for registration we only need
// the address + chain. Source is reported as 'farcaster' when inside the
// frame to help analytics/server-side bookkeeping, otherwise 'external'.
export function useSolanaAdapterResolver(isInFrame) {
  const { connected, publicKey, wallet } = useWallet();
  if (!connected || !publicKey) return null;
  const adapterName = wallet?.adapter?.name || '';
  const source = adapterName.toLowerCase().includes('farcaster') || isInFrame
    ? 'farcaster'
    : 'external';
  return {
    wallet: publicKey.toBase58(),
    chain: 'solana',
    source,
  };
}

// Privy embedded Solana wallet — auto-created on email login when the
// provider is configured with `embeddedWallets.solana.createOnLogin`.
// Returns null until Privy is authenticated AND the embedded wallet
// materialises in `usePrivySolanaWallets()`.
export function usePrivySolanaResolver() {
  const { authenticated, user } = usePrivy();
  const { wallets } = usePrivySolanaWallets();
  if (!authenticated) return null;
  const pool = wallets || [];
  const picked = pool.find(w => w && w.walletClientType === 'privy') || pool[0];
  if (!picked?.address) return null;
  return {
    wallet: picked.address,
    chain: 'solana',
    source: 'privy',
    email: user?.email?.address || null,
  };
}

// ── EVM / Base ────────────────────────────────────────────────────

// EvmWalletContext is the unified view of any EVM provider the app holds:
//   • external (user-connected via EvmWalletModal, or silent-reconnected
//     via EIP-6963 + eth_accounts on page load)
//   • privy embedded Ethereum (auto-created on email login)
//   • farcaster host provider (sdk.wallet.getEthereumProvider, pushed in
//     by useAuthFlow when it resolves the FC EVM candidate)
// Source is carried on the context so we can attribute registration.
export function useEvmContextResolver() {
  const { address, source } = useEvmWallet();
  if (!address) return null;
  return {
    wallet: address,
    chain: 'base',
    source: source || 'external',
  };
}

// Privy embedded EVM — read directly from usePrivyEvmWallets so we can
// detect it BEFORE EvmWalletContext has resolved the provider (which
// requires an async getEthereumProvider call). Used to drive the auth
// flow's UI to a "signing you in" state as soon as we know the user is
// authenticated with Privy on the Avantis path.
export function usePrivyEvmCandidate() {
  const { authenticated, user } = usePrivy();
  const { wallets } = usePrivyEvmWallets();
  if (!authenticated) return null;
  const pool = wallets || [];
  const picked = pool.find(w => w && w.walletClientType === 'privy') || pool[0];
  if (!picked?.address) return null;
  return {
    wallet: picked.address,
    chain: 'base',
    source: 'privy',
    email: user?.email?.address || null,
  };
}
