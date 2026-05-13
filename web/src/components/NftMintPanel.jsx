import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import EvmWalletModal from './EvmWalletModal';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useFarcaster } from '../hooks/useFarcaster';
import { BASE_CHAIN_ID } from '../lib/avantisContract';
import { fetchNftMintConfig, mintBaseNft } from '../lib/nftMint';
import { openSolanaWallet } from '../lib/solanaWalletUi';
import { addClientBreadcrumb } from '../lib/clientLogger';

const demonKingImg = '/api/nft/image';

const CHAIN_OPTIONS = [
  { id: 'base', title: 'Base', subtitle: 'ETH / USDC', badge: 'EVM' },
  { id: 'solana', title: 'Solana', subtitle: 'SOL / USDC', badge: 'SOL' },
];

const PAYMENT_OPTIONS = {
  base: [
    { id: 'base-eth', chain: 'base', method: 'ETH', price: '$8.90', token: 'ETH' },
    { id: 'base-usdc', chain: 'base', method: 'USDC', price: '$8.90', token: 'USDC' },
    { id: 'base-clash', chain: 'base', method: 'CLASH', price: '$5.00', token: 'CLASH', requiresClash: true },
  ],
  solana: [
    { id: 'sol-usdc', chain: 'solana', method: 'USDC', price: '$8.90', token: 'USDC' },
    { id: 'sol-sol', chain: 'solana', method: 'SOL', price: '$8.90', token: 'SOL' },
  ],
};

const DEX_LABELS = {
  decibel: 'Decibel / Aptos',
  gmx: 'GMX / Arbitrum',
  avantis: 'Avantis / Base',
  pacifica: 'Pacifica / Solana',
  phoenix: 'Phoenix / Solana',
  monad: 'Perpl / Monad',
};

function shortAddress(address) {
  if (!address) return '';
  const value = String(address);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function chainIdFromHex(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const raw = String(value);
  return raw.startsWith('0x') ? Number.parseInt(raw, 16) : Number(raw);
}

function recommendedChain(dex) {
  return dex === 'pacifica' || dex === 'phoenix' ? 'solana' : 'base';
}

function defaultPaymentForChain(chain) {
  return chain === 'solana' ? 'sol-usdc' : 'base-eth';
}

function NftMintPanel({ onClose }) {
  const { dex } = useDex();
  const evmWallet = useEvmWallet();
  const solWallet = useSolWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const { isInFrame } = useFarcaster();

  const [step, setStep] = useState('chain');
  const [selectedChain, setSelectedChain] = useState(() => recommendedChain(dex));
  const [selectedPayment, setSelectedPayment] = useState(() => defaultPaymentForChain(recommendedChain(dex)));
  const [evmModalOpen, setEvmModalOpen] = useState(false);
  const [evmChainId, setEvmChainId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [mintConfig, setMintConfig] = useState(null);

  const solAddress = solWallet?.publicKey?.toBase58?.() || null;
  const evmAddress = evmWallet?.address || null;
  const evmOnBase = evmChainId === BASE_CHAIN_ID;
  const paymentOptions = useMemo(() => {
    const baseOptions = PAYMENT_OPTIONS[selectedChain] || PAYMENT_OPTIONS.base;
    return baseOptions.map((option) => ({
      ...option,
      soon: option.requiresClash ? !mintConfig?.base?.clashReady : !!option.soon,
    }));
  }, [mintConfig?.base?.clashReady, selectedChain]);
  const selected = useMemo(
    () => paymentOptions.find((option) => option.id === selectedPayment) || paymentOptions[0],
    [paymentOptions, selectedPayment],
  );

  useEffect(() => {
    let cancelled = false;
    fetchNftMintConfig()
      .then((config) => { if (!cancelled) setMintConfig(config); })
      .catch((err) => {
        if (!cancelled) {
          addClientBreadcrumb('nft.config_failed', { message: err?.message || String(err) }, 'warn');
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (step !== 'chain') return;
    const nextChain = recommendedChain(dex);
    setSelectedChain(nextChain);
    setSelectedPayment(defaultPaymentForChain(nextChain));
  }, [dex, step]);

  useEffect(() => {
    const provider = evmWallet?.provider;
    if (!provider?.request) {
      setEvmChainId(null);
      return undefined;
    }

    let cancelled = false;
    const readChain = async () => {
      try {
        const chainHex = await provider.request({ method: 'eth_chainId' });
        if (!cancelled) setEvmChainId(chainIdFromHex(chainHex));
      } catch {
        if (!cancelled) setEvmChainId(null);
      }
    };
    const onChainChanged = (chainHex) => setEvmChainId(chainIdFromHex(chainHex));

    readChain();
    if (typeof provider.on === 'function') provider.on('chainChanged', onChainChanged);
    return () => {
      cancelled = true;
      if (typeof provider.removeListener === 'function') {
        provider.removeListener('chainChanged', onChainChanged);
      }
    };
  }, [evmWallet?.provider]);

  const handleSelectChain = useCallback((chain) => {
    setSelectedChain(chain);
    setSelectedPayment(defaultPaymentForChain(chain));
    setStep('payment');
    setNotice(null);
    addClientBreadcrumb('nft.chain_selected', { chain, dex });
  }, [dex]);

  const handleBackToChains = useCallback(() => {
    setStep('chain');
    setNotice(null);
  }, []);

  const handleBaseReady = useCallback(async () => {
    if (!evmAddress) {
      setEvmModalOpen(true);
      return;
    }

    setBusy('base');
    setNotice(null);
    try {
      await evmWallet.ensureChain(BASE_CHAIN_ID);
      setEvmChainId(BASE_CHAIN_ID);
      setNotice('Base wallet ready.');
      addClientBreadcrumb('nft.payment_wallet_ready', { chain: 'base', dex });
    } catch (err) {
      const message = err?.message || 'Base switch cancelled';
      setNotice(message.slice(0, 120));
      addClientBreadcrumb('nft.base_switch_failed', { dex, message }, 'warn');
    } finally {
      setBusy(null);
    }
  }, [dex, evmAddress, evmWallet]);

  const handleSolanaReady = useCallback(() => {
    if (solAddress) {
      setNotice('Solana wallet ready.');
      addClientBreadcrumb('nft.payment_wallet_ready', { chain: 'solana', dex });
      return;
    }

    addClientBreadcrumb('nft.connect_solana_start', { dex });
    openSolanaWallet({
      wallets: solWallet.wallets,
      select: solWallet.select,
      connect: solWallet.connect,
      openWalletModal: setSolanaModalVisible,
      inFrame: isInFrame,
    });
  }, [dex, isInFrame, setSolanaModalVisible, solAddress, solWallet]);

  const handlePrimary = useCallback(() => {
    if (selected.soon) {
      setNotice('CLASH mint opens after token launch.');
      return;
    }
    if (selected.chain === 'base' && evmAddress && evmOnBase) {
      handleBaseMint({
        selected,
        evmAddress,
        evmWallet,
        setBusy,
        setNotice,
        dex,
      });
      return;
    }
    if (selected.chain === 'solana' && solAddress) {
      setNotice('Solana mint opens after the Candy Machine sale is enabled.');
      return;
    }
    if (selected.chain === 'base') {
      handleBaseReady();
    } else {
      handleSolanaReady();
    }
  }, [dex, evmAddress, evmOnBase, evmWallet, handleBaseReady, handleSolanaReady, selected, solAddress]);

  const primaryState = getPrimaryState({
    selected,
    evmAddress,
    evmOnBase,
    solAddress,
    busy,
  });

  const contextLine = getContextLine(dex);

  return (
    <>
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            {step === 'payment' ? (
              <button style={styles.backBtn} onClick={handleBackToChains} aria-label="Back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                  <path d="M15 18 9 12l6-6" />
                </svg>
              </button>
            ) : <span style={styles.headerSpacer} />}
            <span style={styles.title}>Demon King</span>
            <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div style={styles.body}>
            <div style={styles.topRow}>
              <div style={styles.heroFrame}>
                <div style={styles.heroGlow} />
                <img src={demonKingImg} alt="Demon King" style={styles.heroImg} />
              </div>

              <div style={styles.summary}>
                <span style={styles.heroName}>Demon King</span>
                <span style={styles.editionTag}>Genesis supply 250</span>
                <div style={styles.contextChip}>{contextLine}</div>
              </div>
            </div>

            {step === 'chain' ? (
              <div style={styles.chainGrid}>
                {CHAIN_OPTIONS.map((chain) => {
                  const active = chain.id === selectedChain;
                  const ready = chain.id === 'base' ? (evmAddress && evmOnBase) : solAddress;
                  return (
                    <button
                      key={chain.id}
                      type="button"
                      onClick={() => handleSelectChain(chain.id)}
                      style={{
                        ...styles.chainBtn,
                        ...(active ? styles.chainBtnActive : null),
                      }}
                    >
                      <span style={styles.chainBadge}>{chain.badge}</span>
                      <span style={styles.chainTitle}>{chain.title}</span>
                      <span style={styles.chainSubtitle}>{chain.subtitle}</span>
                      <span style={ready ? styles.chainReady : styles.chainConnect}>
                        {ready ? 'Ready' : 'Connect'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <div style={styles.selectedChainBar}>
                  <span style={styles.selectedChainText}>{selectedChain === 'base' ? 'Base' : 'Solana'}</span>
                  <button style={styles.changeBtn} onClick={handleBackToChains}>Change</button>
                </div>

                <div style={styles.walletGrid}>
                  {selectedChain === 'base' ? (
                    <WalletStatus
                      label="Base"
                      value={evmAddress ? shortAddress(evmAddress) : 'Not connected'}
                      tone={evmAddress && evmOnBase ? 'ready' : evmAddress ? 'warn' : 'idle'}
                      hint={evmAddress ? (evmOnBase ? 'Ready' : 'Switch needed') : 'EVM wallet'}
                    />
                  ) : (
                    <WalletStatus
                      label="Solana"
                      value={solAddress ? shortAddress(solAddress) : 'Not connected'}
                      tone={solAddress ? 'ready' : 'idle'}
                      hint={solAddress ? 'Ready' : 'SOL wallet'}
                    />
                  )}
                </div>

                <div style={styles.options}>
                  {paymentOptions.map((option) => {
                    const active = option.id === selectedPayment;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => { setSelectedPayment(option.id); setNotice(null); }}
                        disabled={option.soon}
                        style={{
                          ...styles.optionBtn,
                          ...(active ? styles.optionBtnActive : null),
                          ...(option.soon ? styles.optionBtnDisabled : null),
                        }}
                      >
                        <span style={styles.optionBadge}>{option.token}</span>
                        <span style={styles.optionMain}>{option.method}</span>
                        <span style={styles.optionPrice}>{option.price}</span>
                        {option.soon && <span style={styles.soonBadge}>SOON</span>}
                      </button>
                    );
                  })}
                </div>

                <button
                  style={{
                    ...styles.mintBtn,
                    ...(primaryState.ready ? styles.mintBtnReady : null),
                    ...(selected.soon ? styles.mintBtnDisabled : null),
                    cursor: busy || selected.soon ? 'not-allowed' : 'pointer',
                  }}
                  onClick={handlePrimary}
                  disabled={!!busy || selected.soon}
                >
                  <span style={styles.mintBtnGlyph}>{primaryState.glyph}</span>
                  <span>{primaryState.label}</span>
                </button>
              </>
            )}

            {notice && <div style={primaryState.ready ? styles.noticeReady : styles.notice}>{notice}</div>}
          </div>
        </div>
      </div>

      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        onConnected={({ provider, address, rdns }) => {
          evmWallet.setExternalProvider(provider, address, rdns, 'external');
          setEvmChainId(BASE_CHAIN_ID);
          setEvmModalOpen(false);
          setNotice('Base wallet connected.');
          addClientBreadcrumb('nft.connect_base_success', { dex });
        }}
      />
    </>
  );
}

function getContextLine(dex) {
  const label = DEX_LABELS[dex] || 'Game account';
  return `${label} active`;
}

async function handleBaseMint({ selected, evmAddress, evmWallet, setBusy, setNotice, dex }) {
  const payment = selected.id === 'base-usdc' ? 'usdc'
    : selected.id === 'base-clash' ? 'clash'
      : 'eth';
  setBusy('mint');
  setNotice(null);
  try {
    const result = await mintBaseNft({
      evmWallet,
      buyer: evmAddress,
      payment,
      quantity: 1,
    });
    setNotice(`Mint submitted: ${shortAddress(result.hash)}`);
    addClientBreadcrumb('nft.base_mint_submitted', {
      dex,
      payment,
      tx: result.hash,
    });
  } catch (err) {
    const message = err?.shortMessage || err?.message || 'Mint failed';
    setNotice(message.slice(0, 140));
    addClientBreadcrumb('nft.base_mint_failed', { dex, payment, message }, 'warn');
  } finally {
    setBusy(null);
  }
}

function getPrimaryState({ selected, evmAddress, evmOnBase, solAddress, busy }) {
  if (selected?.soon) return { label: 'CLASH soon', glyph: 'C', ready: false };
  if (busy === 'mint') return { label: 'Minting...', glyph: '...', ready: false };
  if (busy === selected.chain) return { label: 'Preparing...', glyph: '...', ready: false };
  if (selected.chain === 'base') {
    if (!evmAddress) return { label: 'Connect Base wallet', glyph: 'B', ready: false };
    if (!evmOnBase) return { label: 'Switch to Base', glyph: 'B', ready: false };
    return { label: `Mint with ${selected.token}`, glyph: 'B', ready: true };
  }
  if (!solAddress) return { label: 'Connect Solana wallet', glyph: 'S', ready: false };
  return { label: 'Solana mint soon', glyph: 'S', ready: false };
}

function WalletStatus({ label, value, hint, tone }) {
  const toneStyle = tone === 'ready' ? styles.walletReady
    : tone === 'warn' ? styles.walletWarn
      : styles.walletIdle;
  return (
    <div style={{ ...styles.walletStatus, ...toneStyle }}>
      <span style={styles.walletLabel}>{label}</span>
      <span style={styles.walletValue}>{value}</span>
      <span style={styles.walletHint}>{hint}</span>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 250, pointerEvents: 'all',
    padding: 12,
  },
  panel: {
    width: 500, maxWidth: '96vw', maxHeight: '92vh', background: '#fdf8e7',
    border: '6px solid #d4c8b0', borderRadius: 22,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'grid', gridTemplateColumns: '34px 1fr 34px', alignItems: 'center',
    padding: '12px 14px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
    flex: '0 0 auto',
  },
  headerSpacer: { width: 34, height: 34 },
  title: {
    fontSize: 20, fontWeight: 900, color: '#5C3A21',
    letterSpacing: 0, textAlign: 'center',
    textShadow: '0 1px 0 rgba(255,255,255,0.4)',
  },
  backBtn: {
    width: 32, height: 32, borderRadius: 12, background: '#fff6dc',
    border: '3px solid #9f8759', color: '#5C3A21', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: '50%', background: '#E53935',
    border: '3px solid #fff', color: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  body: {
    padding: 18,
    display: 'flex', flexDirection: 'column', gap: 12,
    overflowY: 'auto',
  },
  topRow: {
    display: 'grid',
    gridTemplateColumns: '150px 1fr',
    gap: 14,
    alignItems: 'center',
  },
  heroFrame: {
    position: 'relative',
    width: 150, height: 150,
    borderRadius: 18,
    background: 'radial-gradient(circle at 50% 35%, #f3e6c4 0%, #d8c190 60%, #b89a64 100%)',
    border: '5px solid #d4c8b0',
    boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.18), 0 8px 18px rgba(0,0,0,0.28)',
    overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  heroGlow: {
    position: 'absolute', inset: -4,
    background: 'radial-gradient(circle at 50% 40%, rgba(255,225,140,0.55) 0%, rgba(255,225,140,0) 60%)',
    pointerEvents: 'none',
  },
  heroImg: {
    position: 'relative',
    width: '100%', height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))',
  },
  summary: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  heroName: {
    fontSize: 26, fontWeight: 900, color: '#5C3A21',
    letterSpacing: 0,
    lineHeight: 1,
  },
  editionTag: {
    fontSize: 11, fontWeight: 900, color: '#8b6b3f',
    textTransform: 'uppercase', letterSpacing: 0,
  },
  contextChip: {
    alignSelf: 'flex-start',
    padding: '6px 9px',
    borderRadius: 9,
    background: '#e8dfc8',
    border: '2px solid #d4c8b0',
    color: '#70522b',
    fontSize: 11,
    fontWeight: 900,
  },
  chainGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
  },
  chainBtn: {
    minHeight: 122,
    border: '4px solid #d4c8b0',
    borderRadius: 14,
    background: '#fffaf0',
    padding: 12,
    color: '#5C3A21',
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto auto',
    gap: 5,
    textAlign: 'left',
    boxShadow: '0 5px 12px rgba(0,0,0,0.16)',
  },
  chainBtnActive: {
    borderColor: '#c2851b',
    background: '#fff1c4',
  },
  chainBadge: {
    justifySelf: 'start',
    padding: '5px 8px',
    borderRadius: 9,
    background: '#5C3A21',
    color: '#fff7df',
    fontSize: 10,
    fontWeight: 900,
  },
  chainTitle: {
    alignSelf: 'end',
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: 0,
  },
  chainSubtitle: {
    fontSize: 12,
    fontWeight: 900,
    color: '#8b6b3f',
  },
  chainReady: {
    fontSize: 11,
    fontWeight: 900,
    color: '#2e7d32',
  },
  chainConnect: {
    fontSize: 11,
    fontWeight: 900,
    color: '#9a6a18',
  },
  selectedChainBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    background: '#efe6d0',
    padding: '8px 10px',
  },
  selectedChainText: {
    color: '#5C3A21',
    fontSize: 15,
    fontWeight: 900,
  },
  changeBtn: {
    border: '2px solid #9f8759',
    borderRadius: 9,
    background: '#fffaf0',
    color: '#5C3A21',
    fontSize: 11,
    fontWeight: 900,
    padding: '5px 8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  walletGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 8,
  },
  walletStatus: {
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '9px 10px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  walletReady: { background: '#e5f4d8', borderColor: '#7db85a' },
  walletWarn: { background: '#fff1cc', borderColor: '#d9a928' },
  walletIdle: { background: '#efe6d0' },
  walletLabel: {
    fontSize: 11,
    color: '#8b6b3f',
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  walletValue: {
    fontSize: 15,
    color: '#5C3A21',
    fontWeight: 900,
    lineHeight: 1,
  },
  walletHint: {
    fontSize: 10,
    color: '#8b6b3f',
    fontWeight: 800,
  },
  options: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
  },
  optionBtn: {
    position: 'relative',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    background: '#fffaf0',
    padding: '10px',
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gridTemplateRows: 'auto auto',
    columnGap: 8,
    rowGap: 3,
    alignItems: 'center',
    color: '#5C3A21',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    minHeight: 66,
  },
  optionBtnActive: {
    borderColor: '#c2851b',
    background: '#fff1c4',
    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.65)',
  },
  optionBtnDisabled: {
    opacity: 0.68,
    cursor: 'not-allowed',
  },
  optionBadge: {
    gridRow: '1 / span 2',
    minWidth: 54,
    padding: '5px 6px',
    borderRadius: 8,
    background: '#5C3A21',
    color: '#fff7df',
    fontSize: 10,
    fontWeight: 900,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  optionMain: {
    minWidth: 0,
    fontSize: 15,
    fontWeight: 900,
    lineHeight: 1,
  },
  optionPrice: {
    fontSize: 12,
    fontWeight: 900,
    color: '#2e7d32',
  },
  soonBadge: {
    position: 'absolute',
    top: 6,
    right: 7,
    borderRadius: 8,
    background: '#5C3A21',
    color: '#fff7df',
    padding: '3px 6px',
    fontSize: 9,
    fontWeight: 900,
  },
  mintBtn: {
    width: '100%',
    padding: '13px',
    background: 'linear-gradient(180deg, #ffd76a 0%, #c2851b 100%)',
    border: '3px solid #5C3A21',
    borderRadius: 14,
    color: '#3a1f00',
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 0,
    textShadow: '0 1px 0 rgba(255,255,255,0.5)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    fontFamily: 'inherit',
  },
  mintBtnReady: {
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    color: '#12330f',
  },
  mintBtnDisabled: {
    opacity: 0.7,
  },
  mintBtnGlyph: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.45)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 900,
  },
  notice: {
    borderRadius: 10,
    border: '2px solid #d4c8b0',
    background: '#fff5d6',
    color: '#6b4f25',
    fontSize: 12,
    fontWeight: 800,
    padding: '8px 10px',
    textAlign: 'center',
  },
  noticeReady: {
    borderRadius: 10,
    border: '2px solid #7db85a',
    background: '#e5f4d8',
    color: '#2c6b25',
    fontSize: 12,
    fontWeight: 900,
    padding: '8px 10px',
    textAlign: 'center',
  },
};

export default memo(NftMintPanel);
