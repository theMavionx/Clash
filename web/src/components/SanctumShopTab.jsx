import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  getClashSolActiveOrder,
  getClashSolBalances,
  getClashSolHistory,
  getClashSolOrderStatus,
  getClashSolRewardStatus,
  getClashSolStatus,
  linkClashSolRewardWallet,
  serializeSignedSanctumTransaction,
} from '../lib/sanctumLst';
import './SanctumShopTab.css';

const SOLSCAN_TOKEN_URL = 'https://solscan.io/token/';
const SANCTUM_EXPLORE_URL = 'https://app.sanctum.so/explore/clashSOL';
const ACTIVE_SWAP_KEY = 'clash:sanctum:active-swap:';
const SWAP_TERMINAL_STATES = new Set(['success', 'failed_before_broadcast', 'failed_on_chain', 'expired']);
const SWAP_POLL_STATES = new Set(['broadcasting', 'submission_unknown', 'submitted', 'confirming']);
const BALANCE_REFRESH_TIMEOUT_MS = 20_000;

const SWAP_STEPS = [
  { id: 'wallet', label: 'Confirm in wallet', hint: 'Review and sign the exact swap.' },
  { id: 'submit', label: 'Submit to Solana', hint: 'Sanctum broadcasts the signed transaction.' },
  { id: 'confirm', label: 'Confirm on-chain', hint: 'Wait for Solana confirmation.' },
  { id: 'balance', label: 'Update balances', hint: 'Refresh SOL and clashSOL in Clash.' },
];

function progressRank(state) {
  if (['wallet_prompt'].includes(state)) return 0;
  if (['signed', 'broadcasting', 'submission_unknown'].includes(state)) return 1;
  if (['submitted', 'confirming'].includes(state)) return 2;
  if (['refreshing'].includes(state)) return 3;
  if (state === 'success') return 4;
  return -1;
}

function failedProgressRank(progress) {
  const stage = String(progress?.error?.stage || progress?.stage || '');
  if (stage === 'wallet_signature' || stage === 'quote') return 0;
  if (stage === 'on_chain') return 2;
  if (stage === 'balance_refresh') return 3;
  return 1;
}

function swapProgressMessage(progress) {
  if (!progress) return '';
  if (progress.status === 'wallet_prompt') return 'Approve the reviewed transaction in your Solana wallet.';
  if (progress.status === 'signed') return 'Signature received. Preparing the transaction for submission.';
  if (progress.status === 'broadcasting') return 'Sending your signed transaction through Sanctum.';
  if (progress.status === 'submission_unknown') return 'Clash is checking Solana for this transaction. Do not submit another swap.';
  if (['submitted', 'confirming'].includes(progress.status)) return 'Transaction submitted. Waiting for Solana confirmation.';
  if (progress.status === 'refreshing') return 'Confirmed on-chain. Updating the balances shown in Clash.';
  if (progress.status === 'success') {
    return progress.balanceRefreshDelayed
      ? 'The swap is confirmed. Balance indexing is taking longer than usual and will update automatically.'
      : 'The on-chain swap and balance refresh are complete.';
  }
  if (progress.status === 'expired') return 'No transaction was sent. Request a fresh quote to try again.';
  if (progress.status?.startsWith('failed')) return progress.error?.message || 'No new swap was sent.';
  return 'Swap status updated.';
}

function plainSwapError(error, fallback = 'The swap could not be completed.') {
  const code = String(error?.code || '').toUpperCase();
  if (/REJECT|DECLIN|CANCEL/.test(String(error?.message || ''))) return 'The signature request was cancelled in your wallet.';
  if (code === 'ORDER_EXPIRED') return 'This quote expired before it could be submitted.';
  if (['INVALID_SIGNATURE', 'INVALID_TRANSACTION', 'TRANSACTION_CHANGED'].includes(code)) {
    return 'The signed transaction did not match the quote. No swap was sent.';
  }
  if (code === 'WALLET_PRIORITY_FEE_TOO_HIGH') {
    return 'Your wallet proposed a priority fee above the 0.005 SOL safety limit. Lower it and request a fresh quote.';
  }
  if (code === 'WALLET_PRIORITY_FEE_UNSAFE') {
    return 'Your wallet added unsupported fee settings. No swap was sent; request a fresh quote.';
  }
  if (code === 'ONCHAIN_FAILED') return 'Solana confirmed that this transaction failed on-chain.';
  if (['UPSTREAM_TIMEOUT', 'UPSTREAM_UNAVAILABLE', 'CONFIRMATION_UNAVAILABLE'].includes(code)) {
    return 'Submission status is uncertain. Do not send another swap while Clash checks Solana.';
  }
  return error?.message || fallback;
}

function errorDetails(error, fallbackStage = 'unknown') {
  if (!error) return null;
  return {
    message: plainSwapError(error),
    technicalMessage: error?.message || null,
    code: error?.code || 'SWAP_FAILED',
    stage: error?.stage || fallbackStage,
    httpStatus: error?.status || null,
    retryable: error?.retryable === true,
    details: error?.details || null,
  };
}

function progressFromServer(serverOrder, current = {}) {
  const serverStatus = String(serverOrder?.status || '').toLowerCase();
  let status = current.status || 'wallet_prompt';
  if (serverStatus === 'pending') {
    status = ['signed', 'failed_before_broadcast'].includes(current.status) ? current.status : 'wallet_prompt';
  }
  else if (serverStatus === 'executing') status = 'broadcasting';
  else if (serverStatus === 'submission_unknown') status = 'submission_unknown';
  else if (serverStatus === 'submitted') status = 'confirming';
  else if (serverStatus === 'confirmed') status = 'refreshing';
  else if (serverStatus === 'expired') status = 'expired';
  else if (serverStatus === 'failed') status = serverOrder?.error?.stage === 'on_chain' ? 'failed_on_chain' : 'failed_before_broadcast';
  return {
    ...current,
    ...serverOrder,
    status,
    signature: serverOrder?.signature || serverOrder?.txSignature || current.signature || null,
    explorerUrl: serverOrder?.explorerUrl || current.explorerUrl || null,
    error: serverOrder?.error
      ? errorDetails(serverOrder.error, serverOrder.stage)
      : (serverStatus === 'pending' && current.status === 'failed_before_broadcast' ? current.error || null : null),
  };
}

function balanceField(balances, direction, side) {
  const output = side === 'output';
  const clashSol = direction === 'stake' ? output : !output;
  return String(clashSol ? balances?.clashsol_atomics || '0' : balances?.sol_atomics || '0');
}

function positiveBalanceDelta(beforeBalances, afterBalances, direction) {
  if (!beforeBalances || !afterBalances) return null;
  try {
    const before = BigInt(balanceField(beforeBalances, direction, 'output'));
    const after = BigInt(balanceField(afterBalances, direction, 'output'));
    return after > before ? after - before : null;
  } catch {
    return null;
  }
}

function resumableOrderSummary(order) {
  if (!order?.orderId) return null;
  return {
    orderId: order.orderId,
    expiresAtMs: order.expiresAtMs,
    inputMint: order.inputMint,
    outputMint: order.outputMint,
    inputAmount: order.inputAmount,
    outputAmount: order.outputAmount,
    slippageBps: order.slippageBps,
    route: order.route,
  };
}

function keepFocusInsideDialog(event) {
  if (event.key !== 'Tab') return;
  const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('hidden'));
  if (!focusable.length) {
    event.preventDefault();
    event.currentTarget.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

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
  const [swapProgress, setSwapProgress] = useState(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const progressDialogRef = useRef(null);
  const progressTriggerRef = useRef(null);
  const balanceRefreshStartedRef = useRef(0);

  const privyWallet = useMemo(() => pickPrivySolanaWallet(privy), [privy]);
  const walletAddress = solAddress || solWallet?.publicKey?.toBase58?.() || '';
  const busy = ['loading', 'loading-history', 'quoting', 'signing', 'submitting', 'linking', 'claiming'].includes(phase);
  const available = status?.available === true;
  const pendingGold = Number(reward?.pending_gold || 0);
  const rewardRate = Number(reward?.settings?.current?.gold_per_clashsol ?? 2000);
  const rewardsEnabled = reward?.settings?.current?.enabled !== false;
  const claimableNow = Number(reward?.claimable_now || 0);
  const isLinkedWallet = reward?.linked && reward?.wallet === walletAddress;
  const activeSwapStorageKey = walletAddress ? `${ACTIVE_SWAP_KEY}${walletAddress}` : '';
  const activeProgressOrderId = swapProgress?.orderId || '';
  const activeProgressStatus = swapProgress?.status || '';
  const activeProgressDirection = swapProgress?.direction || 'stake';
  const activeProgressBalanceBefore = swapProgress?.balanceBefore || null;
  const activeProgressWallet = swapProgress?.wallet || walletAddress;
  const activeSwapNonTerminal = !!swapProgress && !SWAP_TERMINAL_STATES.has(activeProgressStatus);
  const swapControlsDisabled = busy || activeSwapNonTerminal;

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
      return {
        balances: balanceResult.status === 'fulfilled' ? balanceResult.value : null,
        reward: rewardResult.status === 'fulfilled' ? rewardResult.value : null,
      };
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

  const discardQuote = useCallback(() => {
    setOrder(null);
    setNotice('');
    setError('');
    if (!busy) setPhase('idle');
  }, [busy]);

  const connect = useCallback(() => {
    onConnect?.();
  }, [onConnect]);

  const clearSwapProgress = useCallback(() => {
    if (activeSwapStorageKey) localStorage.removeItem(activeSwapStorageKey);
    setSwapProgress(null);
    setProgressOpen(false);
    balanceRefreshStartedRef.current = 0;
    window.requestAnimationFrame(() => progressTriggerRef.current?.focus?.());
  }, [activeSwapStorageKey]);

  useEffect(() => {
    if (!activeSwapStorageKey || !swapProgress || swapProgress.wallet !== walletAddress) return;
    localStorage.setItem(activeSwapStorageKey, JSON.stringify({
      wallet: walletAddress,
      order: resumableOrderSummary(order),
      progress: swapProgress,
    }));
  }, [activeSwapStorageKey, order, swapProgress, walletAddress]);

  useEffect(() => {
    if (!activeSwapStorageKey || !sessionToken) return undefined;
    let stored;
    try { stored = JSON.parse(localStorage.getItem(activeSwapStorageKey) || 'null'); } catch { stored = null; }
    if (!stored?.progress?.orderId || stored.wallet !== walletAddress) {
      setSwapProgress(null);
      setProgressOpen(false);
      const controller = new AbortController();
      getClashSolActiveOrder({ token: sessionToken, signal: controller.signal })
        .then(({ order: activeOrder } = {}) => {
          if (!activeOrder?.orderId) return;
          const recovered = progressFromServer(activeOrder, {
            orderId: activeOrder.orderId,
            direction: activeOrder.direction || 'stake',
            inputAmount: activeOrder.inputAmount,
            quotedOutputAmount: activeOrder.quotedOutputAmount,
            wallet: activeOrder.wallet,
          });
          setOrder(null);
          setSwapProgress(recovered);
          setProgressOpen(true);
          setDirection(recovered.direction || 'stake');
          if (recovered.inputAmount) setAmount(formatTokenAtomics(recovered.inputAmount, 9, 9));
        })
        .catch((restoreError) => {
          if (restoreError?.name !== 'AbortError') setError(restoreError?.message || 'Could not restore the active swap');
        });
      return () => controller.abort();
    }
    setOrder(null);
    setSwapProgress(stored.progress);
    setProgressOpen(true);
    if (stored.progress?.direction) setDirection(stored.progress.direction);
    if (stored.order?.inputAmount) setAmount(formatTokenAtomics(stored.order.inputAmount, 9, 9));
    const controller = new AbortController();
    getClashSolOrderStatus({ orderId: stored.progress.orderId, token: sessionToken, signal: controller.signal })
      .then((serverOrder) => setSwapProgress((current) => {
        const next = progressFromServer(serverOrder, current || stored.progress);
        if (String(serverOrder?.status || '').toLowerCase() === 'pending') {
          return {
            ...next,
            status: 'failed_before_broadcast',
            error: errorDetails({
              code: 'FRESH_QUOTE_REQUIRED',
              message: 'This unsigned quote was not stored after reload. No transaction was sent; request a fresh quote.',
              stage: 'quote',
            }, 'quote'),
          };
        }
        return next;
      }))
      .catch((restoreError) => {
        if (restoreError?.name === 'AbortError') return;
        setSwapProgress((current) => ({
          ...(current || stored.progress),
          status: 'failed_before_broadcast',
          error: errorDetails(restoreError, 'restore'),
        }));
      });
    return () => controller.abort();
  }, [activeSwapStorageKey, sessionToken, walletAddress]);

  useEffect(() => {
    if (!progressOpen || !activeProgressOrderId) return undefined;
    const previous = document.activeElement;
    window.requestAnimationFrame(() => progressDialogRef.current?.focus?.());
    return () => previous?.focus?.();
  }, [activeProgressOrderId, progressOpen]);

  useEffect(() => {
    if (!sessionToken || !activeProgressOrderId || !SWAP_POLL_STATES.has(activeProgressStatus)) return undefined;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const serverOrder = await getClashSolOrderStatus({ orderId: activeProgressOrderId, token: sessionToken });
        if (cancelled) return;
        setSwapProgress((current) => progressFromServer(serverOrder, current || { orderId: activeProgressOrderId, status: activeProgressStatus }));
      } catch (pollError) {
        if (cancelled || pollError?.name === 'AbortError') return;
        setSwapProgress((current) => ({
          ...(current || { orderId: activeProgressOrderId, status: activeProgressStatus }),
          status: 'submission_unknown',
          error: errorDetails({ ...pollError, retryable: true }, 'reconciliation'),
        }));
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 2200);
      }
    };
    timer = window.setTimeout(poll, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeProgressOrderId, activeProgressStatus, sessionToken]);

  useEffect(() => {
    if (activeProgressStatus !== 'refreshing' || !activeProgressWallet || !sessionToken) return undefined;
    let cancelled = false;
    let timer = 0;
    if (!balanceRefreshStartedRef.current) balanceRefreshStartedRef.current = Date.now();
    const refresh = async () => {
      try {
        const nextBalances = await getClashSolBalances({ wallet: activeProgressWallet, token: sessionToken });
        if (cancelled) return;
        setBalances(nextBalances);
        const before = BigInt(balanceField(activeProgressBalanceBefore, activeProgressDirection, 'output'));
        const after = BigInt(balanceField(nextBalances, activeProgressDirection, 'output'));
        const changed = !!activeProgressBalanceBefore && after > before;
        const timedOut = Date.now() - balanceRefreshStartedRef.current >= BALANCE_REFRESH_TIMEOUT_MS;
        if (changed || timedOut) {
          setSwapProgress((current) => ({
            ...current,
            status: 'success',
            balanceAfter: nextBalances,
            balanceRefreshDelayed: !changed,
          }));
          await loadData({ quiet: true });
          return;
        }
        timer = window.setTimeout(refresh, 1800);
      } catch (refreshError) {
        if (cancelled) return;
        const timedOut = Date.now() - balanceRefreshStartedRef.current >= BALANCE_REFRESH_TIMEOUT_MS;
        if (timedOut) {
          setSwapProgress((current) => ({
            ...current,
            status: 'success',
            balanceRefreshDelayed: true,
            balanceRefreshError: refreshError?.message || 'Balance refresh is delayed',
          }));
        } else {
          timer = window.setTimeout(refresh, 2200);
        }
      }
    };
    refresh();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeProgressBalanceBefore, activeProgressDirection, activeProgressStatus, activeProgressWallet, loadData, sessionToken]);

  const reviewSwap = useCallback(async () => {
    if (activeSwapNonTerminal) {
      setProgressOpen(true);
      return;
    }
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
  }, [activeSwapNonTerminal, amount, connect, direction, sessionToken, solWallet, walletAddress]);

  const executeSwap = useCallback(async () => {
    if (!order || !solWallet?.signTransaction) return;
    if (Number(order.expiresAtMs) <= Date.now()) {
      setOrder(null);
      setPhase('idle');
      setError('Quote expired. Request a fresh quote.');
      return;
    }
    setError('');
    setNotice('');
    progressTriggerRef.current = document.activeElement;
    const initialProgress = {
      orderId: order.orderId,
      wallet: walletAddress,
      status: 'wallet_prompt',
      stage: 'wallet_signature',
      direction,
      inputAmount: order.inputAmount,
      quotedOutputAmount: order.outputAmount,
      expiresAtMs: order.expiresAtMs,
      route: order.route,
      balanceBefore: balances,
      signature: null,
      explorerUrl: null,
      error: null,
    };
    setSwapProgress(initialProgress);
    setProgressOpen(true);
    setPhase('signing');
    try {
      const unsigned = decodeSanctumTransaction(order.transaction);
      const signed = await solWallet.signTransaction(unsigned);
      setSwapProgress((current) => ({ ...current, status: 'signed', stage: 'broadcast' }));
      setPhase('submitting');
      setSwapProgress((current) => ({ ...current, status: 'broadcasting', stage: 'broadcast' }));
      const result = await executeClashSolOrder({
        orderId: order.orderId,
        signedTransaction: serializeSignedSanctumTransaction(signed),
        token: sessionToken,
      });
      setPhase('idle');
      setSwapProgress((current) => progressFromServer(result, current || initialProgress));
    } catch (swapError) {
      const rejected = /reject|declin|cancel/i.test(String(swapError?.message || ''));
      setPhase('idle');
      if (rejected) {
        setSwapProgress((current) => ({
          ...(current || initialProgress),
          status: 'failed_before_broadcast',
          error: errorDetails({ ...swapError, message: 'The signature request was cancelled in your wallet.' }, 'wallet_signature'),
        }));
        return;
      }
      try {
        const serverOrder = await getClashSolOrderStatus({ orderId: order.orderId, token: sessionToken });
        setSwapProgress((current) => {
          const reconciled = progressFromServer(serverOrder, current || initialProgress);
          if (reconciled.status === 'wallet_prompt') {
            return {
              ...reconciled,
              status: 'failed_before_broadcast',
              error: errorDetails(swapError, 'broadcast'),
            };
          }
          return reconciled;
        });
      } catch {
        const uncertain = ['UPSTREAM_TIMEOUT', 'UPSTREAM_UNAVAILABLE', 'CONFIRMATION_UNAVAILABLE'].includes(swapError?.code)
          || Number(swapError?.status) >= 500;
        setSwapProgress((current) => ({
          ...(current || initialProgress),
          status: uncertain ? 'submission_unknown' : 'failed_before_broadcast',
          error: errorDetails({ ...swapError, retryable: uncertain }, uncertain ? 'reconciliation' : 'broadcast'),
        }));
      }
    }
  }, [balances, direction, order, sessionToken, solWallet, walletAddress]);

  const requestFreshQuote = useCallback(async () => {
    clearSwapProgress();
    setOrder(null);
    setPhase('idle');
    await reviewSwap();
  }, [clearSwapProgress, reviewSwap]);

  const finishSwap = useCallback(() => {
    const signature = swapProgress?.signature;
    clearSwapProgress();
    setOrder(null);
    setPhase('idle');
    setNotice(signature ? `Swap confirmed · ${shortAddress(signature)}` : 'Swap complete.');
  }, [clearSwapProgress, swapProgress?.signature]);

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
  const swapProgressRank = progressRank(swapProgress?.status);
  const visibleProgressRank = swapProgressRank >= 0 ? swapProgressRank : failedProgressRank(swapProgress);
  const receivedAtomics = positiveBalanceDelta(swapProgress?.balanceBefore, swapProgress?.balanceAfter, swapProgress?.direction);
  const progressOutputSymbol = swapProgress?.direction === 'unstake' ? 'SOL' : 'clashSOL';
  const progressInputSymbol = swapProgress?.direction === 'unstake' ? 'clashSOL' : 'SOL';
  const progressTerminal = SWAP_TERMINAL_STATES.has(swapProgress?.status);
  const progressAnnouncement = swapProgressMessage(swapProgress);
  const minimizedProgressLabel = swapProgress?.status === 'success'
    ? 'Swap confirmed'
    : progressTerminal
      ? 'Swap needs attention'
      : swapProgress?.status === 'submission_unknown'
        ? 'Checking swap status'
        : 'Swap in progress';

  return (
    <section className="sanctum-shop" aria-label="clashSOL liquid staking and rewards">
      <div className="sanctum-shop__live-region" aria-live="polite" aria-atomic="true">{progressAnnouncement}</div>
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

      {swapProgress && !progressOpen && (
        <button
          type="button"
          className={`sanctum-swap-progress-chip${swapProgress.status === 'submission_unknown' ? ' is-warning' : ''}${progressTerminal ? ` is-terminal ${swapProgress.status === 'success' ? 'is-success' : 'is-error'}` : ''}`}
          onClick={() => setProgressOpen(true)}
          aria-label={`${minimizedProgressLabel}. Open swap details.`}
        >
          {!progressTerminal && swapProgress.status !== 'submission_unknown' && <span className="sanctum-swap-progress__spinner" aria-hidden="true" />}
          {swapProgress.status === 'submission_unknown' && <span className="sanctum-swap-progress-chip__mark" aria-hidden="true">?</span>}
          {progressTerminal && <span className="sanctum-swap-progress-chip__mark" aria-hidden="true">{swapProgress.status === 'success' ? '✓' : '!'}</span>}
          <span><strong>{minimizedProgressLabel}</strong><small>{shortAddress(swapProgress.signature || swapProgress.orderId)}</small></span>
          <span aria-hidden="true">Open</span>
        </button>
      )}

      {status?.degraded && (
        <div className="sanctum-shop__state">Live APY metadata is delayed. Swaps will retry Sanctum when you request a quote; rewards and history remain available.</div>
      )}

      {!status && phase === 'loading' && <div className="sanctum-shop__state">Loading live clashSOL data…</div>}
      {status && !available && <div className="sanctum-shop__state">clashSOL swaps are temporarily unavailable. Your reward history remains safe.</div>}

      {section === 'swap' && available && (
        <div className="sanctum-shop__content">
          <div className="sanctum-shop__direction" aria-label="Swap direction">
            <button type="button" disabled={swapControlsDisabled} aria-pressed={direction === 'stake'} className={direction === 'stake' ? 'is-active' : ''} onClick={() => { discardQuote(); setDirection('stake'); }}>SOL → clashSOL</button>
            <button type="button" disabled={swapControlsDisabled} aria-pressed={direction === 'unstake'} className={direction === 'unstake' ? 'is-active' : ''} onClick={() => { discardQuote(); setDirection('unstake'); }}>clashSOL → SOL</button>
          </div>
          <label className="sanctum-shop__field">
            <span>You pay · available {availableInput} {inputSymbol}{direction === 'stake' ? ' after 0.01 SOL fee reserve' : ''}</span>
            <div>
              <input
                value={amount}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  if (/^\d*(?:\.\d{0,9})?$/.test(next)) {
                    discardQuote();
                    setAmount(next);
                  }
                }}
                inputMode="decimal"
                autoComplete="off"
                disabled={swapControlsDisabled}
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
                disabled={swapControlsDisabled || availableInputAtomics <= 0n}
                onClick={() => {
                  discardQuote();
                  setAmount(atomicsInput((availableInputAtomics * BigInt(percent)) / 100n));
                }}
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
            <button type="button" className="sanctum-shop__primary" disabled={swapControlsDisabled} onClick={executeSwap}>
              {phase === 'signing' ? 'Confirm in wallet…' : phase === 'submitting' ? 'Submitting…' : `Swap for ${outputSymbol}`}
            </button>
          ) : (
            <button type="button" className="sanctum-shop__primary" disabled={swapControlsDisabled || !amount || Number(amount) <= 0} onClick={reviewSwap}>
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
                <div>
                  <strong>{historyTitle(item)}</strong>
                  <small>{historyMeta(item)}</small>
                  {item.last_error && (
                    <small className="sanctum-shop__history-error">{item.last_error} · {item.last_error_stage || 'unknown stage'}</small>
                  )}
                  {item.tx_signature && (
                    <a className="sanctum-shop__history-link" href={`https://solscan.io/tx/${item.tx_signature}`} target="_blank" rel="noreferrer">
                      View receipt ↗
                    </a>
                  )}
                </div>
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

      {progressOpen && swapProgress && (
        <div className="sanctum-swap-progress__backdrop" role="presentation">
          <div
            ref={progressDialogRef}
            className="sanctum-swap-progress"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sanctum-swap-progress-title"
            aria-describedby="sanctum-swap-progress-summary"
            tabIndex={-1}
            onKeyDown={(event) => {
              keepFocusInsideDialog(event);
              if (event.key === 'Escape' && progressTerminal) clearSwapProgress();
            }}
          >
            <header className="sanctum-swap-progress__header">
              <div>
                <span className="sanctum-shop__eyebrow">SANCTUM SWAP</span>
                <h3 id="sanctum-swap-progress-title">
                  {swapProgress.status === 'success'
                    ? 'Swap confirmed'
                    : swapProgress.status === 'expired'
                      ? 'Quote expired'
                      : swapProgress.status?.startsWith('failed')
                        ? 'Swap not completed'
                        : swapProgress.status === 'submission_unknown'
                          ? 'Checking submission'
                          : 'Swap in progress'}
                </h3>
              </div>
              <div className="sanctum-swap-progress__header-actions">
                {!progressTerminal && (
                  <button type="button" className="sanctum-swap-progress__minimize" onClick={() => setProgressOpen(false)} aria-label="Minimize swap progress">Minimize</button>
                )}
                {progressTerminal && (
                  <button type="button" className="sanctum-swap-progress__close" onClick={clearSwapProgress} aria-label="Close swap progress">×</button>
                )}
              </div>
            </header>

            <div className="sanctum-swap-progress__body">
              <p id="sanctum-swap-progress-summary" className="sanctum-swap-progress__summary">{progressAnnouncement}</p>

            <ol className="sanctum-swap-progress__steps" aria-label="Swap progress">
              {SWAP_STEPS.map((step, index) => {
                const isFailedStep = swapProgress.status?.startsWith('failed') && index === visibleProgressRank;
                const isComplete = swapProgress.status === 'success' || index < visibleProgressRank;
                const isActive = !progressTerminal && index === visibleProgressRank;
                const stateClass = isFailedStep ? 'is-failed' : isComplete ? 'is-complete' : isActive ? 'is-active' : '';
                return (
                  <li key={step.id} className={stateClass} aria-current={isActive ? 'step' : undefined}>
                    <span className="sanctum-swap-progress__step-icon" aria-hidden="true">
                      {isActive ? <span className="sanctum-swap-progress__spinner" /> : isFailedStep ? '!' : isComplete ? '✓' : index + 1}
                    </span>
                    <div><strong>{step.label}</strong><small>{step.hint}</small></div>
                  </li>
                );
              })}
            </ol>

            <div className={`sanctum-swap-progress__receipt${swapProgress.status === 'success' ? ' is-success' : ''}`}>
              <div><span>You pay</span><strong>{formatTokenAtomics(swapProgress.inputAmount, 9, 6)} {progressInputSymbol}</strong></div>
              <div className={receivedAtomics != null ? 'is-received' : ''}>
                <span>{receivedAtomics != null ? 'Received' : 'Quoted output'}</span>
                <strong>{receivedAtomics != null ? formatTokenAtomics(receivedAtomics, 9, 6) : `≈ ${formatTokenAtomics(swapProgress.quotedOutputAmount, 9, 6)}`} {progressOutputSymbol}</strong>
              </div>
              {swapProgress.slot != null && <div><span>Solana slot</span><strong>{displayNumber(swapProgress.slot, 0)}</strong></div>}
              {swapProgress.signature && <div><span>Signature</span><strong>{shortAddress(swapProgress.signature)}</strong></div>}
              {swapProgress.balanceBefore && (
                <div><span>{progressOutputSymbol} before</span><strong>{formatTokenAtomics(balanceField(swapProgress.balanceBefore, swapProgress.direction, 'output'), 9, 6)}</strong></div>
              )}
              {swapProgress.balanceAfter && (
                <div><span>{progressOutputSymbol} after</span><strong>{formatTokenAtomics(balanceField(swapProgress.balanceAfter, swapProgress.direction, 'output'), 9, 6)}</strong></div>
              )}
            </div>

            {swapProgress.status === 'submission_unknown' && (
              <div className="sanctum-swap-progress__warning" role="status">
                <span className="sanctum-swap-progress__warning-mark" aria-hidden="true">?</span>
                <div>
                  <strong>Submission status is still being checked</strong>
                  <p>Do not submit another swap. Clash will keep checking this order against Solana.</p>
                  {swapProgress.error && (
                    <details>
                      <summary>Technical details</summary>
                      <dl>
                        <div><dt>Code</dt><dd>{swapProgress.error.code}</dd></div>
                        <div><dt>Stage</dt><dd>{swapProgress.error.stage}</dd></div>
                        {swapProgress.error.httpStatus && <div><dt>HTTP</dt><dd>{swapProgress.error.httpStatus}</dd></div>}
                        <div><dt>Order</dt><dd>{swapProgress.orderId}</dd></div>
                      </dl>
                    </details>
                  )}
                </div>
              </div>
            )}

            {swapProgress.error && swapProgress.status !== 'submission_unknown' && (
              <div className="sanctum-swap-progress__error" role="alert">
                <strong>{swapProgress.error.message}</strong>
                <details>
                  <summary>Technical details</summary>
                  <dl>
                    <div><dt>Code</dt><dd>{swapProgress.error.code}</dd></div>
                    <div><dt>Stage</dt><dd>{swapProgress.error.stage}</dd></div>
                    {swapProgress.error.httpStatus && <div><dt>HTTP</dt><dd>{swapProgress.error.httpStatus}</dd></div>}
                    <div><dt>Order</dt><dd>{swapProgress.orderId}</dd></div>
                    {swapProgress.error.technicalMessage && swapProgress.error.technicalMessage !== swapProgress.error.message && (
                      <div><dt>Message</dt><dd>{swapProgress.error.technicalMessage}</dd></div>
                    )}
                  </dl>
                </details>
              </div>
            )}
            </div>

            <footer className="sanctum-swap-progress__actions">
              {!progressTerminal && (
                <span className={`sanctum-swap-progress__footer-status${swapProgress.status === 'submission_unknown' ? ' is-warning' : ''}`}>
                  {swapProgress.status === 'submission_unknown' ? 'Still checking — do not submit another swap' : 'Safe to minimize — status updates will continue'}
                </span>
              )}
              {swapProgress.explorerUrl && (
                <a className="sanctum-shop__secondary" href={swapProgress.explorerUrl} target="_blank" rel="noreferrer">View on Solscan ↗</a>
              )}
              {swapProgress.status === 'success' && (
                <button type="button" className="sanctum-shop__primary" onClick={finishSwap}>Done</button>
              )}
              {['failed_before_broadcast', 'failed_on_chain', 'expired'].includes(swapProgress.status) && (
                <button type="button" className="sanctum-shop__primary" onClick={requestFreshQuote}>Get a fresh quote</button>
              )}
            </footer>
          </div>
        </div>
      )}

      {notice && <div className="sanctum-shop__notice" role="status">{notice}</div>}
      {error && <div className="sanctum-shop__error" role="alert">{error}</div>}
    </section>
  );
}
