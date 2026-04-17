import { useEffect, useState } from 'react';
import { colors, cartoonPanel, cartoonBtn } from '../styles/theme';

const BASE_CHAIN_ID_HEX = '0x2105'; // 8453

// EIP-6963 provider discovery. Modern wallets (MetaMask, Rabby, Coinbase,
// Phantom EVM, Trust, OKX) announce themselves via the `eip6963:announceProvider`
// event. We listen, collect them, then render one button per provider.
//
// Fallback: if a page has only legacy `window.ethereum` (single provider or
// the MetaMask "providers" array), we surface those too.
function useInjectedProviders() {
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    const found = new Map(); // uuid → detail
    const onAnnounce = (e) => {
      const d = e?.detail;
      if (!d || !d.provider) return;
      found.set(d.info?.uuid || d.info?.rdns || Math.random().toString(), d);
      setProviders(Array.from(found.values()));
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Legacy fallback after a tick: if no 6963 entries, use window.ethereum
    const fallbackTimer = setTimeout(() => {
      if (found.size === 0 && typeof window !== 'undefined' && window.ethereum) {
        const eth = window.ethereum;
        const legacy = Array.isArray(eth.providers) ? eth.providers : [eth];
        legacy.forEach((p, i) => {
          const name = p.isMetaMask ? 'MetaMask'
            : p.isCoinbaseWallet ? 'Coinbase Wallet'
            : p.isRabby ? 'Rabby'
            : p.isPhantom ? 'Phantom'
            : p.isTrust ? 'Trust'
            : p.isOkxWallet ? 'OKX Wallet'
            : 'Injected Wallet';
          found.set(`legacy-${i}-${name}`, {
            info: { name, icon: null, rdns: `legacy.${name.toLowerCase().replace(/\s/g, '')}` },
            provider: p,
          });
        });
        setProviders(Array.from(found.values()));
      }
    }, 300);

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      clearTimeout(fallbackTimer);
    };
  }, []);

  return providers;
}

async function ensureBaseChain(provider) {
  try {
    const current = await provider.request({ method: 'eth_chainId' });
    if (String(current).toLowerCase() === BASE_CHAIN_ID_HEX) return;
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  } catch (err) {
    // Chain not added — try adding it (error 4902).
    if (err?.code === 4902 || /unrecognized|not been added/i.test(err?.message || '')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: BASE_CHAIN_ID_HEX,
          chainName: 'Base',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://mainnet.base.org'],
          blockExplorerUrls: ['https://basescan.org'],
        }],
      });
      return;
    }
    throw err;
  }
}

// Custom EVM wallet-connect modal (Base). Shows all injected wallets detected
// via EIP-6963 + legacy `window.ethereum` fallback. On select: requests
// accounts, switches to Base chain, fires onConnected({ address, provider }).
export default function EvmWalletModal({ open, onClose, onConnected }) {
  const providers = useInjectedProviders();
  const [connecting, setConnecting] = useState(null); // rdns of connecting provider
  const [error, setError] = useState(null);

  useEffect(() => { if (!open) { setError(null); setConnecting(null); } }, [open]);

  if (!open) return null;

  const handleConnect = async (detail) => {
    setError(null);
    setConnecting(detail.info?.rdns || detail.info?.name);
    try {
      const accounts = await detail.provider.request({ method: 'eth_requestAccounts' });
      const addr = accounts && accounts[0];
      if (!addr) throw new Error('No account returned');
      await ensureBaseChain(detail.provider);
      onConnected({ address: addr, provider: detail.provider, walletName: detail.info?.name });
    } catch (err) {
      console.error('[evm-modal] connect failed:', err);
      const msg = err?.message || String(err);
      if (/user rejected|denied/i.test(msg)) setError('Connection cancelled');
      else setError(msg.slice(0, 120));
      setConnecting(null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 40,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'all',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...cartoonPanel,
          width: 340, padding: 24,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <h3 style={{margin: 0, fontSize: 18, fontWeight: 900, color: colors.gold, textShadow: '0 2px 0 rgba(0,0,0,0.4)'}}>
            CONNECT WALLET
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: '#a3906a',
              fontSize: 22, fontWeight: 900, cursor: 'pointer', lineHeight: 1, padding: 0,
            }}
          >×</button>
        </div>
        <div style={{fontSize: 12, fontWeight: 700, color: '#a3906a', marginTop: -6}}>
          Base (EVM) network · required for Avantis perps
        </div>

        {providers.length === 0 ? (
          <div style={{
            padding: '16px 12px', borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '2px dashed #6D4C2A',
            color: '#ccc', fontSize: 13, textAlign: 'center', lineHeight: 1.5,
          }}>
            No EVM wallets detected in this browser.<br />
            Install <b>MetaMask</b>, <b>Rabby</b>, or <b>Coinbase Wallet</b> and refresh.
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            {providers.map((p) => {
              const rdns = p.info?.rdns || p.info?.name;
              const isConnecting = connecting === rdns;
              return (
                <button
                  key={rdns}
                  onClick={() => handleConnect(p)}
                  disabled={!!connecting}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 12,
                    border: '2px solid #6D4C2A',
                    background: isConnecting
                      ? 'rgba(232,184,48,0.15)'
                      : 'linear-gradient(180deg, #3E2723 0%, #2C1B0E 100%)',
                    color: '#fff', fontSize: 15, fontWeight: 800,
                    cursor: connecting ? 'wait' : 'pointer',
                    opacity: connecting && !isConnecting ? 0.5 : 1,
                    textAlign: 'left', outline: 'none',
                    transition: 'background 0.15s',
                  }}
                >
                  {p.info?.icon ? (
                    <img src={p.info.icon} alt={p.info.name} style={{width: 28, height: 28, borderRadius: 6}} />
                  ) : (
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: 'linear-gradient(135deg, #e8b830 0%, #b8860b 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 900, color: '#2C1B0E',
                    }}>{(p.info?.name || '?').charAt(0)}</div>
                  )}
                  <span style={{flex: 1}}>{p.info?.name || 'Wallet'}</span>
                  {isConnecting && (
                    <span style={{fontSize: 11, fontWeight: 700, color: '#e8b830'}}>connecting…</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(229,57,53,0.15)',
            border: '1.5px solid #E53935',
            color: '#ff9d9b', fontSize: 12, fontWeight: 700,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={onClose}
          style={{...cartoonBtn('#6D4C2A', '#5D4037'), width: '100%', textAlign: 'center', fontSize: 14, padding: '10px 18px'}}
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}
