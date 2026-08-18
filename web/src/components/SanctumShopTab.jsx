import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useOptionalPrivy } from './PrivyAuthProvider';
import { pickPrivySolanaWallet } from '../lib/privySolanaWallet';
import {
  claimClashSolGold,
  createClashSolOrder,
  createClashSolWalletAuthProof,
  decodeSanctumTransaction,
  executeClashSolOrder,
  formatTokenAtomics,
  getClashSolBalances,
  getClashSolHistory,
  getClashSolRewardStatus,
  getClashSolStatus,
  linkClashSolRewardWallet,
  serializeSignedSanctumTransaction,
} from '../lib/sanctumLst';
import './SanctumShopTab.css';

const SOLSCAN_TOKEN_URL = 'https://solscan.io/token/';
const SANCTUM_EXPLORE_URL = 'https://app.sanctum.so/explore/clashSOL';

function shortAddress(value) {
  const text = String(value || '');
  return text.length > 13 ? `${text.slice(0, 5)}…${text.slice(-5)}` : text;
}

function displayApy(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '—';
  return `${(number <= 1 ? number * 100 : number).toFixed(2)}%`;
}

function displayNumber(value, maximumFractionDigits = 4) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString(undefined, { maximumFractionDigits })
    : '0';
}

function displayDate(value) {
  if (!value) return 'Pending';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return String(value);
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function spendableAtomics(balances, direction) {
  const raw = BigInt(direction === 'stake' ? balances?.sol_atomics || '0' : balances?.clashsol_atomics || '0');
  const reserve = direction === 'stake' ? 10_000_000n : 0n;
  return raw > reserve ? raw - reserve : 0n;
}

function atomicsInput(value) {
  return formatTokenAtomics(String(value), 9, 9);
}

function rewardBalance(reward) {
  return formatTokenAtomics(
    reward?.today?.minimum_balance_atomics || reward?.today?.balance_atomics || '0',
    reward?.today?.token_decimals || 9,
    4,
  );
}

function historyTitle(item) {
  if (item.type === 'gold') return `${displayNumber(item.reward_gold, 0)} Gold`;
  return item.direction === 'unstake' ? 'clashSOL → SOL' : 'SOL → clashSOL';
}

function historyMeta(item) {
  if (item.type === 'gold') {
    return `${item.reward_day_utc || ''} · ${item.status || 'pending'} · ${formatTokenAtomics(item.balance_atomics, item.token_decimals || 9, 4)} clashSOL`;
  }
  const input = formatTokenAtomics(item.input_amount, 9, 5);
  const output = formatTokenAtomics(item.output_amount, 9, 5);
  return `${input} → ${output} · ${item.status || 'pending'}`;
}

export default function SanctumShopTab({
  solWallet,
  solAddress,
  onConnect,
  sessionToken,
  onClaimReadyChange,
  onResourcesChanged,
}) {
  const adapterWallet = useWallet();
  const privy = useOptionalPrivy();
  const [section, setSection] = useState('swap');
  const [direction, setDirection] = useState('stake');
  const [amount, setAmount] = useState('0.1');
  const [status, setStatus] = useState(null);
  const [reward, setReward] = useState(null);
  const [balances, setBalances] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [order, setOrder] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const privyWallet = useMemo(() => pickPrivySolanaWallet(privy), [privy]);
  const walletAddress = solAddress || solWallet?.publicKey?.toBase58?.() || '';
  const busy = ['loading', 'loading-history', 'quoting', 'signing', 'submitting', 'linking', 'claiming'].includes(phase);
  const available = status?.available === true;
  const pendingGold = Number(reward?.pending_gold || 0);
  const rewardRate = Number(reward?.settings?.current?.gold_per_clashsol ?? 2000);
  const rewardsEnabled = reward?.settings?.current?.enabled !== false;
  const claimableNow = Number(reward?.claimable_now || 0);
  const isLinkedWallet = reward?.linked && reward?.wallet === walletAddress;

  useEffect(() => {
    onClaimReadyChange?.(pendingGold > 0);
  }, [onClaimReadyChange, pendingGold]);

  const loadData = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!quiet) setPhase('loading');
    setError('');
    try {
      const [statusResult, rewardResult, historyResult, balanceResult] = await Promise.allSettled([
        getClashSolStatus({ signal }),
        sessionToken
          ? getClashSolRewardStatus({ wallet: walletAddress, token: sessionToken, signal })
          : Promise.resolve(null),
        sessionToken
          ? getClashSolHistory({ token: sessionToken, signal })
          : Promise.resolve({ items: [] }),
        sessionToken && walletAddress
          ? getClashSolBalances({ wallet: walletAddress, token: sessionToken, signal })
          : Promise.resolve(null),
      ]);
      if (statusResult.status === 'fulfilled') setStatus(statusResult.value);
      if (rewardResult.status === 'fulfilled') setReward(rewardResult.value);
      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value?.items || []);
        setHistoryCursor(historyResult.value?.next_cursor ?? null);
      }
      if (balanceResult.status === 'fulfilled') setBalances(balanceResult.value);
      const failed = [statusResult, rewardResult, historyResult, balanceResult].find((result) => result.status === 'rejected');
      if (failed && failed.reason?.name !== 'AbortError') {
        setError(failed.reason?.message || 'Some clashSOL data could not be refreshed');
      }
      if (!quiet) setPhase('idle');
    } catch (loadError) {
      if (loadError?.name === 'AbortError') return;
      setError(loadError?.message || 'Could not load clashSOL');
      if (!quiet) setPhase('idle');
    }
  }, [sessionToken, walletAddress]);

  useEffect(() => {
    const controller = new AbortController();
    loadData({ signal: controller.signal });
    return () => controller.abort();
  }, [loadData]);

  const loadOlderHistory = useCallback(async () => {
    if (historyCursor == null || !sessionToken || busy) return;
    setPhase('loading-history');
    setError('');
    try {
      const page = await getClashSolHistory({ token: sessionToken, cursor: historyCursor });
      setHistory((items) => items.concat(page?.items || []));
      setHistoryCursor(page?.next_cursor ?? null);
      setPhase('idle');
    } catch (historyError) {
      setPhase('idle');
      setError(historyError?.message || 'Could not load older clashSOL activity');
    }
  }, [busy, historyCursor, sessionToken]);

  useEffect(() => {
    setOrder(null);
    setNotice('');
    setError('');
    if (!busy) setPhase('idle');
  // A quote is bound to its exact input, direction, and signer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, direction, walletAddress]);

  const connect = useCallback(() => {
    onConnect?.();
  }, [onConnect]);

  const reviewSwap = useCallback(async () => {
    if (!walletAddress || !solWallet?.signTransaction) {
      connect();
      return;
    }
    if (!sessionToken) {
      setError('Game session is not ready. Reopen the shop and try again.');
      return;
    }
    setError('');
    setNotice('');
    setPhase('quoting');
    try {
      const next = await createClashSolOrder({
        wallet: walletAddress,
        amount,
        direction,
        slippageBps: 30,
        token: sessionToken,
      });
      setOrder(next);
      setPhase('review');
    } catch (swapError) {
      setPhase('idle');
      setError(swapError?.message || 'Could not create the Sanctum quote');
    }
  }, [amount, connect, direction, sessionToken, solWallet, walletAddress]);

  const executeSwap = useCallback(async () => {
    if (!order || !solWallet?.signTransaction) return;
    if (Number(order.expiresAtMs) <= Date.now()) {
      setOrder(null);
      setPhase('idle');
      setError('Quote expired. Request a fresh quote.');
      return;
    }
    setError('');
    setPhase('signing');
    try {
      const unsigned = decodeSanctumTransaction(order.transaction);
      const signed = await solWallet.signTransaction(unsigned);
      setPhase('submitting');
      const result = await executeClashSolOrder({
        orderId: order.orderId,
        signedTransaction: serializeSignedSanctumTransaction(signed),
        token: sessionToken,
      });
      setOrder(null);
      setPhase('idle');
      setNotice(`Swap submitted · ${shortAddress(result.signature)}`);
      await loadData({ quiet: true });
    } catch (swapError) {
      setPhase('review');
      const rejected = /reject|declin|cancel/i.test(String(swapError?.message || ''));
      setError(rejected ? 'Transaction was cancelled in the wallet.' : (swapError?.message || 'Could not submit the swap'));
    }
  }, [loadData, order, sessionToken, solWallet]);

  const signRewardMessage = useCallback(async (messageBytes) => {
    const adapterAddress = adapterWallet?.publicKey?.toBase58?.() || '';
    if (adapterAddress === walletAddress && typeof adapterWallet?.signMessage === 'function') {
      return adapterWallet.signMessage(messageBytes);
    }
    if (privyWallet?.address === walletAddress && typeof privy.solanaSignMessage === 'function') {
      const result = await privy.solanaSignMessage({ message: messageBytes, wallet: privyWallet });
      return result?.signature || result;
    }
    if (typeof solWallet?.signMessage === 'function') return solWallet.signMessage(messageBytes);
    throw new Error('This wallet cannot sign the reward-link message');
  }, [adapterWallet, privy, privyWallet, solWallet, walletAddress]);

  const linkWallet = useCallback(async () => {
    if (!walletAddress) {
      connect();
      return;
    }
    if (!sessionToken) {
      setError('Game session is not ready.');
      return;
    }
    setError('');
    setNotice('');
    setPhase('linking');
    try {
      const authProof = await createClashSolWalletAuthProof({ wallet: walletAddress, signMessage: signRewardMessage });
      const result = await linkClashSolRewardWallet({ wallet: walletAddress, authProof, token: sessionToken });
      setReward(result.reward);
      setPhase('idle');
      setNotice('Wallet linked. Balance observations begin with the next scheduled sample.');
      await loadData({ quiet: true });
    } catch (linkError) {
      setPhase('idle');
      setError(linkError?.message || 'Could not link this wallet');
    }
  }, [connect, loadData, sessionToken, signRewardMessage, walletAddress]);

  const claimGold = useCallback(async () => {
    if (!sessionToken || !walletAddress) return;
    setError('');
    setNotice('');
    setPhase('claiming');
    try {
      const result = await claimClashSolGold({ wallet: walletAddress, token: sessionToken });
      if (result.resources) {
        window.onGodotMessage?.({ action: 'resources', data: result.resources });
        try {
          window.godotBridge?.(JSON.stringify({ action: 'set_resources', data: result.resources }));
        } catch { /* Godot bridge may be absent in browser-only mode. */ }
        onResourcesChanged?.(result.resources, Number(result.claimed_gold || 0));
      }
      setReward(result.reward);
      setPhase('idle');
      setNotice(`${displayNumber(result.claimed_gold, 0)} Gold claimed.${Number(result.pending_remaining || 0) > 0 ? ` ${displayNumber(result.pending_remaining, 0)} Gold remains safely banked.` : ''}`);
      await loadData({ quiet: true });
    } catch (claimError) {
      setPhase('idle');
      setError(claimError?.message || 'Could not claim Gold');
    }
  }, [loadData, onResourcesChanged, sessionToken, walletAddress]);

  const apy = displayApy(status?.apy);
  const inputSymbol = direction === 'stake' ? 'SOL' : 'clashSOL';
  const outputSymbol = direction === 'stake' ? 'clashSOL' : 'SOL';
  const availableInputAtomics = spendableAtomics(balances, direction);
  const availableInput = atomicsInput(availableInputAtomics);

  return (
    <section className="sanctum-shop" aria-label="clashSOL liquid staking and rewards">
      <header className="sanctum-shop__hero">
        <div className="sanctum-shop__logo-wrap" aria-hidden="true">
          <div className="sanctum-shop__halo" />
          <img
            className="sanctum-shop__logo"
            src={status?.logoUri || '/icons/clashsol-fallback.svg'}
            alt=""
            onError={(event) => { event.currentTarget.src = '/icons/clashsol-fallback.svg'; }}
          />
        </div>
        <div className="sanctum-shop__hero-copy">
          <span className="sanctum-shop__eyebrow">POWERED BY SANCTUM</span>
          <h2>Stake SOL. Earn yield. Claim Gold.</h2>
          <p>Swap to the live Clash community LST and earn a daily in-game holder reward.</p>
        </div>
        {status?.mint && (
          <a className="sanctum-shop__external" href={`${SOLSCAN_TOKEN_URL}${status.mint}`} target="_blank" rel="noreferrer">
            {shortAddress(status.mint)} ↗
          </a>
        )}
      </header>

      <div className="sanctum-shop__metrics" aria-label="clashSOL metrics">
        <div><span>Last epoch APY</span><strong>{apy}</strong></div>
        <div><span>Snapshot clashSOL</span><strong>{rewardBalance(reward)}</strong></div>
        <div><span>Gold ready</span><strong>{displayNumber(pendingGold, 0)}</strong></div>
        <div><span>Daily Gold rate</span><strong>{rewardsEnabled ? `${displayNumber(rewardRate, 0)} / 1` : 'Paused'}</strong></div>
      </div>

      <nav className="sanctum-shop__nav" aria-label="clashSOL sections" role="tablist">
        {[
          ['swap', 'Swap'],
          ['rewards', 'Daily Gold'],
          ['history', 'History'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={section === id ? 'is-active' : ''}
            onClick={() => setSection(id)}
            role="tab"
            aria-selected={section === id}
          >
            {label}
            {id === 'rewards' && pendingGold > 0 && <span className="sanctum-shop__claim-dot">CLAIM</span>}
          </button>
        ))}
      </nav>

      {status?.degraded && (
        <div className="sanctum-shop__state">Live APY metadata is delayed. Swaps will retry Sanctum when you request a quote; rewards and history remain available.</div>
      )}

      {!status && phase === 'loading' && <div className="sanctum-shop__state">Loading live clashSOL data…</div>}
      {status && !available && <div className="sanctum-shop__state">clashSOL swaps are temporarily unavailable. Your reward history remains safe.</div>}

      {section === 'swap' && available && (
        <div className="sanctum-shop__content">
          <div className="sanctum-shop__direction" aria-label="Swap direction">
            <button type="button" aria-pressed={direction === 'stake'} className={direction === 'stake' ? 'is-active' : ''} onClick={() => setDirection('stake')}>SOL → clashSOL</button>
            <button type="button" aria-pressed={direction === 'unstake'} className={direction === 'unstake' ? 'is-active' : ''} onClick={() => setDirection('unstake')}>clashSOL → SOL</button>
          </div>
          <label className="sanctum-shop__field">
            <span>You pay · available {availableInput} {inputSymbol}{direction === 'stake' ? ' after 0.01 SOL fee reserve' : ''}</span>
            <div>
              <input
                value={amount}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  if (/^\d*(?:\.\d{0,9})?$/.test(next)) setAmount(next);
                }}
                inputMode="decimal"
                autoComplete="off"
                disabled={busy}
                aria-label={`${inputSymbol} amount`}
              />
              <b><img src={inputSymbol === 'SOL' ? '/tokens/SOL.svg' : (status?.logoUri || '/icons/icon-192.png')} alt="" />{inputSymbol}</b>
            </div>
          </label>
          <div className="sanctum-shop__presets">
            {[25, 50, 75, 100].map((percent) => (
              <button
                key={percent}
                type="button"
                disabled={busy || availableInputAtomics <= 0n}
                onClick={() => setAmount(atomicsInput((availableInputAtomics * BigInt(percent)) / 100n))}
              >
                {percent === 100 ? 'MAX' : `${percent}%`}
              </button>
            ))}
          </div>
          {order && (
            <div className="sanctum-shop__quote">
              <div><span>You receive</span><strong>≈ {formatTokenAtomics(order.outputAmount)} {outputSymbol}</strong></div>
              <div><span>Slippage floor</span><strong>≈ {formatTokenAtomics((BigInt(order.outputAmount) * BigInt(10_000 - Number(order.slippageBps))) / 10_000n)} {outputSymbol}</strong></div>
              <div><span>Route</span><strong>{order.route}</strong></div>
              <div><span>Max slippage</span><strong>{(Number(order.slippageBps) / 100).toFixed(2)}%</strong></div>
            </div>
          )}
          {!walletAddress ? (
            <div className="sanctum-shop__wallet-actions">
              <button type="button" className="sanctum-shop__primary" onClick={connect}>Connect Solana wallet</button>
              {privy.enabled && !privy.authenticated && (
                <button type="button" className="sanctum-shop__secondary" onClick={() => privy.login?.()}>Use email wallet</button>
              )}
            </div>
          ) : order ? (
            <button type="button" className="sanctum-shop__primary" disabled={busy} onClick={executeSwap}>
              {phase === 'signing' ? 'Confirm in wallet…' : phase === 'submitting' ? 'Submitting…' : `Swap for ${outputSymbol}`}
            </button>
          ) : (
            <button type="button" className="sanctum-shop__primary" disabled={busy || !amount || Number(amount) <= 0} onClick={reviewSwap}>
              {phase === 'quoting' ? 'Getting live quote…' : 'Review swap'}
            </button>
          )}
          <p className="sanctum-shop__disclosure">The exchange rate and output are quoted by Sanctum. Your wallet signs the reviewed transaction; Clash never receives your private key.</p>
        </div>
      )}

      {section === 'rewards' && (
        <div className="sanctum-shop__content">
          {!rewardsEnabled && <div className="sanctum-shop__state">Daily Gold accrual is paused. Existing matured rewards remain safe and claimable.</div>}
          <div className={`sanctum-shop__reward-card${pendingGold > 0 ? '' : ' is-empty'}`}>
            <span>Ready to claim</span>
            <strong>{displayNumber(pendingGold, 0)} Gold</strong>
            <small>{reward?.pending_days || 0} eligible day{Number(reward?.pending_days || 0) === 1 ? '' : 's'}</small>
          </div>
          {!walletAddress ? (
            <div className="sanctum-shop__wallet-actions">
              <button type="button" className="sanctum-shop__primary" onClick={connect}>Connect holder wallet</button>
              {privy.enabled && !privy.authenticated && (
                <button type="button" className="sanctum-shop__secondary" onClick={() => privy.login?.()}>Use email wallet</button>
              )}
            </div>
          ) : !isLinkedWallet ? (
            <button type="button" className="sanctum-shop__primary" disabled={busy} onClick={linkWallet}>
              {phase === 'linking' ? 'Confirm wallet link…' : 'Link wallet for daily Gold'}
            </button>
          ) : (
            <button type="button" className="sanctum-shop__primary" disabled={busy || claimableNow <= 0} onClick={claimGold}>
              {phase === 'claiming' ? 'Claiming…' : claimableNow > 0 ? `Claim ${displayNumber(claimableNow, 0)} Gold` : pendingGold > 0 ? 'Make room in Gold storage' : 'No matured Gold yet'}
            </button>
          )}
          <div className="sanctum-shop__reward-facts">
            <div><span>Snapshot balance</span><strong>{rewardBalance(reward)} clashSOL</strong></div>
            <div><span>Next snapshot</span><strong>{displayDate(reward?.next_snapshot_at)}</strong></div>
            <div><span>Linked wallet</span><strong>{reward?.wallet ? shortAddress(reward.wallet) : 'Not linked'}</strong></div>
          </div>
          <p className="sanctum-shop__disclosure">Gold is an in-game loyalty reward with no cash value and is separate from variable staking yield. Hold clashSOL today; Gold is calculated tomorrow from the lowest balance observed across the UTC day. If storage is short, you claim what fits and the rest stays ready.</p>
        </div>
      )}

      {section === 'history' && (
        <div className="sanctum-shop__content">
          <div className="sanctum-shop__history" aria-live="polite">
            {history.length ? history.map((item) => (
              <div className="sanctum-shop__history-row" key={`${item.type}-${item.id}`}>
                <span className={`sanctum-shop__history-icon is-${item.type}`} aria-hidden="true">{item.type === 'gold' ? 'G' : '↔'}</span>
                <div><strong>{historyTitle(item)}</strong><small>{historyMeta(item)}</small></div>
                <time>{displayDate(item.claimed_at || item.consumed_at || item.created_at)}</time>
              </div>
            )) : <div className="sanctum-shop__state">No clashSOL activity yet.</div>}
          </div>
          {historyCursor != null && (
            <button type="button" className="sanctum-shop__secondary" disabled={phase === 'loading-history'} onClick={loadOlderHistory}>
              {phase === 'loading-history' ? 'Loading…' : 'Load older activity'}
            </button>
          )}
          <a className="sanctum-shop__secondary" href={SANCTUM_EXPLORE_URL} target="_blank" rel="noreferrer">Open clashSOL on Sanctum ↗</a>
        </div>
      )}

      {notice && <div className="sanctum-shop__notice" role="status">{notice}</div>}
      {error && <div className="sanctum-shop__error" role="alert">{error}</div>}
    </section>
  );
}
