import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from '../hooks/useGodot';
import { BASE_CHAIN_ID } from '../lib/avantisContract';
import {
  NFT_GOLD_BOOST_ERC1155_ABI,
  NFT_GOLD_BOOST_BONUS_PERCENT,
  NFT_GOLD_BOOST_CONTRACT,
  NFT_GOLD_BOOST_TOKEN_IDS,
  buildNftGoldBoostMessage,
  shortEvmAddress,
} from '../lib/nftGoldBoost';
import EvmWalletModal from './EvmWalletModal';
import nftGoldBoostImage from '../assets/nft-gold-boost.jpg';

function tokenFromPlayer(player) {
  return player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
}

function playerIdFromState(player) {
  return player?.id || player?.player_id || null;
}

function messageFromError(error) {
  const text = error?.shortMessage || error?.message || String(error || '');
  if (/user rejected|denied|cancelled/i.test(text)) return 'Verification cancelled';
  if (/wrong_evm_chain|switch/i.test(text)) return 'Switch wallet to Base and retry';
  return text.slice(0, 140) || 'Verification failed';
}

export default function NftGoldBoostButton({ placement = 'side' }) {
  const player = usePlayer();
  const token = tokenFromPlayer(player);
  const playerId = playerIdFromState(player);
  const {
    address,
    isReady,
    walletClient,
    publicClient,
    ensureChain,
    getWalletClient,
    getPublicClient,
    setExternalProvider,
  } = useEvmWallet();
  const [open, setOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({
    eligible: false,
    checked: false,
    message: '',
  });

  const activeWallet = useMemo(() => shortEvmAddress(address), [address]);
  const verifiedWallet = useMemo(() => shortEvmAddress(status.wallet), [status.wallet]);
  const walletLine = activeWallet
    ? `Wallet ${activeWallet}`
    : verifiedWallet
      ? `Verified wallet ${verifiedWallet}`
      : 'Connect a Base wallet to verify.';

  const fetchStatus = useCallback(async () => {
    if (!token) return;
    const response = await fetch('/api/nft-gold-boost/status', {
      headers: { 'x-token': token },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    setStatus({
      eligible: !!data.eligible,
      checked: true,
      wallet: data.wallet || null,
      contract: data.contract || null,
      message: data.eligible
        ? `Verified. Trading rewards get +${NFT_GOLD_BOOST_BONUS_PERCENT}% gold.`
        : '',
    });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchStatus().catch((error) => {
      if (cancelled) return;
      setStatus((prev) => ({
        ...prev,
        checked: true,
        message: messageFromError(error),
      }));
    });
    return () => { cancelled = true; };
  }, [fetchStatus, token]);

  const verifyOwnership = useCallback(async () => {
    if (!token || !playerId) {
      setStatus((prev) => ({ ...prev, message: 'Player session is not ready yet' }));
      return;
    }
    if (!isReady || !address) {
      setWalletModalOpen(true);
      return;
    }

    setBusy(true);
    setStatus((prev) => ({ ...prev, message: 'Switching wallet to Base...' }));
    try {
      await ensureChain(BASE_CHAIN_ID);
      const basePublicClient = getPublicClient?.(BASE_CHAIN_ID) || publicClient;
      let localOwns = null;
      try {
        if (typeof basePublicClient.multicall === 'function') {
          const balances = await basePublicClient.multicall({
            allowFailure: true,
            contracts: NFT_GOLD_BOOST_TOKEN_IDS.map((id) => ({
              address: NFT_GOLD_BOOST_CONTRACT,
              abi: NFT_GOLD_BOOST_ERC1155_ABI,
              functionName: 'balanceOf',
              args: [address, id],
            })),
          });
          localOwns = balances.some((entry) => (
            entry?.status === 'success' && BigInt(entry.result || 0) > 0n
          ));
        }
      } catch (error) {
        console.warn('[nft-gold-boost] local balance precheck failed:', error?.message || error);
      }
      if (localOwns === false) {
        setStatus({
          eligible: false,
          checked: true,
          wallet: address,
          contract: NFT_GOLD_BOOST_CONTRACT,
          message: 'This wallet does not hold the required Base NFT.',
        });
        return;
      }

      const signer = getWalletClient?.(BASE_CHAIN_ID) || walletClient;
      if (!signer?.signMessage) throw new Error('Connected wallet cannot sign messages');
      const timestamp = Date.now();
      const message = buildNftGoldBoostMessage({ playerId, wallet: address, timestamp });
      setStatus((prev) => ({ ...prev, message: 'Sign the verification message...' }));
      const signature = await signer.signMessage({ account: address, message });

      setStatus((prev) => ({ ...prev, message: 'Checking NFT on Base...' }));
      const response = await fetch('/api/nft-gold-boost/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-token': token,
        },
        body: JSON.stringify({ wallet: address, timestamp, signature }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setStatus({
        eligible: !!data.eligible,
        checked: true,
        wallet: data.wallet || address,
        contract: data.contract || NFT_GOLD_BOOST_CONTRACT,
        message: data.eligible
          ? `Verified. Trading rewards get +${NFT_GOLD_BOOST_BONUS_PERCENT}% gold.`
          : (data.error || 'This wallet does not hold the required Base NFT.'),
      });
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        checked: true,
        message: messageFromError(error),
      }));
    } finally {
      setBusy(false);
    }
  }, [
    address,
    ensureChain,
    getPublicClient,
    getWalletClient,
    isReady,
    playerId,
    publicClient,
    token,
    walletClient,
  ]);

  return (
    <>
      <style>{`
        .nft-gold-boost-button {
          width: 42px;
          height: 42px;
        }
        .nft-gold-boost-button--side {
          left: 46px;
          bottom: 274px;
        }
        .nft-gold-boost-button--replay {
          right: 14px;
          top: calc(env(safe-area-inset-top, 0px) + 64px);
        }
        @media (max-width: 720px) {
          .nft-gold-boost-button {
            width: 34px;
            height: 34px;
          }
          .nft-gold-boost-button--side {
            left: 34px;
            top: auto;
            bottom: calc(env(safe-area-inset-bottom, 0px) + 232px);
          }
          .nft-gold-boost-button--replay {
            right: 10px;
            top: calc(env(safe-area-inset-top, 0px) + 58px);
          }
        }
      `}</style>
      <button
        type="button"
        className={`nft-gold-boost-button nft-gold-boost-button--${placement}`}
        style={S.trigger}
        onClick={() => setOpen(true)}
        title={status.eligible ? `Neon Pickaxe verified: +${NFT_GOLD_BOOST_BONUS_PERCENT}% gold` : 'Verify Neon Pickaxe gold boost'}
        aria-label="Verify Neon Pickaxe gold boost"
      >
        <img src={nftGoldBoostImage} alt="" style={S.triggerImage} draggable={false} />
        <span
          style={{
            ...S.statusDot,
            background: status.eligible ? '#32d46b' : '#f6c343',
          }}
        />
      </button>

      {open && (
        <div style={S.backdrop} onClick={() => setOpen(false)}>
          <div style={S.modal} onClick={(event) => event.stopPropagation()}>
            <div style={S.header}>
              <div style={S.title}>Neon Pickaxe</div>
              <button type="button" onClick={() => setOpen(false)} style={S.close} aria-label="Close">x</button>
            </div>
            <div style={S.body}>
              <img src={nftGoldBoostImage} alt="" style={S.preview} draggable={false} />
              <div style={S.copy}>
                Unlock an automatic {NFT_GOLD_BOOST_BONUS_PERCENT}% Boost on Gold-Mining in Clash of Perps.
              </div>
              <div style={S.meta}>
                {walletLine}
              </div>
              {status.message && (
                <div
                  style={{
                    ...S.statusText,
                    color: status.eligible ? '#186b32' : '#5f4020',
                  }}
                >
                  {status.message}
                </div>
              )}
              {isReady && address ? (
                <button
                  type="button"
                  style={status.eligible ? S.verifiedButton : S.verifyButton}
                  onClick={verifyOwnership}
                  disabled={busy || status.eligible}
                >
                  {busy ? 'VERIFYING...' : status.eligible ? 'VERIFICATION PASSED' : 'VERIFY'}
                </button>
              ) : (
                <button type="button" style={S.verifyButton} onClick={() => setWalletModalOpen(true)}>
                  CONNECT BASE WALLET
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <EvmWalletModal
        open={walletModalOpen}
        targetChain="base"
        onClose={() => setWalletModalOpen(false)}
        onConnected={({ provider, address: connectedAddress, rdns }) => {
          setExternalProvider?.(provider, connectedAddress, rdns, 'external');
          setWalletModalOpen(false);
        }}
      />
    </>
  );
}

const S = {
  trigger: {
    position: 'fixed',
    zIndex: 28,
    pointerEvents: 'auto',
    padding: 0,
    border: '2px solid #5C3A21',
    borderRadius: 8,
    background: '#fff6dc',
    boxShadow: '0 5px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.55)',
    cursor: 'pointer',
    overflow: 'hidden',
  },
  triggerImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  statusDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 8,
    height: 8,
    borderRadius: '50%',
    border: '1px solid #321f12',
    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1100,
    pointerEvents: 'auto',
    background: 'rgba(0,0,0,0.48)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    width: 'min(360px, calc(100vw - 32px))',
    borderRadius: 8,
    border: '3px solid #5C3A21',
    background: '#fff4d4',
    boxShadow: '0 18px 36px rgba(0,0,0,0.45)',
    overflow: 'hidden',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    color: '#2f2117',
  },
  header: {
    height: 44,
    background: 'linear-gradient(180deg, #f7c85a, #d89c2d)',
    borderBottom: '2px solid #5C3A21',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 10px 0 14px',
  },
  title: {
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 0,
    color: '#321f12',
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: '2px solid #5C3A21',
    background: '#fff4d4',
    color: '#321f12',
    fontSize: 15,
    fontWeight: 900,
    lineHeight: '20px',
    cursor: 'pointer',
  },
  body: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  preview: {
    width: 78,
    height: 78,
    borderRadius: 8,
    objectFit: 'cover',
    border: '2px solid #5C3A21',
    boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
  },
  copy: {
    fontSize: 14,
    lineHeight: 1.35,
    fontWeight: 800,
    textAlign: 'center',
  },
  meta: {
    fontSize: 12,
    lineHeight: 1.3,
    fontWeight: 700,
    color: '#6d5338',
    textAlign: 'center',
  },
  statusText: {
    minHeight: 18,
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 800,
    textAlign: 'center',
  },
  verifyButton: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    border: '3px solid #5C3A21',
    background: 'linear-gradient(180deg, #ffe066, #e6b800)',
    color: '#2e1c10',
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 0,
    cursor: 'pointer',
    boxShadow: '0 4px 0 #8a5a1d, 0 7px 12px rgba(0,0,0,0.22)',
  },
  verifiedButton: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    border: '3px solid #3c6b2c',
    background: 'linear-gradient(180deg, #a9ef8f, #55b84d)',
    color: '#102d13',
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 0,
    cursor: 'default',
    boxShadow: '0 4px 0 #2e702c, 0 7px 12px rgba(0,0,0,0.18)',
  },
};
