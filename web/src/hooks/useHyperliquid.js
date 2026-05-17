import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import {
  createHyperliquidExchangeClient,
  createHyperliquidInfoClient,
  createHyperliquidWalletAdapter,
  formatHyperliquidPrice,
  formatHyperliquidSize,
  getOrCreateHyperliquidAgent,
  HYPERLIQUID_ARBITRUM_CHAIN_ID,
  HYPERLIQUID_ARBITRUM_USDC_ADDRESS,
  HYPERLIQUID_BRIDGE2_ADDRESS,
  hyperliquidAgentName,
  hyperliquidBuilderMaxFeeRate,
  hyperliquidBuilderParams,
  hyperliquidErrorMessage,
  HYPERLIQUID_MIN_DEPOSIT_USDC,
  HYPERLIQUID_REFERRAL_CODE,
  HYPERLIQUID_USDC_ABI,
  HYPERLIQUID_USDC_DECIMALS,
  isHyperliquidAgentApproved,
  hyperliquidSymbol,
  isHyperliquidAddress,
  makeHyperliquidCloid,
  normalizeHyperliquidMarkets,
  normalizeHyperliquidPrices,
  parseHyperliquidOrderResponse,
  readHyperliquidAgent,
  rememberHyperliquidAgent,
} from '../lib/hyperliquidClient';

const POLL_INTERVAL_MS = 5_000;
const CLAIM_LOOKBACK_SECONDS = 15 * 60;
const DEPOSIT_CREDIT_TOLERANCE_USD = 0.01;
const DEPOSIT_STATUS_MAX_AGE_MS = 10 * 60 * 1000;
const DEPOSIT_CREDIT_TIMEOUT_MS = 90_000;
const DEPOSIT_CREDIT_POLL_MS = 3_000;
const ABSTRACTION_CACHE_MS = 5 * 60 * 1000;
const BUILDER_MIN_ACCOUNT_VALUE_USDC = 100;
const BUILDER_STATUS_CACHE_MS = 60_000;
const BUILDER_APPROVAL_TIMEOUT_MS = 18_000;
const BUILDER_APPROVAL_POLL_MS = 1_500;
const AGENT_APPROVAL_TIMEOUT_MS = 24_000;
const AGENT_APPROVAL_POLL_MS = 1_500;
const abstractionModeCache = new Map();
const builderStatusCache = new Map();

function oneTapPreferenceKey(wallet) {
  return `hyperliquid_one_tap_enabled:${String(wallet || '').toLowerCase()}`;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positionSide(szi) {
  return num(szi) >= 0 ? 'bid' : 'ask';
}

function normalizePosition(row, marketBySymbol) {
  const p = row?.position || row;
  if (!p?.coin) return null;
  const symbol = hyperliquidSymbol(p.coin);
  const amount = Math.abs(num(p.szi));
  if (!(amount > 0)) return null;
  const market = marketBySymbol.get(symbol);
  return {
    symbol,
    side: positionSide(p.szi),
    amount: String(amount),
    size_usd: num(p.positionValue),
    entry_price: String(num(p.entryPx)),
    mark_price: String(num(market?.mark)),
    liquidation_price: p.liquidationPx != null ? String(p.liquidationPx) : null,
    margin: String(num(p.marginUsed)),
    leverage: String(num(p.leverage?.value, 1)),
    pnl_usd: String(num(p.unrealizedPnl)),
    pnl_pct: num(p.returnOnEquity) * 100,
    pair_index: market?._hyperliquid?.index ?? null,
    trade_index: null,
    is_isolated: p.leverage?.type === 'isolated',
    _raw: row,
  };
}

function normalizeOrder(o, marketBySymbol) {
  if (!o?.coin) return null;
  const symbol = hyperliquidSymbol(o.coin);
  const market = marketBySymbol.get(symbol);
  const price = o.isTrigger ? o.triggerPx : o.limitPx;
  return {
    symbol,
    side: o.side === 'B' ? 'bid' : 'ask',
    amount: String(o.sz ?? o.origSz ?? ''),
    initial_amount: String(o.origSz ?? o.sz ?? ''),
    price: String(price || ''),
    stop_price: o.isTrigger ? String(o.triggerPx || '') : null,
    order_id: o.oid,
    order_type: o.orderType || (o.isTrigger ? 'trigger' : 'limit'),
    tif: o.tif || null,
    reduce_only: !!o.reduceOnly,
    pair_index: market?._hyperliquid?.index ?? null,
    trade_index: null,
    client_order_id: o.cloid || null,
    _raw: o,
  };
}

function isLongSide(side) {
  const s = String(side || '').toLowerCase();
  return s === 'bid' || s === 'buy' || s === 'long';
}

function isCloseBuySide(side) {
  const s = String(side || '').toLowerCase();
  return s === 'bid' || s === 'buy' || s === 'long';
}

function depositStatusKey(wallet) {
  return `hyperliquid_pending_deposit_${String(wallet || '').toLowerCase()}`;
}

function formatUsdAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return n.toFixed(6).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function spotUsdcTotals(spotState) {
  const balances = Array.isArray(spotState?.balances) ? spotState.balances : [];
  const usdc = balances.find(row => (
    String(row?.coin || '').toUpperCase() === 'USDC'
    || Number(row?.token) === 0
  ));
  const total = num(usdc?.total);
  let available = total;
  const afterMaintenance = Array.isArray(spotState?.tokenToAvailableAfterMaintenance)
    ? spotState.tokenToAvailableAfterMaintenance
    : [];
  const usdcAfterMaintenance = afterMaintenance.find(row => (
    Array.isArray(row) && Number(row[0]) === 0
  ));
  if (usdcAfterMaintenance) available = num(usdcAfterMaintenance[1], total);
  return { total, available };
}

function normalizeAbstractionMode(value) {
  const raw = typeof value === 'object' && value !== null
    ? (value.abstraction || value.mode || value.result)
    : value;
  return String(raw || 'disabled');
}

function parseBuilderApproval(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return 0;
    if (text.endsWith('%')) {
      const pct = Number(text.slice(0, -1));
      return Number.isFinite(pct) ? pct * 1000 : 0;
    }
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'object') {
    return parseBuilderApproval(
      value.maxBuilderFee
        ?? value.maxFee
        ?? value.maxFeeRate
        ?? value.value
        ?? value.result
        ?? value.approved,
    );
  }
  return 0;
}

async function readUserAbstractionMode(info, walletAddr, { refresh = false } = {}) {
  const key = String(walletAddr || '').toLowerCase();
  const cached = abstractionModeCache.get(key);
  if (!refresh && cached && Date.now() - cached.at < ABSTRACTION_CACHE_MS) return cached.mode;
  const mode = normalizeAbstractionMode(await info.userAbstraction({ user: walletAddr }).catch(() => null));
  abstractionModeCache.set(key, { mode, at: Date.now() });
  return mode;
}

async function readBuilderStatus(walletAddr, builder, { refresh = false } = {}) {
  if (!builder?.b || !walletAddr) {
    return { configured: false, canUse: false, userCanApprove: false, approved: 0, required: 0, eligible: false };
  }
  const key = `${String(walletAddr).toLowerCase()}:${String(builder.b).toLowerCase()}:${builder.f}`;
  const cached = builderStatusCache.get(key);
  if (!refresh && cached && Date.now() - cached.at < BUILDER_STATUS_CACHE_MS) return cached.status;

  const info = createHyperliquidInfoClient();
  const [approvedRaw, builderSnapshot] = await Promise.all([
    info.maxBuilderFee({ user: walletAddr, builder: builder.b }).catch(() => 0),
    readHyperliquidBalances(builder.b, { refresh }).catch(() => null),
  ]);
  const approved = parseBuilderApproval(approvedRaw);
  const builderPerpAccountValue = num(builderSnapshot?.perpEquity);
  const builderSpotUsdc = num(builderSnapshot?.spotUsdc);
  const builderAccountValue = Math.max(
    num(builderSnapshot?.equity),
    builderPerpAccountValue,
    builderSpotUsdc,
  );
  const eligible = builderAccountValue + DEPOSIT_CREDIT_TOLERANCE_USD >= BUILDER_MIN_ACCOUNT_VALUE_USDC;
  const status = {
    configured: true,
    builder: builder.b,
    required: builder.f,
    approved,
    eligible,
    userCanApprove: eligible && approved < builder.f,
    canUse: eligible && approved >= builder.f,
    builderAccountValue,
    builderPerpAccountValue,
    builderSpotUsdc,
    builderAbstractionMode: builderSnapshot?.abstractionMode || 'unknown',
    builderUnifiedAccount: !!builderSnapshot?.isUnifiedAccount,
  };
  builderStatusCache.set(key, { status, at: Date.now() });
  return status;
}

async function waitForBuilderApproval(walletAddr, builder) {
  const deadline = Date.now() + BUILDER_APPROVAL_TIMEOUT_MS;
  let last = null;
  while (Date.now() <= deadline) {
    last = await readBuilderStatus(walletAddr, builder, { refresh: true });
    if (last.canUse) return { ok: true, status: last };
    if (!last.eligible) return { ok: false, status: last };
    await sleep(BUILDER_APPROVAL_POLL_MS);
  }
  return { ok: false, status: last };
}

async function waitForAgentApproval(walletAddr, agent) {
  const deadline = Date.now() + AGENT_APPROVAL_TIMEOUT_MS;
  let last = [];
  while (Date.now() <= deadline) {
    const info = createHyperliquidInfoClient();
    last = await info.extraAgents({ user: walletAddr }).catch(() => []);
    const approved = isHyperliquidAgentApproved(agent, last);
    if (approved) return { ok: true, approved, agents: last };
    await sleep(AGENT_APPROVAL_POLL_MS);
  }
  return { ok: false, agents: last };
}

function builderOrderParams(approval) {
  if (approval?.useBuilder !== true) return {};
  const builder = approval.builder;
  return builder ? { builder } : {};
}

async function readHyperliquidBalances(walletAddr, opts = {}) {
  const info = createHyperliquidInfoClient();
  const [perpState, spotState, abstractionMode] = await Promise.all([
    info.clearinghouseState({ user: walletAddr }),
    info.spotClearinghouseState({ user: walletAddr }).catch(() => null),
    readUserAbstractionMode(info, walletAddr, opts),
  ]);
  const spot = spotUsdcTotals(spotState);
  const isUnifiedAccount = abstractionMode === 'unifiedAccount' || abstractionMode === 'portfolioMargin';
  const perpEquity = num(perpState?.marginSummary?.accountValue);
  const perpAvailable = num(perpState?.withdrawable);
  const unifiedEquity = Math.max(spot.total, perpEquity);
  const unifiedAvailable = Math.max(spot.available, perpAvailable);
  return {
    perpState,
    spotState,
    abstractionMode,
    isUnifiedAccount,
    equity: isUnifiedAccount ? unifiedEquity : perpEquity,
    available: isUnifiedAccount ? unifiedAvailable : perpAvailable,
    perpEquity,
    perpAvailable,
    marginUsed: num(perpState?.marginSummary?.totalMarginUsed),
    spotUsdc: spot.total,
    spotAvailable: spot.available,
  };
}

async function waitForHyperliquidBalance(walletAddr, predicate, timeoutMs = DEPOSIT_CREDIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() <= deadline) {
    last = await readHyperliquidBalances(walletAddr);
    if (predicate(last)) return { ok: true, snapshot: last };
    await sleep(DEPOSIT_CREDIT_POLL_MS);
  }
  return { ok: false, snapshot: last };
}

export function useHyperliquid() {
  const { dex } = useDex();
  const isActiveDex = dex === 'hyperliquid';
  const { address, provider, isReady, getWalletClient, getPublicClient, ensureChain } = useEvmWallet();
  const player = usePlayer();
  const walletAddr = address || null;

  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [depositStatus, setDepositStatusState] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [builderApproval, setBuilderApproval] = useState(null);
  const [agentApproval, setAgentApproval] = useState(null);
  const [oneTapEnabled, setOneTapEnabledState] = useState(false);

  const marketsRef = useRef([]);
  const depositStatusRef = useRef(null);
  const claimGoldRef = useRef(null);
  const importFillsRef = useRef(null);
  const tradeInFlightRef = useRef(false);

  const registeredWallet = typeof player?.wallet === 'string' ? player.wallet.trim() : '';
  const registeredEvmWallet = isHyperliquidAddress(registeredWallet) ? registeredWallet.toLowerCase() : null;
  const activeEvmWallet = walletAddr ? String(walletAddr).toLowerCase() : null;
  const walletMismatch = !!(registeredEvmWallet && activeEvmWallet && registeredEvmWallet !== activeEvmWallet);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);
  const setDepositStatus = useCallback((next) => {
    depositStatusRef.current = next;
    setDepositStatusState(next);
  }, []);

  const setOneTapEnabled = useCallback((enabled) => {
    const next = !!enabled;
    setOneTapEnabledState(next);
    if (!walletAddr) return;
    try {
      localStorage.setItem(oneTapPreferenceKey(walletAddr), next ? '1' : '0');
    } catch { /* storage disabled */ }
  }, [walletAddr]);

  const marketBySymbol = useCallback(() => {
    return new Map((marketsRef.current || []).map(m => [m.symbol, m]));
  }, []);

  const findMarket = useCallback((symbol) => {
    const target = hyperliquidSymbol(symbol);
    return (marketsRef.current || []).find(m => m.symbol === target) || null;
  }, []);

  const ensureMarkets = useCallback(async () => {
    if (marketsRef.current.length) return marketsRef.current;
    const info = createHyperliquidInfoClient();
    const payload = await info.metaAndAssetCtxs();
    const rows = normalizeHyperliquidMarkets(payload);
    marketsRef.current = rows;
    setMarkets(rows);
    setPrices(normalizeHyperliquidPrices(rows));
    return rows;
  }, []);

  const exchange = useCallback(() => {
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    const walletClient = typeof getWalletClient === 'function'
      ? (getWalletClient(HYPERLIQUID_ARBITRUM_CHAIN_ID) || getWalletClient())
      : null;
    if (!provider && !walletClient) throw new Error('Wallet signer is not ready');
    const wallet = createHyperliquidWalletAdapter({ address: walletAddr, provider, walletClient });
    return createHyperliquidExchangeClient(wallet);
  }, [walletAddr, provider, getWalletClient]);

  const ensureAgentApproved = useCallback(async () => {
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    const agent = getOrCreateHyperliquidAgent(walletAddr);
    setAgentApproval(prev => ({
      ...prev,
      address: agent.address,
      validUntil: agent.validUntil,
      approving: false,
    }));

    const info = createHyperliquidInfoClient();
    const agents = await info.extraAgents({ user: walletAddr }).catch(() => []);
    const approved = isHyperliquidAgentApproved(agent, agents);
    if (approved) {
      const remembered = rememberHyperliquidAgent(walletAddr, agent, approved.validUntil);
      setAgentApproval({
        address: remembered.address,
        validUntil: approved.validUntil,
        approved: true,
        approving: false,
      });
      return remembered.account;
    }

    if (typeof ensureChain === 'function') await ensureChain(HYPERLIQUID_ARBITRUM_CHAIN_ID);
    setAgentApproval({
      address: agent.address,
      validUntil: agent.validUntil,
      approved: false,
      approving: true,
    });
    const result = await exchange().approveAgent({
      agentAddress: agent.address,
      agentName: hyperliquidAgentName(agent.validUntil),
    });
    if (result?.error) throw new Error(String(result.error));

    const verified = await waitForAgentApproval(walletAddr, agent);
    if (!verified.ok) {
      throw new Error('Hyperliquid agent approval was signed but is not visible yet. Wait a few seconds and retry.');
    }
    const remembered = rememberHyperliquidAgent(walletAddr, agent, verified.approved.validUntil);
    setAgentApproval({
      address: remembered.address,
      validUntil: verified.approved.validUntil,
      approved: true,
      approving: false,
    });
    return remembered.account;
  }, [walletAddr, ensureChain, exchange]);

  const ensureOneTapTradingReady = useCallback(async () => {
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    const agent = readHyperliquidAgent(walletAddr);
    if (agent && agentApproval?.approved === true) {
      if (!oneTapEnabled) setOneTapEnabled(true);
      return agent.account;
    }
    setError('One tap trading is required. Approve the Arbitrum agent signature to open Hyperliquid orders.');
    try {
      if (typeof ensureChain === 'function') await ensureChain(HYPERLIQUID_ARBITRUM_CHAIN_ID);
      const agentAccount = await ensureAgentApproved();
      setOneTapEnabled(true);
      setError(null);
      return agentAccount;
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Hyperliquid one tap setup failed');
      if (/signature cancelled/i.test(msg)) {
        throw new Error('One tap trading is required to trade on Hyperliquid. Approve the Arbitrum agent signature, then retry.');
      }
      throw e;
    }
  }, [walletAddr, agentApproval?.approved, oneTapEnabled, ensureChain, ensureAgentApproved, setOneTapEnabled]);

  const tradingExchange = useCallback(async () => {
    const agentAccount = await ensureOneTapTradingReady();
    return createHyperliquidExchangeClient(agentAccount);
  }, [ensureOneTapTradingReady]);

  const refreshAgentApproval = useCallback(async () => {
    if (!walletAddr) {
      setAgentApproval(null);
      return null;
    }
    const agent = readHyperliquidAgent(walletAddr);
    if (!agent) {
      const status = { address: null, validUntil: null, approved: false, userCanApprove: true, approving: false };
      setAgentApproval(status);
      return status;
    }
    const info = createHyperliquidInfoClient();
    const agents = await info.extraAgents({ user: walletAddr }).catch(() => []);
    const approved = isHyperliquidAgentApproved(agent, agents);
    if (approved) rememberHyperliquidAgent(walletAddr, agent, approved.validUntil);
    const status = {
      address: agent.address,
      validUntil: approved?.validUntil || agent.validUntil,
      approved: !!approved,
      userCanApprove: !approved,
      approving: false,
    };
    setAgentApproval(status);
    return status;
  }, [walletAddr]);

  const refreshBuilderApproval = useCallback(async (opts = {}) => {
    const builder = hyperliquidBuilderParams();
    if (!builder || !walletAddr) {
      const status = { configured: false, canUse: false, userCanApprove: false, approved: 0, required: 0, eligible: false };
      setBuilderApproval(status);
      return status;
    }
    const status = await readBuilderStatus(walletAddr, builder, opts);
    setBuilderApproval(status);
    return status;
  }, [walletAddr]);

  const readArbitrumUsdcBalance = useCallback(async () => {
    if (!walletAddr || typeof getPublicClient !== 'function') return null;
    const publicClient = getPublicClient(HYPERLIQUID_ARBITRUM_CHAIN_ID);
    const raw = await publicClient.readContract({
      address: HYPERLIQUID_ARBITRUM_USDC_ADDRESS,
      abi: HYPERLIQUID_USDC_ABI,
      functionName: 'balanceOf',
      args: [walletAddr],
    });
    return Number(formatUnits(raw, HYPERLIQUID_USDC_DECIMALS));
  }, [walletAddr, getPublicClient]);

  const fetchMarkets = useCallback(async () => {
    try {
      const rows = await ensureMarkets();
      if (rows.length) {
        setMarkets(rows);
        setPrices(normalizeHyperliquidPrices(rows));
      }
    } catch (e) {
      console.warn('[useHyperliquid] fetchMarkets:', e?.message || e);
      setError(hyperliquidErrorMessage(e));
    }
  }, [ensureMarkets]);

  const fetchPrices = useCallback(async () => {
    try {
      const info = createHyperliquidInfoClient();
      const payload = await info.metaAndAssetCtxs();
      const rows = normalizeHyperliquidMarkets(payload);
      if (rows.length) {
        marketsRef.current = rows;
        setMarkets(rows);
        setPrices(normalizeHyperliquidPrices(rows));
      }
    } catch (e) {
      console.warn('[useHyperliquid] fetchPrices:', e?.message || e);
    }
  }, []);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr) return;
    try {
      await ensureMarkets();
      const info = createHyperliquidInfoClient();
      const [snapshot, openOrders, arbWalletUsdc, builderStatus, agentStatus] = await Promise.all([
        readHyperliquidBalances(walletAddr),
        info.frontendOpenOrders({ user: walletAddr }).catch(() => []),
        readArbitrumUsdcBalance().catch(() => null),
        refreshBuilderApproval().catch(() => null),
        refreshAgentApproval().catch(() => null),
      ]);
      const state = snapshot.perpState;
      const equity = snapshot.equity;
      const available = snapshot.available;
      const marginUsed = snapshot.marginUsed;
      const bySymbol = marketBySymbol();
      const normPositions = (state?.assetPositions || []).map(row => normalizePosition(row, bySymbol)).filter(Boolean);
      const normOrders = (openOrders || []).map(o => normalizeOrder(o, bySymbol)).filter(Boolean);
      setPositions(normPositions);
      setOrders(normOrders);
      setWalletUsdc(arbWalletUsdc);
      setAccount({
        balance: String(equity),
        usdc: String(equity),
        account_equity: String(equity),
        available_to_spend: String(available),
        available_to_withdraw: String(available),
        total_margin_used: String(marginUsed),
        spot_usdc_balance: String(snapshot.spotUsdc),
        spot_usdc_available: String(snapshot.spotAvailable),
        perp_account_equity: String(snapshot.perpEquity),
        perp_available_to_withdraw: String(snapshot.perpAvailable),
        abstraction_mode: snapshot.abstractionMode,
        is_unified_account: snapshot.isUnifiedAccount,
        hyperliquid_total_usdc: String(snapshot.isUnifiedAccount ? equity : equity + snapshot.spotUsdc),
        builder_fee_configured: builderStatus?.configured ?? false,
        builder_fee_approved: builderStatus?.canUse ?? false,
        builder_fee_user_can_approve: builderStatus?.userCanApprove ?? false,
        builder_account_value: String(builderStatus?.builderAccountValue ?? builderStatus?.builderPerpAccountValue ?? 0),
        builder_spot_usdc: String(builderStatus?.builderSpotUsdc ?? 0),
        builder_perp_account_value: String(builderStatus?.builderPerpAccountValue ?? 0),
        builder_abstraction_mode: builderStatus?.builderAbstractionMode ?? null,
        builder_is_unified_account: builderStatus?.builderUnifiedAccount ?? false,
        one_tap_trading_approved: agentStatus?.approved ?? false,
        one_tap_agent_address: agentStatus?.address ?? null,
        one_tap_agent_valid_until: agentStatus?.validUntil ?? null,
        positions_count: normPositions.length,
        orders_count: normOrders.length,
        maker_fee: 0.00015,
        taker_fee: 0.00045,
        _raw: state,
        _spotRaw: snapshot.spotState,
      });
      const pendingDeposit = depositStatusRef.current;
      if (pendingDeposit?.status === 'depositing') {
        if (Date.now() - Number(pendingDeposit.startedAt || 0) > DEPOSIT_STATUS_MAX_AGE_MS) {
          setDepositStatus(null);
        }
        const targetEquity = Number(pendingDeposit.targetEquity);
        const targetAvailable = Number(pendingDeposit.targetAvailable);
        const targetSpot = Number(pendingDeposit.targetSpot);
        const creditedByEquity = Number.isFinite(targetEquity)
          && equity + DEPOSIT_CREDIT_TOLERANCE_USD >= targetEquity;
        const creditedByAvailable = Number.isFinite(targetAvailable)
          && available + DEPOSIT_CREDIT_TOLERANCE_USD >= targetAvailable;
        const creditedBySpot = Number.isFinite(targetSpot)
          && snapshot.spotUsdc + DEPOSIT_CREDIT_TOLERANCE_USD >= targetSpot;
        if (creditedByEquity || creditedByAvailable || creditedBySpot) {
          setDepositStatus(null);
        }
      } else if (pendingDeposit?.status === 'moving_to_perp') {
        const targetEquity = Number(pendingDeposit.targetEquity);
        const targetAvailable = Number(pendingDeposit.targetAvailable);
        const creditedByEquity = Number.isFinite(targetEquity)
          && equity + DEPOSIT_CREDIT_TOLERANCE_USD >= targetEquity;
        const creditedByAvailable = Number.isFinite(targetAvailable)
          && available + DEPOSIT_CREDIT_TOLERANCE_USD >= targetAvailable;
        if (
          Date.now() - Number(pendingDeposit.startedAt || 0) > DEPOSIT_STATUS_MAX_AGE_MS
          || creditedByEquity
          || creditedByAvailable
        ) {
          setDepositStatus(null);
        }
      }
      window._openPositionsCount = normPositions.length;
      setDataReady(true);
    } catch (e) {
      console.warn('[useHyperliquid] fetchAccount:', e?.message || e);
      setError(hyperliquidErrorMessage(e));
    }
  }, [walletAddr, ensureMarkets, marketBySymbol, readArbitrumUsdcBalance, refreshBuilderApproval, refreshAgentApproval, setDepositStatus]);

  const fetchOrders = useCallback(fetchAccount, [fetchAccount]);

  useEffect(() => {
    if (!walletAddr) {
      setDepositStatus(null);
      setBuilderApproval(null);
      setAgentApproval(null);
      setOneTapEnabledState(false);
      return;
    }
    try {
      setOneTapEnabledState(localStorage.getItem(oneTapPreferenceKey(walletAddr)) === '1');
    } catch {
      setOneTapEnabledState(false);
    }
    try {
      const raw = localStorage.getItem(depositStatusKey(walletAddr));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (
        (parsed?.status === 'depositing' || parsed?.status === 'moving_to_perp')
        && Date.now() - Number(parsed.startedAt || 0) <= DEPOSIT_STATUS_MAX_AGE_MS
      ) {
        setDepositStatus(parsed);
      } else {
        localStorage.removeItem(depositStatusKey(walletAddr));
      }
    } catch {}
  }, [walletAddr, setDepositStatus]);

  useEffect(() => {
    if (!walletAddr) return;
    try {
      const key = depositStatusKey(walletAddr);
      if (depositStatus?.status === 'depositing') {
        localStorage.setItem(key, JSON.stringify(depositStatus));
      } else {
        localStorage.removeItem(key);
      }
    } catch {}
  }, [walletAddr, depositStatus]);

  useEffect(() => { if (isActiveDex) fetchMarkets(); }, [isActiveDex, fetchMarkets]);

  useEffect(() => {
    if (!isActiveDex) return;
    const tick = () => {
      fetchPrices();
      if (walletAddr) fetchAccount();
    };
    tick();
    const iv = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [isActiveDex, walletAddr, fetchPrices, fetchAccount]);

  const importHyperliquidFills = useCallback(async ({
    attempts = 3,
    lookbackSeconds = CLAIM_LOOKBACK_SECONDS,
    delayMs = 1500,
  } = {}) => {
    if (!walletAddr) return null;
    const token = window._playerToken || player?.token || null;
    if (!token) return null;
    try {
      const res = await fetch('/api/futures/hyperliquid/import-fills?dex=hyperliquid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'hyperliquid' },
        body: JSON.stringify({
          wallet: walletAddr,
          attempts,
          lookback_seconds: lookbackSeconds,
          delay_ms: delayMs,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[useHyperliquid] import-fills failed:', res.status, data?.error || data?.detail || '(no body)');
        return data;
      }
      return data;
    } catch (e) {
      console.warn('[useHyperliquid] import-fills network error:', e?.message || e);
      return null;
    }
  }, [walletAddr, player]);

  importFillsRef.current = importHyperliquidFills;

  const claimGold = useCallback(async () => {
    if (!walletAddr) return null;
    const token = window._playerToken || player?.token || null;
    if (!token) return null;
    try {
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'hyperliquid' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[useHyperliquid] claim-gold failed:', res.status, data?.error || data?.reason || '(no body)');
        return data;
      }
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      return data;
    } catch (e) {
      console.warn('[useHyperliquid] claim-gold network error:', e?.message || e);
      return null;
    }
  }, [walletAddr, player]);

  claimGoldRef.current = claimGold;

  const syncRewards = useCallback((label = 'trade') => {
    if (!walletAddr) return;
    const run = async (attempts, delayMs) => {
      const imported = await importHyperliquidFills({ attempts, delayMs, lookbackSeconds: CLAIM_LOOKBACK_SECONDS });
      const claimFn = claimGoldRef.current;
      if (typeof claimFn === 'function') await claimFn();
      if (imported?.imported > 0) console.log(`[useHyperliquid] rewards synced after ${label}`, imported);
    };
    run(5, 1500);
    setTimeout(() => run(2, 1500), 12_000);
  }, [walletAddr, importHyperliquidFills]);

  useEffect(() => {
    if (!walletAddr || !isActiveDex) return;
    const fire = async () => {
      const importFn = importFillsRef.current;
      if (typeof importFn === 'function') await importFn({ attempts: 1, lookbackSeconds: CLAIM_LOOKBACK_SECONDS });
      const claimFn = claimGoldRef.current;
      if (typeof claimFn === 'function') await claimFn();
    };
    const kickoff = setTimeout(fire, 3000);
    const iv = setInterval(fire, 30_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [walletAddr, isActiveDex]);

  const ensureReferralSet = useCallback(async () => {
    const code = String(HYPERLIQUID_REFERRAL_CODE || '').trim();
    if (!code || !walletAddr) return { success: true, skipped: true };
    const cacheKey = `hyperliquid_referral_${walletAddr.toLowerCase()}_${code.toUpperCase()}`;
    try {
      if (localStorage.getItem(cacheKey) === '1') return { success: true, cached: true };
    } catch {}
    try {
      const info = createHyperliquidInfoClient();
      const current = await info.referral({ user: walletAddr }).catch(() => null);
      const currentCode = String(current?.referredBy?.code || '').trim();
      if (currentCode) {
        try { localStorage.setItem(cacheKey, currentCode.toUpperCase() === code.toUpperCase() ? '1' : 'other'); } catch {}
        return { success: true, code: currentCode, alreadySet: true };
      }
      if (typeof ensureChain === 'function') await ensureChain(HYPERLIQUID_ARBITRUM_CHAIN_ID);
      const result = await exchange().setReferrer({ code });
      try { localStorage.setItem(cacheKey, '1'); } catch {}
      return { success: true, code, raw: result };
    } catch (e) {
      console.warn('[useHyperliquid] setReferrer failed:', hyperliquidErrorMessage(e, 'setReferrer failed'));
      return { success: false, error: hyperliquidErrorMessage(e, 'setReferrer failed') };
    }
  }, [walletAddr, ensureChain, exchange]);

  const ensureBuilderApproved = useCallback(async (opts = {}) => {
    const builder = hyperliquidBuilderParams();
    if (!builder) {
      const status = { configured: false, canUse: false, userCanApprove: false, approved: 0, required: 0, eligible: false };
      setBuilderApproval(status);
      return { success: true, skipped: true, useBuilder: false };
    }
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    const before = await readBuilderStatus(walletAddr, builder, { refresh: opts?.force === true });
    setBuilderApproval(before);
    if (!before.eligible) {
      const builderValue = Number(before.builderAccountValue ?? before.builderPerpAccountValue ?? 0);
      console.warn(
        `[useHyperliquid] builder fee disabled: builder account value is ${builderValue.toFixed(2)} USDC, needs ${BUILDER_MIN_ACCOUNT_VALUE_USDC} USDC.`,
      );
      return {
        success: true,
        skipped: true,
        useBuilder: false,
        reason: 'builder_not_eligible',
        status: before,
      };
    }
    if (before.approved >= builder.f) return { success: true, approved: before.approved, useBuilder: true, builder };
    if (typeof ensureChain === 'function') await ensureChain(HYPERLIQUID_ARBITRUM_CHAIN_ID);
    setBuilderApproval({ ...before, userCanApprove: true, approving: true });
    console.info('[useHyperliquid] requesting builder fee approval', {
      builder: builder.b,
      maxFeeRate: hyperliquidBuilderMaxFeeRate(builder),
    });
    try {
      const result = await exchange().approveBuilderFee({
        builder: builder.b,
        maxFeeRate: hyperliquidBuilderMaxFeeRate(builder),
      });
      if (result?.error) throw new Error(String(result.error));
      const verified = await waitForBuilderApproval(walletAddr, builder);
      if (verified.status) setBuilderApproval(verified.status);
      if (!verified.ok) {
        throw new Error('Builder fee approval was signed but Hyperliquid has not confirmed it yet. Wait a few seconds and retry.');
      }
      return { success: true, approved: verified.status.approved, raw: result, useBuilder: true, builder };
    } catch (e) {
      setBuilderApproval(prev => (
        prev?.builder && String(prev.builder).toLowerCase() === String(builder.b).toLowerCase()
          ? { ...prev, approving: false, userCanApprove: true }
          : prev
      ));
      throw e;
    }
  }, [walletAddr, ensureChain, exchange]);

  const moveSpotToPerp = useCallback(async (amount, opts = {}) => {
    const manageLoading = opts?.manageLoading !== false;
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      if (manageLoading) setLoading(true);
      setError(null);

      const before = await readHyperliquidBalances(walletAddr, opts?.refreshMode ? { refresh: true } : {});
      if (before.isUnifiedAccount) {
        setDepositStatus(null);
        await fetchAccount();
        return {
          success: true,
          skipped: true,
          info: 'Unified account is active. Your Hyperliquid USDC is already available for trading.',
        };
      }
      const requested = Number(String(amount ?? '').trim() || before.spotAvailable || before.spotUsdc);
      if (!Number.isFinite(requested) || requested <= 0) throw new Error('Enter a positive USDC amount');
      if (before.spotAvailable + DEPOSIT_CREDIT_TOLERANCE_USD < requested) {
        throw new Error(`Hyperliquid Spot USDC available is ${before.spotAvailable.toFixed(2)}`);
      }

      const amountText = formatUsdAmount(requested);
      setDepositStatus({
        status: 'moving_to_perp',
        amount: amountText,
        startedAt: Date.now(),
        targetEquity: before.equity + requested,
        targetAvailable: before.available + requested,
      });

      if (typeof ensureChain === 'function') await ensureChain(HYPERLIQUID_ARBITRUM_CHAIN_ID);
      const result = await exchange().usdClassTransfer({ amount: amountText, toPerp: true });
      const wait = await waitForHyperliquidBalance(walletAddr, snap => (
        snap.available + DEPOSIT_CREDIT_TOLERANCE_USD >= before.available + requested
        || snap.equity + DEPOSIT_CREDIT_TOLERANCE_USD >= before.equity + requested
      ), 60_000);

      await fetchAccount();
      setDepositStatus(null);
      return {
        success: true,
        raw: result,
        info: wait.ok
          ? 'Moved USDC from Hyperliquid Spot to trading balance.'
          : 'Transfer submitted. Hyperliquid balance may update shortly.',
      };
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Hyperliquid legacy Spot transfer failed');
      if (/unified account/i.test(msg) || /Action disabled when unified account is active/i.test(msg)) {
        try { await readHyperliquidBalances(walletAddr, { refresh: true }); } catch {}
        setDepositStatus(null);
        await fetchAccount();
        return {
          success: true,
          skipped: true,
          info: 'Unified account is active. Your Hyperliquid USDC is already available for trading.',
        };
      }
      setDepositStatus(null);
      setError(msg);
      return { error: msg };
    } finally {
      if (manageLoading) setLoading(false);
    }
  }, [walletAddr, ensureChain, exchange, fetchAccount, setDepositStatus]);

  const ensurePerpUsdc = useCallback(async (requiredAmount) => {
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    const required = Number(requiredAmount);
    if (!Number.isFinite(required) || required <= 0) return { success: true };
    const snapshot = await readHyperliquidBalances(walletAddr);
    if (snapshot.available + DEPOSIT_CREDIT_TOLERANCE_USD >= required) return { success: true };
    if (snapshot.isUnifiedAccount) {
      throw new Error(`Insufficient Hyperliquid USDC. Available is ${snapshot.available.toFixed(2)} USDC.`);
    }
    const shortfall = required - snapshot.available;
    if (snapshot.spotAvailable + DEPOSIT_CREDIT_TOLERANCE_USD >= shortfall) {
      return moveSpotToPerp(formatUsdAmount(shortfall), { manageLoading: false });
    }
    throw new Error(
      `Insufficient Hyperliquid trading balance. Trading balance is ${snapshot.available.toFixed(2)} USDC and Spot has ${snapshot.spotAvailable.toFixed(2)} USDC.`,
    );
  }, [walletAddr, moveSpotToPerp]);

  const setLeverage = useCallback(async (symbol, leverage, opts = {}) => {
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      const market = findMarket(symbol) || (await ensureMarkets()).find(m => m.symbol === hyperliquidSymbol(symbol));
      if (!market) throw new Error(`No Hyperliquid market for ${symbol}`);
      const lev = Math.max(1, Math.floor(Number(leverage) || 1));
      const client = await tradingExchange();
      await client.updateLeverage({
        asset: market._hyperliquid.index,
        isCross: opts?.isCross !== false,
        leverage: lev,
      });
      return { success: true };
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Could not update Hyperliquid leverage');
      setError(msg);
      return { error: msg };
    }
  }, [walletAddr, findMarket, ensureMarkets, tradingExchange]);

  const setMarginMode = useCallback(async () => ({ success: true }), []);

  const placeMarketOrder = useCallback(async (symbol, side, collateralUsdc, slippage = '0.5', leverage = 1) => {
    if (tradeInFlightRef.current) return { error: 'Trade already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (walletMismatch) throw new Error('Connected wallet does not match this game account');
      const market = findMarket(symbol) || (await ensureMarkets()).find(m => m.symbol === hyperliquidSymbol(symbol));
      if (!market) throw new Error(`No Hyperliquid market for ${symbol}`);
      const mark = num(market.mark || market.mid || market.oracle);
      const collateral = num(collateralUsdc);
      const lev = Math.max(1, Math.floor(Number(leverage) || 1));
      if (!(mark > 0)) throw new Error('No live Hyperliquid price yet');
      if (!(collateral > 0)) throw new Error('Invalid collateral');
      if (collateral * lev < 10) throw new Error('Hyperliquid minimum position is about $10 notional');

      const funding = await ensurePerpUsdc(collateral);
      if (funding?.error) throw new Error(funding.error);
      const builderApprovalResult = await ensureBuilderApproved({ force: true });
      const client = await tradingExchange();
      await client.updateLeverage({ asset: market._hyperliquid.index, isCross: true, leverage: lev });

      const isBuy = isLongSide(side);
      const slip = Math.max(0, Math.min(0.05, num(slippage, 0.5) / 100));
      const price = mark * (isBuy ? (1 + slip) : (1 - slip));
      const size = formatHyperliquidSize((collateral * lev) / mark, market);
      if (!(num(size) > 0)) throw new Error('Order size is below the market lot size');
      const result = await client.order({
        orders: [{
          a: market._hyperliquid.index,
          b: isBuy,
          p: formatHyperliquidPrice(price, { round: isBuy ? 'up' : 'down' }),
          s: size,
          r: false,
          t: { limit: { tif: 'FrontendMarket' } },
          c: makeHyperliquidCloid(),
        }],
        grouping: 'na',
        ...builderOrderParams(builderApprovalResult),
      });
      const parsed = parseHyperliquidOrderResponse(result);
      if (!parsed.ok) throw new Error(parsed.error || 'Hyperliquid rejected the order');
      fetchAccount();
      syncRewards('market order');
      return { success: true, tx_hash: String(parsed.oid || ''), order_id: parsed.oid, raw: result };
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Hyperliquid market order failed');
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [walletMismatch, findMarket, ensureMarkets, tradingExchange, ensurePerpUsdc, ensureBuilderApproved, fetchAccount, syncRewards]);

  const placeLimitOrder = useCallback(async (symbol, side, limitPrice, collateralUsdc, tif = 'GTC', leverage = 1) => {
    if (tradeInFlightRef.current) return { error: 'Trade already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (walletMismatch) throw new Error('Connected wallet does not match this game account');
      const market = findMarket(symbol) || (await ensureMarkets()).find(m => m.symbol === hyperliquidSymbol(symbol));
      if (!market) throw new Error(`No Hyperliquid market for ${symbol}`);
      const limit = num(limitPrice);
      const collateral = num(collateralUsdc);
      const lev = Math.max(1, Math.floor(Number(leverage) || 1));
      if (!(limit > 0)) throw new Error('Invalid limit price');
      if (!(collateral > 0)) throw new Error('Invalid collateral');
      const funding = await ensurePerpUsdc(collateral);
      if (funding?.error) throw new Error(funding.error);
      const builderApprovalResult = await ensureBuilderApproved({ force: true });
      const client = await tradingExchange();
      await client.updateLeverage({ asset: market._hyperliquid.index, isCross: true, leverage: lev });
      const size = formatHyperliquidSize((collateral * lev) / limit, market);
      if (!(num(size) > 0)) throw new Error('Order size is below the market lot size');
      const normalizedTif = String(tif || 'GTC').toUpperCase() === 'IOC'
        ? 'Ioc'
        : String(tif || 'GTC').toUpperCase() === 'ALO'
        ? 'Alo'
        : 'Gtc';
      const result = await client.order({
        orders: [{
          a: market._hyperliquid.index,
          b: isLongSide(side),
          p: formatHyperliquidPrice(limit),
          s: size,
          r: false,
          t: { limit: { tif: normalizedTif } },
          c: makeHyperliquidCloid(),
        }],
        grouping: 'na',
        ...builderOrderParams(builderApprovalResult),
      });
      const parsed = parseHyperliquidOrderResponse(result);
      if (!parsed.ok) throw new Error(parsed.error || 'Hyperliquid rejected the order');
      fetchOrders();
      return { success: true, tx_hash: String(parsed.oid || ''), order_id: parsed.oid, raw: result };
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Hyperliquid limit order failed');
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [walletMismatch, findMarket, ensureMarkets, tradingExchange, ensurePerpUsdc, ensureBuilderApproved, fetchOrders]);

  const cancelOrder = useCallback(async (symbol, orderId, pairIndex) => {
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      const market = Number.isFinite(Number(pairIndex))
        ? { _hyperliquid: { index: Number(pairIndex) } }
        : findMarket(symbol);
      if (!market) throw new Error(`No Hyperliquid market for ${symbol}`);
      if (!Number.isFinite(Number(orderId))) throw new Error('Missing Hyperliquid order id');
      const client = await tradingExchange();
      const result = await client.cancel({
        cancels: [{ a: market._hyperliquid.index, o: Number(orderId) }],
      });
      const status = result?.response?.data?.statuses?.[0];
      if (status && status !== 'success') throw new Error(status.error || 'Cancel failed');
      fetchOrders();
      return { success: true, raw: result };
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Hyperliquid cancel failed');
      setError(msg);
      return { error: msg };
    }
  }, [walletAddr, findMarket, tradingExchange, fetchOrders]);

  const closePosition = useCallback(async (symbol, side, amount) => {
    if (tradeInFlightRef.current) return { error: 'Trade already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (walletMismatch) throw new Error('Connected wallet does not match this game account');
      const market = findMarket(symbol) || (await ensureMarkets()).find(m => m.symbol === hyperliquidSymbol(symbol));
      if (!market) throw new Error(`No Hyperliquid market for ${symbol}`);
      const mark = num(market.mark || market.mid || market.oracle);
      if (!(mark > 0)) throw new Error('No live Hyperliquid price yet');
      const current = positions.find(p => p.symbol === hyperliquidSymbol(symbol) && p.side === side);
      const closeSize = formatHyperliquidSize(Math.min(num(amount, Infinity), num(current?.amount, amount)), market);
      if (!(num(closeSize) > 0)) throw new Error('Close size is below the market lot size');
      const isClosingLong = side === 'bid' || side === 'long';
      const closeBuy = !isClosingLong;
      const price = mark * (closeBuy ? 1.005 : 0.995);
      const builderApprovalResult = await ensureBuilderApproved({ force: true });
      const client = await tradingExchange();
      const result = await client.order({
        orders: [{
          a: market._hyperliquid.index,
          b: closeBuy,
          p: formatHyperliquidPrice(price, { round: closeBuy ? 'up' : 'down' }),
          s: closeSize,
          r: true,
          t: { limit: { tif: 'FrontendMarket' } },
          c: makeHyperliquidCloid(),
        }],
        grouping: 'na',
        ...builderOrderParams(builderApprovalResult),
      });
      const parsed = parseHyperliquidOrderResponse(result);
      if (!parsed.ok) throw new Error(parsed.error || 'Hyperliquid rejected the close');
      fetchAccount();
      syncRewards('close');
      return { success: true, tx_hash: String(parsed.oid || ''), order_id: parsed.oid, raw: result };
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Hyperliquid close failed');
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [walletMismatch, findMarket, ensureMarkets, positions, tradingExchange, ensureBuilderApproved, fetchAccount, syncRewards]);

  const setTpsl = useCallback(async (symbol, closeSide, takeProfit, stopLoss, _pairIndex, _tradeIndex, amount) => {
    setError(null);
    try {
      if (!takeProfit && !stopLoss) return { success: true };
      const market = findMarket(symbol) || (await ensureMarkets()).find(m => m.symbol === hyperliquidSymbol(symbol));
      if (!market) throw new Error(`No Hyperliquid market for ${symbol}`);
      const closeBuy = isCloseBuySide(closeSide);
      const current = positions.find(p => p.symbol === hyperliquidSymbol(symbol));
      const size = formatHyperliquidSize(num(amount, num(current?.amount)), market);
      if (!(num(size) > 0)) throw new Error('TP/SL size is below the market lot size');
      const builderApprovalResult = await ensureBuilderApproved({ force: true });
      const ordersToPlace = [];
      if (takeProfit) {
        ordersToPlace.push({
          a: market._hyperliquid.index,
          b: closeBuy,
          p: formatHyperliquidPrice(takeProfit),
          s: size,
          r: true,
          t: { trigger: { isMarket: true, triggerPx: formatHyperliquidPrice(takeProfit), tpsl: 'tp' } },
          c: makeHyperliquidCloid(),
        });
      }
      if (stopLoss) {
        ordersToPlace.push({
          a: market._hyperliquid.index,
          b: closeBuy,
          p: formatHyperliquidPrice(stopLoss),
          s: size,
          r: true,
          t: { trigger: { isMarket: true, triggerPx: formatHyperliquidPrice(stopLoss), tpsl: 'sl' } },
          c: makeHyperliquidCloid(),
        });
      }
      const client = await tradingExchange();
      const result = await client.order({
        orders: ordersToPlace,
        grouping: 'positionTpsl',
        ...builderOrderParams(builderApprovalResult),
      });
      const parsed = parseHyperliquidOrderResponse(result);
      if (!parsed.ok) throw new Error(parsed.error || 'Hyperliquid rejected TP/SL');
      fetchOrders();
      return { success: true, raw: result };
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Hyperliquid TP/SL failed');
      setError(msg);
      return { error: msg };
    }
  }, [findMarket, ensureMarkets, positions, tradingExchange, ensureBuilderApproved, fetchOrders]);

  const openOfficialApp = useCallback(() => {
    try { window.open('https://app.hyperliquid.xyz/trade', '_blank', 'noopener,noreferrer'); } catch {}
    return {
      success: true,
      info: 'Opened the official Hyperliquid app.',
    };
  }, []);

  const depositToPacifica = useCallback(async (amount) => {
    const amountText = String(amount ?? '').trim();
    if (!amountText) return openOfficialApp();
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      const parsedAmount = Number(amountText);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) throw new Error('Enter a positive USDC amount');
      if (parsedAmount < HYPERLIQUID_MIN_DEPOSIT_USDC) {
        throw new Error(`Hyperliquid minimum deposit is ${HYPERLIQUID_MIN_DEPOSIT_USDC} USDC`);
      }
      if (typeof ensureChain !== 'function') throw new Error('Wallet chain switch helper is not ready');
      if (typeof getWalletClient !== 'function' || typeof getPublicClient !== 'function') {
        throw new Error('Wallet signer is not ready');
      }

      setLoading(true);
      setError(null);
      await ensureChain(HYPERLIQUID_ARBITRUM_CHAIN_ID);

      let beforeBalances = {
        equity: num(account?.account_equity ?? account?.balance ?? account?.usdc),
        available: num(account?.available_to_withdraw ?? account?.available_to_spend),
        spotUsdc: num(account?.spot_usdc_balance),
        spotAvailable: num(account?.spot_usdc_available),
      };
      try {
        beforeBalances = await readHyperliquidBalances(walletAddr);
      } catch {}

      const publicClient = getPublicClient(HYPERLIQUID_ARBITRUM_CHAIN_ID);
      const walletClient = getWalletClient(HYPERLIQUID_ARBITRUM_CHAIN_ID);
      if (!walletClient) throw new Error('Wallet signer is not ready');

      const rawAmount = parseUnits(amountText, HYPERLIQUID_USDC_DECIMALS);
      const rawBalance = await publicClient.readContract({
        address: HYPERLIQUID_ARBITRUM_USDC_ADDRESS,
        abi: HYPERLIQUID_USDC_ABI,
        functionName: 'balanceOf',
        args: [walletAddr],
      });
      if (rawBalance < rawAmount) {
        const bal = Number(formatUnits(rawBalance, HYPERLIQUID_USDC_DECIMALS));
        throw new Error(`Not enough Arbitrum USDC. Wallet has ${bal.toFixed(2)} USDC`);
      }

      const hash = await walletClient.writeContract({
        address: HYPERLIQUID_ARBITRUM_USDC_ADDRESS,
        abi: HYPERLIQUID_USDC_ABI,
        functionName: 'transfer',
        args: [HYPERLIQUID_BRIDGE2_ADDRESS, rawAmount],
        account: walletAddr,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt?.status !== 'success') throw new Error('Arbitrum USDC deposit transaction failed');

      setDepositStatus({
        status: 'depositing',
        amount: amountText,
        txHash: hash,
        startedAt: Date.now(),
        targetEquity: beforeBalances.equity + parsedAmount,
        targetAvailable: beforeBalances.available + parsedAmount,
        targetSpot: beforeBalances.spotUsdc + parsedAmount,
      });

      const credited = await waitForHyperliquidBalance(walletAddr, snap => (
        snap.available + DEPOSIT_CREDIT_TOLERANCE_USD >= beforeBalances.available + parsedAmount
        || snap.equity + DEPOSIT_CREDIT_TOLERANCE_USD >= beforeBalances.equity + parsedAmount
        || snap.spotUsdc + DEPOSIT_CREDIT_TOLERANCE_USD >= beforeBalances.spotUsdc + parsedAmount
      ), DEPOSIT_CREDIT_TIMEOUT_MS).catch(() => ({ ok: false, snapshot: null }));

      if (credited.ok) {
        const snap = credited.snapshot;
        const creditedToPerps = (
          snap.available + DEPOSIT_CREDIT_TOLERANCE_USD >= beforeBalances.available + parsedAmount
          || snap.equity + DEPOSIT_CREDIT_TOLERANCE_USD >= beforeBalances.equity + parsedAmount
        );
        const creditedToSpot = snap.spotUsdc + DEPOSIT_CREDIT_TOLERANCE_USD >= beforeBalances.spotUsdc + parsedAmount;
        if (!creditedToPerps && creditedToSpot) {
          const moved = await moveSpotToPerp(amountText, { manageLoading: false });
          await fetchAccount();
          if (moved?.error) {
            return {
              success: true,
              tx_hash: hash,
              amount: amountText,
              warning: moved.error,
              info: 'Deposit reached Hyperliquid Spot. Legacy accounts can move it to Trading if it is not available yet.',
            };
          }
          return {
            success: true,
            tx_hash: hash,
            amount: amountText,
            info: moved?.info || 'Deposit credited and moved to Hyperliquid trading balance.',
          };
        }
      }

      await fetchAccount();
      setTimeout(fetchAccount, 12_000);
      setTimeout(fetchAccount, 30_000);
      setTimeout(fetchAccount, 55_000);
      setDepositStatus(null);
      return {
        success: true,
        tx_hash: hash,
        amount: amountText,
        info: credited.ok
          ? 'Deposit credited on Hyperliquid.'
          : 'Deposit sent. Hyperliquid may still be crediting it; refresh shortly if it is not visible yet.',
      };
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Hyperliquid deposit failed');
      setDepositStatus(null);
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, account, ensureChain, getWalletClient, getPublicClient, fetchAccount, openOfficialApp, setDepositStatus, moveSpotToPerp]);

  const withdraw = useCallback(async (amount, destination = walletAddr) => {
    const amountText = String(amount ?? '').trim();
    if (!amountText) return openOfficialApp();
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      if (!isHyperliquidAddress(destination)) throw new Error('Enter a valid Arbitrum destination address');
      const parsedAmount = Number(amountText);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) throw new Error('Enter a positive USDC amount');
      const available = Number(account?.available_to_withdraw ?? 0);
      if (available > 0 && parsedAmount > available) {
        throw new Error(`Withdrawable balance is ${available.toFixed(2)} USDC`);
      }

      setLoading(true);
      setError(null);
      if (typeof ensureChain === 'function') await ensureChain(HYPERLIQUID_ARBITRUM_CHAIN_ID);
      const result = await exchange().withdraw3({
        destination,
        amount: amountText,
      });
      await fetchAccount();
      setTimeout(fetchAccount, 12_000);
      setTimeout(fetchAccount, 45_000);
      return {
        success: true,
        raw: result,
        info: 'Withdrawal requested. Funds usually arrive on Arbitrum in a few minutes.',
      };
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Hyperliquid withdrawal failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, account?.available_to_withdraw, ensureChain, exchange, fetchAccount, openOfficialApp]);
  const activate = useCallback(async () => {
    try {
      await ensureReferralSet();
      await ensureAgentApproved();
      setOneTapEnabled(true);
      return await ensureBuilderApproved({ force: true });
    } catch (e) {
      const msg = hyperliquidErrorMessage(e, 'Hyperliquid one tap setup failed');
      setError(msg);
      return { error: msg };
    }
  }, [ensureReferralSet, ensureAgentApproved, setOneTapEnabled, ensureBuilderApproved]);

  const needsHyperliquidActivation = (oneTapEnabled && agentApproval?.approved === false)
    || builderApproval?.userCanApprove === true;
  const shouldOfferOneTap = !oneTapEnabled || agentApproval?.approved === false || builderApproval?.userCanApprove === true;

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    depositStatus,
    walletEth: null,
    leverageSettings: {},
    marginModes: {},
    dataReady,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setTpsl,
    setLeverage,
    setMarginMode,
    moveSpotToPerp,
    depositToPacifica,
    withdraw,
    activate,
    claimGold,
    isSelfCustody: true,
    isReady,
    walletMismatch,
    registeredEvmWallet,
    oneTapTrading: { ...(agentApproval || {}), enabled: oneTapEnabled },
    setOneTapTradingEnabled: setOneTapEnabled,
    hasReferrer: shouldOfferOneTap ? false : needsHyperliquidActivation ? false : true,
    linkOurReferrer: activate,
  };
}
