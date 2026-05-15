import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePrivy } from '@privy-io/react-auth';
import { usePlayer, useResources, useBuildingDefs, useSend } from '../hooks/useGodot';
import { usePacifica } from '../hooks/usePacifica';
import { useAvantis } from '../hooks/useAvantis';
import { useDecibel } from '../hooks/useDecibel';
import { useGmx } from '../hooks/useGmx';
import { useMonad } from '../hooks/useMonad';
import { usePhoenix } from '../hooks/usePhoenix';
import { useDex, DEX_CONFIG } from '../contexts/DexContext';
import { useFuturesMode } from '../contexts/FuturesModeContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useFarcaster } from '../hooks/useFarcaster';
import { useSkrHandle } from '../hooks/useSkrHandle';
import { cartoonBtn } from '../styles/theme';
import EvmWalletModal from './EvmWalletModal';
import { openSolanaWallet } from '../lib/solanaWalletUi';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;

function ProfileModal({ onClose }) {
  const player = usePlayer();
  const resources = useResources();
  const { sendToGodot } = useSend();
  const { publicKey, connected, disconnect, select, wallets, connect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { isInFrame: inFrame } = useFarcaster();
  const { dex } = useDex();
  const { mode: futuresMode, setMode: setFuturesMode } = useFuturesMode();
  const { disconnect: evmDisconnect, setExternalProvider: setEvmProvider } = useEvmWallet();
  const { disconnect: aptosDisconnect, connect: aptosConnect } = useAptosWallet();
  const pacificaHook = usePacifica();
  const avantisHook = useAvantis();
  const decibelHook = useDecibel();
  const gmxHook = useGmx();
  const monadHook = useMonad();
  const phoenixHook = usePhoenix();
  const tradingHook = dex === 'avantis'
    ? avantisHook
    : dex === 'decibel'
    ? decibelHook
    : dex === 'gmx'
    ? gmxHook
    : dex === 'monad'
    ? monadHook
    : dex === 'phoenix'
    ? phoenixHook
    : pacificaHook;
  const { account, walletAddr } = tradingHook;
  const [tradingStats, setTradingStats] = useState(null);
  const [copied, setCopied] = useState(false);
  const [evmModalOpen, setEvmModalOpen] = useState(false);
  const [aiKeys, setAiKeys] = useState([]);
  const [aiKeyName, setAiKeyName] = useState('Base agent');
  const [newAiKey, setNewAiKey] = useState(null);
  const [aiKeyBusy, setAiKeyBusy] = useState(false);
  const [aiKeyError, setAiKeyError] = useState('');
  const [aiKeyCopied, setAiKeyCopied] = useState(false);

  // Privy logout — hook only called when provider is mounted (build-time flag).
  let privyLogout = null, privyAuthed = false;
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const p = usePrivy();
    privyLogout = p.logout;
    privyAuthed = !!p.authenticated;
  }

  // Unified wallet address — DEX-aware priority. Previously `adapterAddr`
  // (the Solana wallet-adapter address) was first in the chain, which meant
  // that for an Avantis user who still had a Farcaster-Solana adapter
  // auto-connected, the profile would show their Solana address — even
  // though the Avantis account is registered with an EVM wallet. Resolve
  // to the chain-correct address for the active DEX.
  const adapterAddr = (connected && publicKey) ? publicKey.toBase58() : null;
  const liveWallet = (dex === 'avantis' || dex === 'gmx' || dex === 'monad')
    ? (walletAddr || null)            // EVM from useAvantis/useGmx/useMonad
    : dex === 'decibel'
    ? (walletAddr || null)            // Aptos from useDecibel
    : dex === 'phoenix'
    ? (walletAddr || null)            // Solana from usePhoenix
    : (adapterAddr || walletAddr || null); // Solana adapter / Privy
  const linkedWallet = player?.wallet || null;
  const activeWallet = liveWallet || linkedWallet;
  const walletSource = (dex === 'avantis' || dex === 'gmx' || dex === 'monad')
    ? (liveWallet ? 'evm' : null)
    : dex === 'decibel'
    ? (liveWallet ? 'aptos' : null)
    : dex === 'phoenix'
    ? (liveWallet ? 'solana' : null)
    : (adapterAddr ? 'adapter' : (liveWallet ? 'privy' : null));

  // Seeker `.skr` handle for the active wallet (Solana DEXes only — the
  // hook bails out for EVM / Aptos addresses on its own). Surfaced as a
  // chip next to the truncated wallet address so a Seeker user can see
  // their Solana Mobile identity at a glance.
  const skrLookupWallet = (walletSource === 'adapter' || walletSource === 'privy' || walletSource === 'solana')
    ? activeWallet
    : null;
  const { handle: seekerHandle } = useSkrHandle(skrLookupWallet);

  // Switch active DEX. In our model one wallet = one account, so "switching"
  // DEX really means "log out of this account and sign in with the other
  // DEX's wallet" — which may be an existing account on that DEX or a
  // fresh register. So SWITCH = disconnect + reopen the DEX picker. The
  // RegisterPanel then drives the new sign-in flow.
  // Shared logout teardown — covers every identity source. We always call
  // every teardown idempotently rather than branching on walletSource,
  // because branches silently miss hybrid cases (e.g. user is on Avantis
  // but Privy is also authenticated from a prior Pacifica session).
  const logoutEverything = async () => {
    sendToGodot('logout');
    try { evmDisconnect(); } catch { /* noop */ }
    try { aptosDisconnect(); } catch { /* noop */ }
    try { disconnect(); } catch { /* noop */ }
    if (privyLogout && privyAuthed) {
      try { await privyLogout(); } catch { /* noop */ }
    }
    window._playerToken = null;
  };

  const switchDex = async () => {
    try { localStorage.removeItem('clash_dex_picked'); } catch { /* storage disabled */ }
    await logoutEverything();
    onClose();
  };

  const handleDisconnect = async () => {
    await logoutEverything();
    onClose();
  };

  const handleEvmConnected = ({ address, provider, rdns }) => {
    setEvmModalOpen(false);
    if (provider && address) setEvmProvider(provider, address, rdns, 'external');
  };

  const openSolanaConnect = useCallback(() => {
    openSolanaWallet({ wallets, select, connect, openWalletModal, inFrame });
  }, [wallets, select, connect, openWalletModal, inFrame]);

  const { buildingDefs } = useBuildingDefs();
  // Use same source as HUD (PlayerInfo) — buildingDefs.th_level is authoritative.
  // Fall back to player.buildings structure only if buildingDefs isn't ready yet.
  const townHallLevel = buildingDefs?.th_level || player?.buildings?.town_hall?.level || 1;
  // Pacifica unified margin: raw `balance` can go negative when an open
  // position is in drawdown. Use available_to_spend (free margin) for the
  // "Trading Balance" / Free Margin display so we never show a misleading
  // -$X.XX while the account_equity is still positive. Clamp at 0 to
  // hide the negative collateral artifact entirely.
  const pacBalance = Math.max(0, parseFloat(account?.available_to_spend ?? account?.balance ?? 0));
  const pacEquity = Math.max(0, parseFloat(account?.account_equity || 0));

  // Fetch trading reward stats. Keyed on the reactive player token so that
  // if the user switches accounts while this modal is mounted (open in a
  // tab, then logs out / logs back in as a different user), we re-fetch
  // with the NEW token and discard any in-flight response from the old one.
  // Previously this read `window._playerToken` once with an empty dep array,
  // so an open ProfileModal could display Alice's gold_history + trades
  // to Bob after an account switch — or render `{error: "Invalid token"}`
  // as if it were stats after admin-wipe invalidated the token mid-fetch.
  const token = player?.token || null;

  const fetchAiKeys = useCallback(async () => {
    if (!token) { setAiKeys([]); setAiKeyError(''); setNewAiKey(null); return; }
    try {
      const r = await fetch('/api/players/ai-keys', { headers: { 'x-token': token } });
      if (!r.ok) throw new Error('Failed to load AI keys');
      const d = await r.json();
      setAiKeys(Array.isArray(d.keys) ? d.keys : []);
    } catch (e) {
      setAiKeyError(e?.message || 'Failed to load AI keys');
    }
  }, [token]);

  useEffect(() => {
    fetchAiKeys();
  }, [fetchAiKeys]);

  const createAiKey = useCallback(async () => {
    if (!token || aiKeyBusy) return;
    setAiKeyBusy(true);
    setAiKeyError('');
    setAiKeyCopied(false);
    try {
      const r = await fetch('/api/players/ai-keys', {
        method: 'POST',
        headers: { 'x-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: aiKeyName || 'Base agent' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Failed to create AI key');
      setNewAiKey(d);
      setAiKeyName('Base agent');
      await fetchAiKeys();
      window.dispatchEvent(new Event('clash-ai-keys-changed'));
    } catch (e) {
      setAiKeyError(e?.message || 'Failed to create AI key');
    } finally {
      setAiKeyBusy(false);
    }
  }, [aiKeyBusy, aiKeyName, fetchAiKeys, token]);

  const revokeAiKey = useCallback(async (id) => {
    if (!token || !id || aiKeyBusy) return;
    setAiKeyBusy(true);
    setAiKeyError('');
    try {
      const r = await fetch(`/api/players/ai-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-token': token },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Failed to revoke AI key');
      await fetchAiKeys();
      window.dispatchEvent(new Event('clash-ai-keys-changed'));
    } catch (e) {
      setAiKeyError(e?.message || 'Failed to revoke AI key');
    } finally {
      setAiKeyBusy(false);
    }
  }, [aiKeyBusy, fetchAiKeys, token]);

  useEffect(() => {
    if (!token) { setTradingStats(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/trading/stats', { headers: { 'x-token': token } });
        if (cancelled) return;
        if (!r.ok) return; // leave prior stats cleared above
        const d = await r.json();
        if (!cancelled) setTradingStats(d);
      } catch { /* network error — leave stats null */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <>
      <div style={S.backdrop} onClick={onClose} />
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
            <div style={S.levelBadge}><span style={S.levelNum}>{townHallLevel}</span></div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
              <span style={{color: '#5C3A21', fontSize: 20, fontWeight: 900}}>{player?.player_name}</span>
              <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
                <img src={trophyIcon} alt="" style={{width: 16, height: 16, filter: 'invert(60%) sepia(90%) saturate(500%) hue-rotate(10deg)'}} />
                <span style={{fontSize: 13, fontWeight: 800, color: '#a3906a'}}>{(player?.trophies || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={S.body}>
          {/* DEX selector strip — cartoon-styled, gradient tile with 3D shadow */}
          {(() => {
            const cfg = DEX_CONFIG[dex] || DEX_CONFIG.pacifica;
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 14,
                background: `linear-gradient(180deg, ${cfg.color} 0%, ${cfg.colorDark} 100%)`,
                border: `3px solid ${cfg.borderColor}`,
                boxShadow: `0 3px 0 ${cfg.borderColor}, 0 4px 8px rgba(0,0,0,0.2)`,
              }}>
                {/* Official DEX logo — Pacifica pairs icon + text label,
                    Avantis ships the full wordmark. */}
                <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                  <img
                    src={cfg.logo}
                    alt={cfg.label}
                    style={{
                      height: cfg.logoIsWordmark ? 22 : 26,
                      width: 'auto',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                    }}
                  />
                  {!cfg.logoIsWordmark && (
                    <span style={{
                      fontSize: 16, fontWeight: 900, color: '#fff',
                      letterSpacing: '0.6px',
                      textShadow: '0 2px 0 rgba(0,0,0,0.35)',
                      textTransform: 'lowercase',
                    }}>{cfg.label.toLowerCase()}</span>
                  )}
                </div>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{
                    fontSize: 10, fontWeight: 800,
                    color: 'rgba(255,255,255,0.88)',
                    letterSpacing: '0.5px',
                    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
                  }}>TRADING ON</div>
                  <div style={{
                    fontSize: 12, fontWeight: 900, color: '#fff',
                    letterSpacing: '0.8px',
                    textShadow: '0 1px 0 rgba(0,0,0,0.35)',
                    marginTop: 1,
                  }}>
                    {cfg.chain} · SELF-CUSTODY
                  </div>
                </div>
                <button
                  onClick={switchDex}
                  style={{
                    background: 'rgba(0,0,0,0.25)',
                    border: '2px solid rgba(0,0,0,0.35)',
                    color: '#fff',
                    fontSize: 10, fontWeight: 900,
                    padding: '6px 10px', borderRadius: 8,
                    cursor: 'pointer', letterSpacing: '0.8px',
                    textShadow: '0 1px 0 rgba(0,0,0,0.4)',
                    boxShadow: '0 2px 0 rgba(0,0,0,0.2)',
                  }}
                >SWITCH</button>
              </div>
            );
          })()}

          {/* Futures UI mode toggle (basic / pro). Hidden until the user
              has made their first-time choice — once they have, this lets
              them flip back and forth from here. Persists server-side. */}
          {futuresMode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 12,
              background: 'rgba(92, 58, 33, 0.06)',
              border: '2px solid rgba(92, 58, 33, 0.18)',
            }}>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{
                  fontSize: 9, fontWeight: 800, color: '#a3906a',
                  letterSpacing: '0.6px',
                }}>FUTURES MODE</div>
                <div style={{
                  fontSize: 12, fontWeight: 900, color: '#5C3A21',
                  marginTop: 1,
                }}>
                  {futuresMode === 'pro' ? 'Pro — full feature set' : 'Basic — simplified UI'}
                </div>
              </div>
              <div style={{display: 'flex', gap: 4, flexShrink: 0}}>
                <button
                  onClick={() => futuresMode !== 'basic' && setFuturesMode('basic')}
                  disabled={futuresMode === 'basic'}
                  style={{
                    padding: '6px 12px', borderRadius: 8,
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.5px',
                    cursor: futuresMode === 'basic' ? 'default' : 'pointer',
                    background: futuresMode === 'basic'
                      ? 'linear-gradient(180deg, #6ab344 0%, #4d7a2e 100%)'
                      : '#e8dfc8',
                    color: futuresMode === 'basic' ? '#fff' : '#77573d',
                    border: futuresMode === 'basic'
                      ? '2px solid #3a5e22'
                      : '2px solid #d4c8b0',
                    textShadow: futuresMode === 'basic' ? '1px 1px 0 rgba(0,0,0,0.3)' : 'none',
                  }}
                >BASIC</button>
                <button
                  onClick={() => futuresMode !== 'pro' && setFuturesMode('pro')}
                  disabled={futuresMode === 'pro'}
                  style={{
                    padding: '6px 12px', borderRadius: 8,
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.5px',
                    cursor: futuresMode === 'pro' ? 'default' : 'pointer',
                    background: futuresMode === 'pro'
                      ? 'linear-gradient(180deg, #0EA5E9 0%, #0369A1 100%)'
                      : '#e8dfc8',
                    color: futuresMode === 'pro' ? '#fff' : '#77573d',
                    border: futuresMode === 'pro'
                      ? '2px solid #0284C7'
                      : '2px solid #d4c8b0',
                    textShadow: futuresMode === 'pro' ? '1px 1px 0 rgba(0,0,0,0.3)' : 'none',
                  }}
                >PRO</button>
              </div>
            </div>
          )}

          {/* Wallet */}
          {activeWallet ? (
            <div style={S.connectedBox}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                <div style={liveWallet ? S.dot : S.offlineDot} />
                <span style={{fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: '#5C3A21'}}>
                  {copied ? 'Copied' : `${activeWallet.slice(0, 6)}...${activeWallet.slice(-4)}`}
                </span>
                {!liveWallet && (
                  <span style={S.offlineChip}>wallet offline</span>
                )}
                {seekerHandle?.full && (
                  <span
                    title={`Seeker .skr handle for ${activeWallet}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '2px 8px', borderRadius: 999,
                      background: 'linear-gradient(180deg, #A78BFA 0%, #6D28D9 100%)',
                      color: '#fff',
                      fontSize: 10, fontWeight: 900, letterSpacing: '0.4px',
                      textTransform: 'lowercase',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 0 rgba(0,0,0,0.25)',
                      textShadow: '0 1px 0 rgba(0,0,0,0.3)',
                    }}
                  >
                    <span style={{ fontSize: 9, opacity: 0.85 }}>SEEKER</span>
                    <strong>{seekerHandle.full}</strong>
                  </span>
                )}
                <button
                  title="Copy full address"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(activeWallet); } catch {}
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, padding: 0, borderRadius: 6,
                    background: copied ? 'rgba(67,160,71,0.18)' : 'rgba(0,0,0,0.08)',
                    border: `1px solid ${copied ? 'rgba(46,125,50,0.5)' : 'rgba(92,58,33,0.3)'}`,
                    cursor: 'pointer', color: copied ? '#2E7D32' : '#5C3A21',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {copied ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  )}
                </button>
              </div>
              {!inFrame && walletSource && (
                <button style={S.disconnectBtn} onClick={handleDisconnect}>Disconnect</button>
              )}
            </div>
          ) : inFrame ? (
            <div style={S.connectedBox}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <div style={S.dot} />
                <span style={{fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: '#5C3A21'}}>Farcaster Wallet</span>
              </div>
            </div>
          ) : dex === 'avantis' ? (
            <button
              style={{...cartoonBtn('#0284C7', '#0369A1'), width: '100%', textAlign: 'center', padding: '14px'}}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT BASE WALLET</button>
          ) : dex === 'gmx' ? (
            <button
              style={{...cartoonBtn('#4F46E5', '#3730A3'), width: '100%', textAlign: 'center', padding: '14px'}}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT ARBITRUM WALLET</button>
          ) : dex === 'monad' ? (
            <button
              style={{...cartoonBtn('#6F5CFF', '#4530E0'), width: '100%', textAlign: 'center', padding: '14px'}}
              onClick={() => setEvmModalOpen(true)}
            >CONNECT MONAD WALLET</button>
          ) : (
            <button
              style={{...cartoonBtn('#9945FF', '#7B36CC'), width: '100%', textAlign: 'center', padding: '14px'}}
              onClick={openSolanaConnect}
            >CONNECT WALLET</button>
          )}

          {activeWallet && !liveWallet && (
            <div style={S.walletRepair}>
              <div style={S.walletRepairText}>
                This game session is active, but the signing wallet for the selected DEX is not connected.
              </div>
              <div style={S.walletRepairActions}>
                <button
                  style={S.walletRepairBtn}
                  onClick={() => {
                    if (dex === 'avantis' || dex === 'gmx' || dex === 'monad') setEvmModalOpen(true);
                    else if (dex === 'decibel') aptosConnect?.();
                    else openSolanaConnect();
                  }}
                >
                  Reconnect
                </button>
                <button style={S.walletRepairLogout} onClick={handleDisconnect}>Log out</button>
              </div>
            </div>
          )}

          {token && (
            <>
              <div style={S.sectionTitle}>AI Agent</div>
              <div style={S.aiBox}>
                <div style={S.aiCreateRow}>
                  <input
                    value={aiKeyName}
                    onChange={(e) => setAiKeyName(e.target.value)}
                    maxLength={40}
                    placeholder="Key name"
                    style={S.aiInput}
                  />
                  <button style={S.aiPrimaryBtn} disabled={aiKeyBusy} onClick={createAiKey}>
                    {aiKeyBusy ? '...' : 'Create'}
                  </button>
                </div>

                {newAiKey?.key && (
                  <div style={S.aiSecretBox}>
                    <div style={S.aiSecretText}>{newAiKey.key}</div>
                    <button
                      style={S.aiCopyBtn}
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(newAiKey.key); } catch {}
                        setAiKeyCopied(true);
                        setTimeout(() => setAiKeyCopied(false), 1500);
                      }}
                    >
                      {aiKeyCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                <div style={S.aiHint}>MCP: <span style={S.aiMono}>/mcp</span> with <span style={S.aiMono}>Authorization: Bearer key</span></div>

                {aiKeyError && <div style={S.aiError}>{aiKeyError}</div>}
                {aiKeys.length > 0 && (
                  <div style={S.aiKeyList}>
                    {aiKeys.map((k) => (
                      <div key={k.id} style={S.aiKeyRow}>
                        <div style={{minWidth: 0}}>
                          <div style={S.aiKeyName}>{k.name || 'AI Agent'}</div>
                          <div style={S.aiKeyMeta}>
                            {k.key_prefix}...{k.key_suffix}
                            {k.last_used_at ? ` - used ${k.last_used_at.split(' ')[0]}` : ''}
                          </div>
                        </div>
                        <button style={S.aiRevokeBtn} disabled={aiKeyBusy || !!k.revoked_at} onClick={() => revokeAiKey(k.id)}>
                          {k.revoked_at ? 'Revoked' : 'Revoke'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Avantis self-custody funding callout */}
          {dex === 'avantis' && activeWallet && (
            <div style={{
              padding: '12px 14px', borderRadius: 14,
              background: 'linear-gradient(180deg, #FFF3E0 0%, #FFE0B2 100%)',
              border: '3px solid #E65100',
              boxShadow: '0 3px 0 #E65100, 0 4px 8px rgba(0,0,0,0.15)',
            }}>
              <div style={{
                fontSize: 12, fontWeight: 900, color: '#BF360C',
                letterSpacing: '1px', marginBottom: 4,
              }}>💰 DEPOSIT TO TRADE</div>
              <div style={{
                fontSize: 12, color: '#5D2A0C', fontWeight: 700,
                lineHeight: 1.4,
              }}>
                Send <b>USDC</b> + a little <b>ETH</b> (for gas, ~0.003 ETH) to the address above on the <b>Base</b> network.
              </div>
            </div>
          )}

          {/* Game resources */}
          <div style={S.sectionTitle}>Game Resources</div>
          <div style={{display: 'flex', gap: 6}}>
            <div style={S.resCard}><span style={{...S.resVal, color: '#e8b830'}}>{resources?.gold || 0}</span><span style={S.resLabel}>Gold</span></div>
            <div style={S.resCard}><span style={{...S.resVal, color: '#6ab344'}}>{resources?.wood || 0}</span><span style={S.resLabel}>Wood</span></div>
            <div style={S.resCard}><span style={{...S.resVal, color: '#8a9aaa'}}>{resources?.ore || 0}</span><span style={S.resLabel}>Ore</span></div>
          </div>

          {/* Game stats */}
          {[
            ['Player Level', townHallLevel],
            ['Trophies', (player?.trophies || 0).toLocaleString()],
          ].map(([label, val]) => (
            <div key={label} style={S.statRow}>
              <span style={S.statLabel}>{label}</span>
              <span style={S.statVal}>{val}</span>
            </div>
          ))}

          {/* Trading stats */}
          {(activeWallet || inFrame) && (
            <>
              <div style={S.sectionTitle}>Trading</div>
              {[
                // Equity = mark-to-market portfolio value (always >= 0).
                // Free Margin = collateral available for new trades.
                // Showing both makes the unified-margin model legible
                // instead of the old "Trading Balance" which silently meant
                // raw collateral and went negative on losing positions.
                ['Equity', `$${pacEquity.toFixed(2)}`],
                ['Free Margin', `$${pacBalance.toFixed(2)}`],
                ['Positions', account?.positions_count || 0],
                ['Orders', account?.orders_count || 0],
              ].map(([label, val]) => (
                <div key={label} style={S.statRow}>
                  <span style={S.statLabel}>{label}</span>
                  <span style={S.statVal}>{val}</span>
                </div>
              ))}
            </>
          )}

          {/* Gold rewards */}
          {tradingStats && tradingStats.total_gold > 0 && (
            <>
              <div style={S.sectionTitle}>Gold from Trading</div>
              <div style={S.goldCard}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                  <span style={{fontSize: 28}}>🪙</span>
                  <div>
                    <div style={{fontSize: 22, fontWeight: 900, color: '#5C3A21'}}>{tradingStats.total_gold.toLocaleString()} Gold</div>
                    <div style={{fontSize: 11, color: '#a3906a', fontWeight: 700}}>Volume: ${parseFloat(tradingStats.total_volume || 0).toFixed(0)}</div>
                  </div>
                </div>
              </div>

              {/* Gold history */}
              {tradingStats.gold_history?.length > 0 && (
                <>
                  <div style={S.sectionTitle}>Gold History</div>
                  {tradingStats.gold_history.map((h, i) => (
                    <div key={i} style={S.historyRow}>
                      <span style={{fontSize: 14, fontWeight: 900, color: '#4CAF50'}}>+{h.amount}</span>
                      <span style={{fontSize: 12, fontWeight: 700, color: '#77573d', flex: 1}}>{h.reason}</span>
                      <span style={{fontSize: 10, color: '#a3906a'}}>{h.created_at?.split(' ')[0]}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* Trade history */}
          {tradingStats?.trades?.length > 0 && (
            <>
              <div style={S.sectionTitle}>Trade History</div>
              {tradingStats.trades.slice(0, 20).map((t, i) => (
                <div key={i} style={S.historyRow}>
                  <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21', minWidth: 40}}>{t.symbol}</span>
                  <span style={{fontSize: 12, fontWeight: 700, color: '#77573d', flex: 1}}>{t.amount} @ ${parseFloat(t.price).toLocaleString()}</span>
                  <span style={{fontSize: 10, color: '#a3906a'}}>{t.created_at?.split(' ')[0] || '—'}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <EvmWalletModal
        open={evmModalOpen}
        onClose={() => setEvmModalOpen(false)}
        onConnected={handleEvmConnected}
      />
    </>
  );
}

export default memo(ProfileModal);

const S = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, pointerEvents: 'auto' },
  modal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: '90%', maxWidth: 370, maxHeight: '85vh', background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
    zIndex: 201, pointerEvents: 'auto', overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
  },
  levelBadge: {
    width: 44, height: 44, borderRadius: 10,
    background: 'radial-gradient(circle at 30% 30%, #7bd9ff 0%, #46b8e8 70%, #2a9ccb 100%)',
    border: '3px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 3px 6px rgba(0,0,0,0.4)',
    position: 'relative',
    overflow: 'hidden',
  },
  levelNum: { color: '#fff', fontSize: 22, fontWeight: 900, textShadow: '-1.5px -1.5px 0 #0a0a0a, 1.5px -1.5px 0 #0a0a0a, -1.5px 1.5px 0 #0a0a0a, 1.5px 1.5px 0 #0a0a0a, 0 2px 2px rgba(0,0,0,0.8)' },
  closeBtn: {
    width: 30, height: 30, borderRadius: '50%', background: '#E53935', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  body: { flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', scrollbarWidth: 'none' },
  connectedBox: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12, padding: '10px 14px',
  },
  dot: { width: 10, height: 10, borderRadius: '50%', background: '#4CAF50', boxShadow: '0 0 6px #4CAF50' },
  offlineDot: { width: 10, height: 10, borderRadius: '50%', background: '#a3906a', boxShadow: '0 0 6px rgba(163,144,106,0.5)' },
  offlineChip: {
    padding: '2px 7px', borderRadius: 999,
    background: 'rgba(163,144,106,0.16)', border: '1px solid rgba(163,144,106,0.45)',
    color: '#77573d', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  walletRepair: {
    padding: '10px 12px', borderRadius: 12,
    background: 'linear-gradient(180deg, #FFF8E1 0%, #FFE9A6 100%)',
    border: '3px solid #D79A1E',
    boxShadow: '0 3px 0 #b57812, 0 4px 8px rgba(0,0,0,0.12)',
  },
  walletRepairText: { color: '#6b421d', fontSize: 11, fontWeight: 800, lineHeight: 1.35 },
  walletRepairActions: { display: 'flex', gap: 8, marginTop: 8 },
  walletRepairBtn: {
    flex: 1, padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
    background: 'linear-gradient(180deg, #6F5CFF 0%, #4530E0 100%)',
    border: '2px solid #3720a6', color: '#fff', fontSize: 11, fontWeight: 900,
  },
  walletRepairLogout: {
    padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
    background: 'linear-gradient(180deg, #ef5350 0%, #d32f2f 100%)',
    border: '2px solid #8b2a2a', color: '#fff', fontSize: 11, fontWeight: 900,
  },
  aiBox: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: '10px 12px', borderRadius: 12,
    background: '#e8dfc8', border: '2px solid #d4c8b0',
  },
  aiCreateRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' },
  aiInput: {
    minWidth: 0, height: 34, borderRadius: 8, border: '2px solid #d4c8b0',
    background: '#fffaf0', color: '#5C3A21', padding: '0 10px',
    fontSize: 12, fontWeight: 800, outline: 'none',
  },
  aiPrimaryBtn: {
    height: 34, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
    background: 'linear-gradient(180deg, #0EA5E9 0%, #0369A1 100%)',
    border: '2px solid #025b8d', color: '#fff', fontSize: 11, fontWeight: 900,
  },
  aiSecretBox: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8,
    alignItems: 'center', padding: 8, borderRadius: 8,
    background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(92,58,33,0.2)',
  },
  aiSecretText: {
    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: '#5C3A21',
  },
  aiCopyBtn: {
    padding: '6px 9px', borderRadius: 7, cursor: 'pointer',
    background: '#6ab344', border: '2px solid #4d7a2e',
    color: '#fff', fontSize: 10, fontWeight: 900,
  },
  aiHint: { fontSize: 10, fontWeight: 800, color: '#77573d', lineHeight: 1.35 },
  aiMono: { fontFamily: 'monospace', color: '#5C3A21' },
  aiError: { fontSize: 11, fontWeight: 800, color: '#B71C1C' },
  aiKeyList: { display: 'flex', flexDirection: 'column', gap: 6 },
  aiKeyRow: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center',
    padding: '7px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.42)',
    border: '1px solid rgba(92,58,33,0.16)',
  },
  aiKeyName: {
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontSize: 12, fontWeight: 900, color: '#5C3A21',
  },
  aiKeyMeta: {
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontFamily: 'monospace', fontSize: 10, color: '#77573d', marginTop: 1,
  },
  aiRevokeBtn: {
    padding: '5px 8px', borderRadius: 7, cursor: 'pointer',
    background: '#f4e8d1', border: '1px solid #c9b590',
    color: '#77573d', fontSize: 10, fontWeight: 900,
  },
  disconnectBtn: {
    padding: '5px 12px', background: '#E53935', border: '2px solid #B71C1C',
    borderRadius: 8, color: '#fff', fontWeight: 800, fontSize: 11, cursor: 'pointer',
  },
  sectionTitle: {
    fontSize: 12, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase',
    marginTop: 6, paddingBottom: 2, borderBottom: '2px solid #e8dfc8',
  },
  statRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 10,
  },
  statLabel: { fontSize: 13, fontWeight: 700, color: '#77573d' },
  statVal: { fontSize: 15, fontWeight: 900, color: '#5C3A21' },
  resCard: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 10, padding: 8,
  },
  resVal: { fontSize: 16, fontWeight: 900 },
  resLabel: { fontSize: 10, fontWeight: 700, color: '#a3906a', textTransform: 'uppercase' },
  goldCard: {
    background: 'linear-gradient(135deg, #FFF8E1 0%, #FFE082 100%)',
    border: '3px solid #FFB300', borderRadius: 14, padding: 14,
  },
  goldStat: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    background: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: 6,
  },
  historyRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
  },
};
