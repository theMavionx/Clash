import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { BaseWalletAdapter, WalletReadyState } from '@solana/wallet-adapter-base';
import { t } from './strings';

// Wallet Standard is preferred by WalletProvider. These adapters only bridge older
// injected providers; neither signs nor connects until a user explicitly chooses it.
class InjectedWalletAdapter extends BaseWalletAdapter {
  constructor(name, resolve, url) {
    super(); this.name = name; this.resolve = resolve; this.url = url;
    this.icon = ''; this.connecting = false; this.publicKey = null;
    this.supportedTransactionVersions = new Set(['legacy']);
  }
  get readyState() { return this.resolve() ? WalletReadyState.Installed : WalletReadyState.NotDetected; }
  async connect() {
    if (this.connected) return;
    const provider = this.resolve();
    if (!provider?.signMessage || !provider?.signTransaction) throw new Error(t('walletUnsupported'));
    this.connecting = true;
    this.detach();
    this.provider = provider;
    this.accountChanged = key => {
      this.publicKey = key || null;
      if (key) this.emit('connect', key); else { this.detach(); this.emit('disconnect'); }
    };
    this.disconnected = () => { this.detach(); this.publicKey = null; this.emit('disconnect'); };
    provider.on?.('accountChanged', this.accountChanged);
    provider.on?.('disconnect', this.disconnected);
    try {
      await provider.connect(); this.publicKey = provider.publicKey;
      if (!this.publicKey) throw new Error(t('verifyFailed'));
      this.emit('connect', this.publicKey);
    } catch (error) { this.detach(); throw error; }
    finally { this.connecting = false; }
  }
  detach() {
    this.provider?.removeListener?.('accountChanged', this.accountChanged);
    this.provider?.removeListener?.('disconnect', this.disconnected);
  }
  async disconnect() {
    this.detach(); this.publicKey = null; this.emit('disconnect');
    await this.provider?.disconnect?.();
  }
  async signMessage(message) {
    const result = await this.provider.signMessage(message, 'utf8');
    return result.signature || result;
  }
  async signTransaction(transaction) { return this.provider.signTransaction(transaction); }
  async sendTransaction() { throw new Error('Migration only supports signing server-prepared transactions'); }
}

export function MigrationWalletProvider({ children }) {
  const adapters = useMemo(() => [
    new InjectedWalletAdapter('Phantom', () => window.phantom?.solana, 'https://phantom.com/'),
    new InjectedWalletAdapter('Solflare', () => window.solflare, 'https://solflare.com/'),
  ], []);
  // ConnectionProvider is only adapter context. Deposits remain server-submitted;
  // no public RPC, third-party API key, or automatic wallet authorization is used.
  return <ConnectionProvider endpoint={new URL('/rpc/solana-alchemy', window.location.origin).href}>
    <WalletProvider wallets={adapters} autoConnect={false} localStorageKey="migration-wallet-name" onError={() => {}}>{children}</WalletProvider>
  </ConnectionProvider>;
}

export function MigrationWalletPicker({ open, onClose, onChoose, returnFocusRef }) {
  const { wallets, select } = useWallet();
  const dialog = useRef(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current, trigger = document.activeElement, fallbackTrigger = returnFocusRef?.current;
    element.showModal();
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Detect late injection by older wallet browsers while the chooser is open.
    const interval = setInterval(() => setTick(value => value + 1), 1000);
    return () => { clearInterval(interval); element.close(); document.body.style.overflow = original; (trigger?.isConnected ? trigger : fallbackTrigger)?.focus(); };
  }, [open, returnFocusRef]);
  const available = wallets.filter(({ adapter }) => [WalletReadyState.Installed, WalletReadyState.Loadable].includes(adapter.readyState));
  const choose = adapter => { select(adapter.name); onClose(); onChoose(adapter); };
  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')].filter(element => element.getClientRects().length);
    if (!controls.length) { event.preventDefault(); dialog.current.focus(); return; }
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }
  return <dialog ref={dialog} className="migration-wallet-dialog" aria-labelledby="migration-wallet-title" aria-describedby="migration-wallet-description" onCancel={onClose} onKeyDown={trapFocus} onClick={event => { if (event.target === dialog.current) { const box = dialog.current.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }} data-detection-tick={tick}>
    <div className="migration-wallet-modal-heading"><span className="migration-wallet-symbol" aria-hidden="true"><img src="/tokens/SOL.svg" alt=""/></span><button type="button" autoFocus className="migration-wallet-close" aria-label={t('closeWalletPicker')} onClick={onClose}>×</button></div>
    <h2 id="migration-wallet-title">{t('walletPickerTitle')}</h2>
    <p id="migration-wallet-description">{t('walletPickerDescription')}</p>
    {available.length ? <div className="migration-wallet-list">{available.map(({ adapter }) => <button type="button" key={adapter.name} onClick={() => choose(adapter)}><span className="migration-wallet-option-icon">{adapter.icon ? <img src={adapter.icon} alt=""/> : <span aria-hidden="true">{adapter.name.slice(0, 1)}</span>}</span><span>{adapter.name}</span><small>{adapter.readyState === WalletReadyState.Installed ? t('walletDetected') : t('walletMobile')}</small><span aria-hidden="true">›</span></button>)}</div> : <p className="migration-wallet-empty">{t('walletEmpty')}</p>}
    <div className="migration-wallet-install"><span>{t('walletInstall')}</span><a href="https://phantom.com/" target="_blank" rel="noopener noreferrer">Phantom ↗</a><a href="https://solflare.com/" target="_blank" rel="noopener noreferrer">Solflare ↗</a></div>
    <p className="migration-wallet-safety">{t('walletSafety')}</p>
  </dialog>;
}
