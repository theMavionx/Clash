import { useEffect, useState } from 'react';

// Styled to match RegisterPanel + BuildingInfoPanel — parchment body, blue
// header, yellow CTA. The previous dark cartoonPanel look stood out against
// the rest of the game UI.

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
      onConnected({
        address: addr,
        provider: detail.provider,
        walletName: detail.info?.name,
        rdns: detail.info?.rdns || detail.info?.name,
      });
    } catch (err) {
      console.error('[evm-modal] connect failed:', err);
      const msg = err?.message || String(err);
      if (/user rejected|denied/i.test(msg)) setError('Connection cancelled');
      else setError(msg.slice(0, 120));
      setConnecting(null);
    }
  };

  return (
    <div onClick={onClose} style={M.overlay}>
      <div onClick={e => e.stopPropagation()} style={M.panel}>
        <div style={M.header}>
          <span style={M.headerTitle}>CONNECT WALLET</span>
          <button onClick={onClose} style={M.closeBtn} aria-label="Close">✖</button>
        </div>
        <div style={M.body}>
          <div style={M.subtitle}>
            Base (EVM) network · required for Avantis perps
          </div>

          {providers.length === 0 ? (
            <div style={M.empty}>
              No EVM wallets detected in this browser.<br />
              Install <b>MetaMask</b>, <b>Rabby</b>, or <b>Coinbase Wallet</b> and refresh.
            </div>
          ) : (
            <div style={M.list}>
              {providers.map((p) => {
                const rdns = p.info?.rdns || p.info?.name;
                const isConnecting = connecting === rdns;
                return (
                  <button
                    key={rdns}
                    onClick={() => handleConnect(p)}
                    disabled={!!connecting}
                    style={{
                      ...M.providerBtn,
                      ...(isConnecting ? M.providerBtnActive : null),
                      cursor: connecting ? 'wait' : 'pointer',
                      opacity: connecting && !isConnecting ? 0.5 : 1,
                    }}
                  >
                    {p.info?.icon ? (
                      <img src={p.info.icon} alt={p.info.name} style={M.providerIcon} />
                    ) : (
                      <div style={M.providerFallbackIcon}>
                        {(p.info?.name || '?').charAt(0)}
                      </div>
                    )}
                    <span style={M.providerName}>{p.info?.name || 'Wallet'}</span>
                    {isConnecting && <span style={M.connectingLabel}>connecting…</span>}
                  </button>
                );
              })}
            </div>
          )}

          {error && <div style={M.error}>{error}</div>}

          <button onClick={onClose} style={M.cancelBtn}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

const M = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 40,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'all',
  },
  panel: {
    width: 380, maxWidth: '94vw',
    background: '#ebdaba',
    border: '4px solid #377d9f',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 0 0 4px #ebdaba',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    height: 54, background: '#4ca5d2',
    borderBottom: '4px solid #377d9f',
  },
  headerTitle: {
    fontSize: 22, fontStyle: 'italic', fontWeight: 900, color: '#fff',
    textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.6)',
    letterSpacing: 1,
  },
  closeBtn: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    width: 32, height: 32, background: 'rgba(0,0,0,0.15)', border: 'none', borderRadius: 4,
    color: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    fontSize: 14, fontWeight: 700,
  },
  body: {
    padding: '16px 20px 20px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  subtitle: {
    fontSize: 12, fontWeight: 700, color: '#5d6d75',
    textAlign: 'center', letterSpacing: 0.3,
  },
  empty: {
    padding: '18px 14px', borderRadius: 12,
    background: 'rgba(26, 60, 79, 0.05)',
    border: '2px dashed #377d9f',
    color: '#5d6d75', fontSize: 13, textAlign: 'center', lineHeight: 1.5,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  providerBtn: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', borderRadius: 12,
    border: '2px solid #377d9f',
    background: '#fff',
    color: '#1a3c4f', fontSize: 15, fontWeight: 800,
    textAlign: 'left', outline: 'none',
    transition: 'background 0.15s, transform 0.1s',
    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.1)',
    fontFamily: 'inherit',
  },
  providerBtnActive: {
    background: 'rgba(251,192,45,0.25)',
    borderColor: '#F57F17',
  },
  providerIcon: {
    width: 28, height: 28, borderRadius: 6,
  },
  providerFallbackIcon: {
    width: 28, height: 28, borderRadius: 6,
    background: 'linear-gradient(135deg, #FBC02D 0%, #F57F17 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 900, color: '#fff',
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
  },
  providerName: { flex: 1 },
  connectingLabel: {
    fontSize: 11, fontWeight: 700, color: '#F57F17',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  error: {
    padding: '10px 12px', borderRadius: 10,
    background: 'rgba(229,57,53,0.12)',
    border: '1.5px solid #E53935',
    color: '#c62828', fontSize: 12, fontWeight: 700,
  },
  cancelBtn: {
    width: '100%',
    padding: '11px 18px', borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(180deg, #90a4ae 0%, #546e7a 100%)',
    boxShadow: '0 4px 10px rgba(0,0,0,0.2), inset 0 2px 0 rgba(255,255,255,0.3)',
    color: '#fff',
    fontSize: 13, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
