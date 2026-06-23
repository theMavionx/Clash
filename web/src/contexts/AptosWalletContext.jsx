// Aptos wallet context — official @aptos-labs/wallet-adapter-react.
//
// Aptos Labs deprecated direct `window.aptos` / `window.petra` access in
// favor of the AIP-62 Wallet Standard. The official adapter handles AIP-62
// discovery, namespace strings, address formatting, account/network
// listeners and reconnection — none of which we should reinvent. The
// AptosWalletAdapterProvider lives in App.jsx; this file is a thin shim
// that exposes the same interface useDecibel was already calling
// (`address`, `connect()`, `disconnect()`, `loginSignAndSubmit(payload)`).

import { createContext, useContext, useCallback, useMemo } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { AccountAddress } from '@aptos-labs/ts-sdk';
import { APTOS_CHAIN_ID } from '../lib/decibel';

const AptosWalletContext = createContext(null);

const PETRA_INSTALL_URL = 'https://petra.app/';

function bytesToHex(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  return `0x${Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')}`;
}

function aptosKeyToHex(value) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    return text ? (text.startsWith('0x') ? text : `0x${text}`) : null;
  }
  if (raw instanceof Uint8Array || Array.isArray(raw)) return bytesToHex(raw);
  if (typeof raw.toUint8Array === 'function') return bytesToHex(raw.toUint8Array());
  if (typeof raw.bcsToBytes === 'function') return bytesToHex(raw.bcsToBytes());
  if (typeof raw.toString === 'function') {
    const text = raw.toString().trim();
    return text && text !== '[object Object]' ? (text.startsWith('0x') ? text : `0x${text}`) : null;
  }
  return null;
}

export function AptosWalletProvider({ children }) {
  // Single source of truth from the official adapter. `account` and
  // `wallet` are typed instances — `account.address` is an
  // AccountAddress class with `.toString()` / `.toStringLong()` helpers.
  const adapter = useWallet();
  const {
    account, connected, wallet, wallets, network,
    connect: adapterConnect,
    disconnect: adapterDisconnect,
    signMessage,
    signAndSubmitTransaction,
  } = adapter;

  // Use the LONG (zero-padded 0x + 64-hex) form so address strings are
  // canonical across the app — `String(account.address)` returns the SHORT
  // form (leading zeros stripped), which would silently desync dedup keys
  // and equality checks in useDecibel.js (e.g. matching the builder fee
  // approval entry against `BUILDER_ADDR.toLowerCase()`).
  const address = account?.address
    ? (account.address.toStringLong?.() ?? String(account.address))
    : null;
  const publicKey = aptosKeyToHex(account?.publicKey);
  const chainId = network?.chainId != null ? Number(network.chainId) : null;
  const hasProvider = Array.isArray(wallets) && wallets.length > 0;

  // Tries to connect to Petra by default. Falls through to "first
  // detected wallet" if Petra is missing — useful for users who installed
  // Pontem / Martian instead. If nothing is installed, opens the Petra
  // download page so the user can come back and try again.
  const connect = useCallback(async () => {
    const target =
      wallets?.find(w => /petra/i.test(w.name)) ||
      wallets?.[0] ||
      null;
    if (!target) {
      window.open(PETRA_INSTALL_URL, '_blank', 'noopener,noreferrer');
      return null;
    }
    try {
      await adapterConnect(target.name);
      return null;
    } catch (e) {
      console.warn('[aptos] connect failed:', e?.message || e);
      throw e;
    }
  }, [wallets, adapterConnect]);

  const disconnect = useCallback(async () => {
    try { await adapterDisconnect(); } catch { /* idempotent */ }
  }, [adapterDisconnect]);

  // Sign-and-submit for the LOGIN wallet (Petra). Used for one-time
  // setup txs (createSubaccount, delegateTrading, approveBuilderFee) and
  // for deposits/withdrawals. Trade-time signing bypasses this and goes
  // through the local api wallet's Ed25519 keypair.
  //
  // The official adapter's `signAndSubmitTransaction` takes
  // `InputTransactionData` directly:
  //   { sender, data: {function, typeArguments, functionArguments} }
  // Our useDecibel callers already pass a `data:` payload; we add `sender`
  // here automatically so they don't have to thread the address through.
  const loginSignAndSubmit = useCallback(async (payload) => {
    if (!address) throw new Error('Connect Petra wallet first');
    const tx = (payload && payload.data)
      ? { sender: address, ...payload }
      : payload;
    return signAndSubmitTransaction(tx);
  }, [address, signAndSubmitTransaction]);

  const loginSignMessage = useCallback(async (payload) => {
    if (!address) throw new Error('Connect Petra wallet first');
    if (typeof signMessage !== 'function') throw new Error('Aptos wallet cannot sign messages');
    return signMessage(payload);
  }, [address, signMessage]);

  const getLoginAccountAddress = useCallback(() => {
    if (!address) return null;
    try { return AccountAddress.fromString(address); }
    catch { return null; }
  }, [address]);

  const value = useMemo(() => ({
    address,
    publicKey,
    chainId,
    isConnected: connected,
    isOnMainnet: chainId === APTOS_CHAIN_ID,
    // The adapter manages its own connecting state internally; surface
    // false here so the UI doesn't gate on a value we can't read. The
    // popup itself is the user's "connecting" indicator.
    isConnecting: false,
    hasProvider,
    error: null,
    clearError: () => {},
    connect,
    disconnect,
    signMessage: loginSignMessage,
    loginSignAndSubmit,
    getLoginAccountAddress,
    walletName: wallet?.name || null,
  }), [address, publicKey, chainId, connected, hasProvider, connect, disconnect, loginSignMessage, loginSignAndSubmit, getLoginAccountAddress, wallet?.name]);

  return (
    <AptosWalletContext.Provider value={value}>
      {children}
    </AptosWalletContext.Provider>
  );
}

export function useAptosWallet() {
  const ctx = useContext(AptosWalletContext);
  if (!ctx) throw new Error('useAptosWallet must be used within AptosWalletProvider');
  return ctx;
}
