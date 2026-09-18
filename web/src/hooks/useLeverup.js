import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { buildLeverupOpenAmounts, leverupUnits, leverupActionError } from '../lib/leverupOrderAmounts';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { useCredentialOperationScope } from './useCredentialOperationScope';
import { useLeverupCollateral } from './useLeverupCollateral';
import { useTradingGoldSync } from './useTradingGoldSync';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import {
  LEVERUP_ACTION_TYPE_NAMES,
  LEVERUP_AGENT_NAME,
  LEVERUP_APP_URL,
  LEVERUP_AUTH_ABI,
  LEVERUP_CHAIN_ID,
  LEVERUP_CURRENT_PERMISSION_MASK,
  LEVERUP_DIAMOND,
  LEVERUP_ERC20_ABI,
  LEVERUP_LVUSD,
  LEVERUP_USDC,
  LEVERUP_ZERO_ADDRESS,
  OneClickAction,
  clearLeverupAgent,
  createAndStoreLeverupAgent,
  isLeverupAgentAuthorized,
  maxLeverupApproval,
  readLeverupAgent,
  selectLeverupFeeToken,
  signLeverupIntent,
} from '../lib/leverupV2';

const POLL_INTERVAL_MS = 15_000;
const FEE_REFRESH_MS = 60_000;
const FEE_TOKEN_STATE_TTL_MS = 30_000;
const GAME_API = import.meta.env.VITE_GAME_API || '/api';

function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/u.test(String(value || '').trim());
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\/USD(?:\.P)?$/u, '')
    .replace(/-USD(?:\.P)?$/u, '');
}

function normalizeLongSide(value) {
  const side = String(value || '').trim().toLowerCase();
  return side === 'bid' || side === 'buy' || side === 'long';
}

function rawPrice(value) {
  return leverupUnits(value, 18);
}

function rawQty(value) {
  return leverupUnits(value, 10);
}

function positionKey(wallet, position) {
  // Timestamp distinguishes a newly opened instance if a venue reuses a hash.
  return `${String(wallet || '').toLowerCase()}:${String(position?.positionHash || '').toLowerCase()}:${Number(position?.timestamp) || 0}`;
}

function validateLeverupOrderRisk(market, margin, leverage) {
  const notional = margin * leverage;
  const tiers = (Array.isArray(market?.leverage_tiers) ? market.leverage_tiers : [])
    .map(row => ({
      notional: num(row?.notional_usd),
      maxLeverage: num(row?.max_leverage),
    }))
    .filter(row => row.notional > 0 && row.maxLeverage > 0)
    .sort((a, b) => a.notional - b.notional);
  if (!tiers.length) {
    const maxLeverage = num(market?.max_leverage, 1);
    if (leverage > maxLeverage) throw new Error(`LeverUp ${market?.symbol || ''} allows up to ${maxLeverage}x leverage`);
    return { notional, maxLeverage };
  }
  const tier = tiers.find(row => notional <= row.notional + 1e-8);
  if (!tier) {
    throw new Error(`LeverUp ${market?.symbol || ''} order value exceeds the ${(tiers.at(-1).notional).toLocaleString()} USD market limit`);
  }
  if (leverage > tier.maxLeverage) {
    throw new Error(`LeverUp ${market?.symbol || ''} allows up to ${tier.maxLeverage}x at this order size`);
  }
  return { notional, maxLeverage: tier.maxLeverage };
}

function actionResultError(status) {
  return leverupActionError(status);
}

export function useLeverup() {
  const { dex } = useDex();
  const active = dex === 'leverup';
  const { address, getWalletClient, getPublicClient, ensureChain } = useEvmWallet();
  const player = usePlayer();
  const walletAddr = isAddress(address) ? String(address).toLowerCase() : null;
  const { capture: captureCredentialOperation, assert: assertCredentialOperation } = useCredentialOperationScope({ player, wallet: walletAddr, dex });
  const gameToken = useMemo(() => (
    (typeof window !== 'undefined' ? window._playerToken : null) || player?.token || null
  ), [player?.token]);

  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [account, setAccount] = useState(null);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [collateralSymbol, setCollateralSymbol] = useLeverupCollateral(walletAddr);
  const collateralToken = collateralSymbol === 'lvUSD' ? LEVERUP_LVUSD : LEVERUP_USDC;
  const collateralDecimals = collateralSymbol === 'lvUSD' ? 18 : 6;
  const collateralBalance = collateralSymbol === 'lvUSD'
    ? (account?.wallet_lvusd_exact ?? account?.wallet_lvusd ?? 0)
    : (account?.wallet_usdc_exact ?? walletUsdc ?? 0);
  const [feeConfig, setFeeConfig] = useState([]);
  const [builderConfig, setBuilderConfig] = useState({
    configured: false,
    active: false,
    brokerId: 0,
    status: 'pending_configuration',
  });
  const [oneTapTrading, setOneTapTrading] = useState({
    enabled: false,
    approved: false,
    signer: null,
    permissions: '0',
    mode: 'leverup_v2',
  });
  const [setupVerified, setSetupVerified] = useState(null);
  const [activationStep, setActivationStep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const signerRef = useRef(null);
  const feeConfigRef = useRef([]);
  const feeTokenStatesRef = useRef({ wallet: null, at: 0, states: new Map() });
  const brokerRef = useRef(builderConfig);
  const pricesRef = useRef([]);
  // Wallet-scoped confirmed closes outlive stale RPC/indexer snapshots.
  // Never infer a close from an empty response or an unsuccessful intent.
  const closedPositionsRef = useRef(new Set());
  const closingPositionsRef = useRef(new Set());

  const registeredWallet = registeredDexWallet(player, 'leverup', 'evm');
  const registeredEvmWallet = isAddress(registeredWallet) ? String(registeredWallet).toLowerCase() : null;
  const walletMismatch = !!(registeredEvmWallet && walletAddr && registeredEvmWallet !== walletAddr);
  const { claimGold, scheduleGoldClaim, goldEarned, clearGoldEarned } = useTradingGoldSync({
    active,
    ready: setupVerified === true && !walletMismatch,
    dex: 'leverup',
    playerId: player?.player_id || player?.id,
    token: gameToken,
    wallet: walletAddr,
    sessionKey: `${LEVERUP_CHAIN_ID}:${registeredEvmWallet || walletAddr || ''}`,
    gameApi: GAME_API,
  });

  useEffect(() => { feeConfigRef.current = feeConfig; }, [feeConfig]);
  useEffect(() => { brokerRef.current = builderConfig; }, [builderConfig]);
  useEffect(() => { pricesRef.current = prices; }, [prices]);

  const baseHeaders = useCallback((extra = {}) => ({
    ...(gameToken ? { 'x-token': gameToken, 'x-dex': 'leverup' } : {}),
    ...(walletAddr ? { 'x-leverup-wallet': walletAddr } : {}),
    ...extra,
  }), [gameToken, walletAddr]);

  const fetchJson = useCallback(async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: baseHeaders(options.headers),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(payload?.error || payload?.detail || `LeverUp request failed (${response.status})`);
      requestError.status = response.status;
      requestError.payload = payload;
      throw requestError;
    }
    return payload;
  }, [baseHeaders]);

  const fetchConfig = useCallback(async () => {
    const payload = await fetchJson('/api/futures/leverup/config');
    const broker = payload?.broker || {};
    setBuilderConfig(broker);
    return payload;
  }, [fetchJson]);

  const fetchFeeConfig = useCallback(async () => {
    const payload = await fetchJson('/api/futures/leverup/fee-config');
    const rows = Array.isArray(payload) ? payload : [];
    feeConfigRef.current = rows;
    setFeeConfig(rows);
    return rows;
  }, [fetchJson]);

  const fetchMarkets = useCallback(async () => {
    const rows = await fetchJson('/api/futures/markets?dex=leverup');
    const normalized = (Array.isArray(rows) ? rows : []).map(row => ({
      ...row,
      dex: 'leverup',
      symbol: normalizeSymbol(row.symbol || row.pair),
      market: row.pairBase || row.market,
      market_addr: row.pairBase || row.market,
      lot_size: row.lot_size || 0.0000000001,
      min_order_size: row.min_order_size || 0.0000000001,
      tick_size: row.tick_size || 10 ** -(num(row.price_decimals, 2)),
      max_leverage: num(row.max_leverage, 50),
      disabled: String(row.status || '').toUpperCase() !== 'AVAILABLE',
      reduce_only: String(row.status || '').toUpperCase() === 'REDUCE_ONLY',
    }));
    setMarkets(normalized);
    setDataReady(normalized.length > 0);
    return normalized;
  }, [fetchJson]);

  const fetchPrices = useCallback(async () => {
    const rows = await fetchJson('/api/futures/prices?dex=leverup');
    const normalized = (Array.isArray(rows) ? rows : []).map(row => ({
      ...row,
      dex: 'leverup',
      symbol: normalizeSymbol(row.symbol),
      mark: String(row.mark_price ?? row.price ?? row.mark ?? 0),
      oracle: row.oracle_price == null ? null : String(row.oracle_price),
      mid: String(row.mark_price ?? row.price ?? row.mark ?? 0),
      bid: String(row.mark_price ?? row.price ?? row.mark ?? 0),
      ask: String(row.mark_price ?? row.price ?? row.mark ?? 0),
    }));
    pricesRef.current = normalized;
    setPrices(normalized);
    return normalized;
  }, [fetchJson]);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr || !gameToken || walletMismatch) return null;
    const scope = captureCredentialOperation();
    const query = `?dex=leverup&address=${encodeURIComponent(walletAddr)}`;
    const [accountRow, positionRows, orderRows] = await Promise.all([
      fetchJson(`/api/futures/leverup/account${query}`),
      fetchJson(`/api/futures/leverup/positions${query}`),
      fetchJson(`/api/futures/leverup/orders${query}`),
    ]);
    assertCredentialOperation(scope);
    const latestPrices = new Map(pricesRef.current.map(row => [normalizeSymbol(row.symbol), num(row.mark ?? row.price)]));
    const normalizedPositions = (Array.isArray(positionRows) ? positionRows : [])
      .filter(row => !closedPositionsRef.current.has(positionKey(walletAddr, row)))
      .map((row) => {
      const markPrice = latestPrices.get(normalizeSymbol(row.symbol)) || num(row.mark_price || row.entry_price);
      const entryPrice = num(row.entry_price);
      const qty = num(row.qty ?? row.size ?? row.amount);
      const direction = normalizeLongSide(row.side) ? 1 : -1;
      const pricePnl = qty * (markPrice - entryPrice) * direction;
      const fundingPnl = num(row.funding_fee);
      const holdingFee = Math.max(0, num(row.holding_fee));
      const unrealizedPnl = pricePnl + fundingPnl - holdingFee;
      return {
        ...row,
        mark_price: markPrice,
        price_pnl: pricePnl,
        unrealized_pnl: unrealizedPnl,
        pnl: unrealizedPnl,
      };
    });
    const usdcBalance = num(accountRow?.wallet_usdc ?? accountRow?.available_balance);
    const walletBalance = usdcBalance + num(accountRow?.wallet_lvusd);
    const totalMargin = normalizedPositions.reduce((sum, row) => sum + Math.max(0, num(row.margin)), 0);
    const totalUnrealizedPnl = normalizedPositions.reduce((sum, row) => sum + num(row.unrealized_pnl), 0);
    const normalizedOrders = Array.isArray(orderRows) ? orderRows : [];
    const totalOrderCollateral = normalizedOrders.reduce((sum, row) => (
      row.type === 'limit' ? sum + Math.max(0, num(row.collateral ?? row.margin ?? row.amount_in)) : sum
    ), 0);
    const equity = walletBalance + totalMargin + totalOrderCollateral + totalUnrealizedPnl;
    const enrichedAccount = {
      ...accountRow,
      balance: walletBalance,
      total_balance: equity,
      account_equity: equity,
      equity,
      available_balance: walletBalance,
      available_to_spend: walletBalance,
      available_to_withdraw: walletBalance,
      free_collateral: walletBalance,
      free_margin: walletBalance,
      total_margin_used: totalMargin,
      total_order_collateral: totalOrderCollateral,
      unrealized_pnl: totalUnrealizedPnl,
      positions_count: normalizedPositions.length,
      orders_count: normalizedOrders.length,
    };
    setAccount(enrichedAccount);
    setWalletUsdc(usdcBalance);
    setPositions(normalizedPositions);
    setOrders(normalizedOrders);
    return enrichedAccount;
  }, [fetchJson, gameToken, walletAddr, walletMismatch, captureCredentialOperation, assertCredentialOperation]);

  const verifyOneTap = useCallback(async ({ quiet = false } = {}) => {
    let scope;
    try { scope = captureCredentialOperation(); } catch { return false; }
    if (!walletAddr || walletMismatch) {
      signerRef.current = null;
      setOneTapTrading({ enabled: false, approved: false, signer: null, permissions: '0', mode: 'leverup_v2' });
      setSetupVerified(false);
      return false;
    }
    const stored = readLeverupAgent(walletAddr);
    signerRef.current = stored;
    if (!stored) {
      setOneTapTrading({ enabled: false, approved: false, signer: null, permissions: '0', mode: 'leverup_v2' });
      setSetupVerified(false);
      return false;
    }
    try {
      const publicClient = getPublicClient(LEVERUP_CHAIN_ID);
      const auth = await publicClient.readContract({
        address: LEVERUP_DIAMOND,
        abi: LEVERUP_AUTH_ABI,
        functionName: 'getAgentAuth',
        args: [walletAddr, stored.address],
      });
      const approved = isLeverupAgentAuthorized(auth, stored.address);
      assertCredentialOperation(scope);
      const allowance = await publicClient.readContract({
        address: LEVERUP_USDC,
        abi: LEVERUP_ERC20_ABI,
        functionName: 'allowance',
        args: [walletAddr, LEVERUP_DIAMOND],
      });
      const allowanceReady = allowance === maxLeverupApproval();
      assertCredentialOperation(scope);
      const enabled = approved && allowanceReady;
      setOneTapTrading({
        enabled,
        approved,
        signer: stored.address,
        permissions: String(auth?.permissions || 0),
        allowanceReady,
        mode: 'leverup_v2',
      });
      setSetupVerified(enabled);
      return enabled;
    } catch (requestError) {
      try { assertCredentialOperation(scope); } catch { return false; }
      if (!quiet) setError(requestError?.shortMessage || requestError?.message || 'LeverUp signer verification failed');
      setOneTapTrading({ enabled: false, approved: false, signer: stored.address, permissions: '0', mode: 'leverup_v2' });
      setSetupVerified(false);
      return false;
    }
  }, [getPublicClient, walletAddr, walletMismatch, captureCredentialOperation, assertCredentialOperation]);

  const activate = useCallback(async () => {
    if (!walletAddr) return { error: 'Connect your EVM wallet first' };
    if (walletMismatch) return { error: 'Connected wallet does not match the LeverUp wallet linked to this Clash account' };
    setLoading(true);
    setError(null);
    try {
      const scope = captureCredentialOperation();
      await ensureChain(LEVERUP_CHAIN_ID);
      assertCredentialOperation(scope);
      const publicClient = getPublicClient(LEVERUP_CHAIN_ID);
      const walletClient = getWalletClient(LEVERUP_CHAIN_ID);
      if (!walletClient?.writeContract) throw new Error('Monad wallet signer is unavailable');
      let stored = readLeverupAgent(walletAddr);
      if (!stored) stored = createAndStoreLeverupAgent(walletAddr, { scope });
      signerRef.current = stored;

      setActivationStep('Checking existing LeverUp V2 agent');
      const namedAgent = await publicClient.readContract({
        address: LEVERUP_DIAMOND,
        abi: LEVERUP_AUTH_ABI,
        functionName: 'getAgentByName',
        args: [walletAddr, LEVERUP_AGENT_NAME],
      });
      assertCredentialOperation(scope);
      if (String(namedAgent).toLowerCase() !== LEVERUP_ZERO_ADDRESS
        && String(namedAgent).toLowerCase() !== stored.address.toLowerCase()) {
        setActivationStep('Revoking an unavailable old browser signer');
        const revokeHash = await walletClient.writeContract({
          account: walletAddr,
          address: LEVERUP_DIAMOND,
          abi: LEVERUP_AUTH_ABI,
          functionName: 'revokeAgentByName',
          args: [LEVERUP_AGENT_NAME],
        });
        await publicClient.waitForTransactionReceipt({ hash: revokeHash });
        assertCredentialOperation(scope);
      }

      const currentAuth = await publicClient.readContract({
        address: LEVERUP_DIAMOND,
        abi: LEVERUP_AUTH_ABI,
        functionName: 'getAgentAuth',
        args: [walletAddr, stored.address],
      });
      assertCredentialOperation(scope);
      if (!isLeverupAgentAuthorized(currentAuth, stored.address)) {
        setActivationStep('Authorizing Clash one-click trading');
        const authHash = await walletClient.writeContract({
          account: walletAddr,
          address: LEVERUP_DIAMOND,
          abi: LEVERUP_AUTH_ABI,
          functionName: 'authorizeAgent',
          args: [stored.address, LEVERUP_AGENT_NAME, LEVERUP_CURRENT_PERMISSION_MASK],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: authHash });
        assertCredentialOperation(scope);
        if (receipt.status !== 'success') throw new Error('LeverUp agent authorization failed onchain');
      }

      const allowance = await publicClient.readContract({
        address: LEVERUP_USDC,
        abi: LEVERUP_ERC20_ABI,
        functionName: 'allowance',
        args: [walletAddr, LEVERUP_DIAMOND],
      });
      assertCredentialOperation(scope);
      if (allowance !== maxLeverupApproval()) {
        setActivationStep('Approving USDC for LeverUp trading');
        const approveHash = await walletClient.writeContract({
          account: walletAddr,
          address: LEVERUP_USDC,
          abi: LEVERUP_ERC20_ABI,
          functionName: 'approve',
          args: [LEVERUP_DIAMOND, maxLeverupApproval()],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
        assertCredentialOperation(scope);
        if (receipt.status !== 'success') throw new Error('LeverUp USDC approval failed onchain');
        feeTokenStatesRef.current = { wallet: null, at: 0, states: new Map() };
      }
      const verified = await verifyOneTap();
      assertCredentialOperation(scope);
      if (!verified) throw new Error('LeverUp one-click signer did not verify onchain');
      await fetchAccount();
      return { success: true, signer: stored.address };
    } catch (requestError) {
      const message = requestError?.shortMessage || requestError?.message || 'LeverUp setup failed';
      setError(message);
      return { error: message };
    } finally {
      setActivationStep(null);
      setLoading(false);
    }
  }, [ensureChain, fetchAccount, getPublicClient, getWalletClient, verifyOneTap, walletAddr, walletMismatch, captureCredentialOperation, assertCredentialOperation]);

  const disableOneTap = useCallback(async () => {
    if (!walletAddr) return { success: true };
    setLoading(true);
    try {
      const scope = captureCredentialOperation();
      const stored = readLeverupAgent(walletAddr);
      if (!stored) return { success: true };
      await ensureChain(LEVERUP_CHAIN_ID);
      assertCredentialOperation(scope);
      const publicClient = getPublicClient(LEVERUP_CHAIN_ID);
      const walletClient = getWalletClient(LEVERUP_CHAIN_ID);
      const auth = await publicClient.readContract({
        address: LEVERUP_DIAMOND,
        abi: LEVERUP_AUTH_ABI,
        functionName: 'getAgentAuth',
        args: [walletAddr, stored.address],
      });
      assertCredentialOperation(scope);
      if (String(auth?.agent || '').toLowerCase() !== LEVERUP_ZERO_ADDRESS) {
        const hash = await walletClient.writeContract({
          account: walletAddr,
          address: LEVERUP_DIAMOND,
          abi: LEVERUP_AUTH_ABI,
          functionName: 'revokeAgent',
          args: [stored.address],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        assertCredentialOperation(scope);
        if (receipt.status !== 'success') throw new Error('LeverUp signer revocation failed onchain');
      }
      await clearLeverupAgent(walletAddr, { scope });
      assertCredentialOperation(scope);
      signerRef.current = null;
      setOneTapTrading({ enabled: false, approved: false, signer: null, permissions: '0', mode: 'leverup_v2' });
      setSetupVerified(false);
      return { success: true };
    } catch (requestError) {
      const message = requestError?.shortMessage || requestError?.message || 'LeverUp signer revocation failed';
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [ensureChain, getPublicClient, getWalletClient, walletAddr, captureCredentialOperation, assertCredentialOperation]);

  const setOneTapTradingEnabled = useCallback(async (enabled = true) => (
    enabled ? activate() : disableOneTap()
  ), [activate, disableOneTap]);

  const findMarket = useCallback((symbol) => {
    const normalized = normalizeSymbol(symbol);
    return markets.find(row => normalizeSymbol(row.symbol) === normalized) || null;
  }, [markets]);

  const findPrice = useCallback((symbol) => {
    const normalized = normalizeSymbol(symbol);
    const row = prices.find(price => normalizeSymbol(price.symbol) === normalized);
    return row?.mark ?? row?.price ?? row?.mid ?? 0;
  }, [prices]);

  const readFeeTokenStates = useCallback(async (action = null, { force = false } = {}) => {
    const publicClient = getPublicClient(LEVERUP_CHAIN_ID);
    const tokenAddresses = [...new Set(feeConfigRef.current
      .filter(row => (action == null || Number(row?.action) === Number(action)) && row?.enabled === true)
      .map(row => String(row?.feeToken || '').toLowerCase())
      .filter(addressValue => isAddress(addressValue) && addressValue !== LEVERUP_ZERO_ADDRESS))];
    const cached = feeTokenStatesRef.current;
    const sameWallet = cached.wallet === walletAddr;
    const cacheFresh = sameWallet && Date.now() - cached.at < FEE_TOKEN_STATE_TTL_MS;
    if (!force && cacheFresh && tokenAddresses.every(token => cached.states.has(token))) {
      return cached.states;
    }
    const states = sameWallet ? new Map(cached.states) : new Map();
    await Promise.all(tokenAddresses.map(async (token) => {
      try {
        const [balance, allowance] = await Promise.all([
          publicClient.readContract({ address: token, abi: LEVERUP_ERC20_ABI, functionName: 'balanceOf', args: [walletAddr] }),
          publicClient.readContract({ address: token, abi: LEVERUP_ERC20_ABI, functionName: 'allowance', args: [walletAddr, LEVERUP_DIAMOND] }),
        ]);
        states.set(token, { balance, allowance });
      } catch {
        // Each action exposes several fee-token options. An unavailable token
        // must not prevent the official priority selector from trying USDC or
        // another healthy option.
      }
    }));
    feeTokenStatesRef.current = { wallet: walletAddr, at: Date.now(), states };
    return states;
  }, [getPublicClient, walletAddr]);

  const submitAction = useCallback(async (action, actionValues, { additionalSpends = [] } = {}) => {
    if (!walletAddr || walletMismatch) throw new Error('Connect the LeverUp wallet linked to this Clash account');
    const ready = await verifyOneTap({ quiet: true });
    const stored = readLeverupAgent(walletAddr);
    if (!ready || !stored) throw new Error('Enable LeverUp one-click trading first');
    if (!LEVERUP_ACTION_TYPE_NAMES[action]) throw new Error('Unsupported LeverUp V2 action');
    let currentFeeConfig = feeConfigRef.current;
    if (!currentFeeConfig.length) currentFeeConfig = await fetchFeeConfig();
    const tokenStates = await readFeeTokenStates(action);
    const selected = selectLeverupFeeToken(action, currentFeeConfig, tokenStates, additionalSpends);
    const envelope = await signLeverupIntent({
      trader: walletAddr,
      privateKey: stored.privateKey,
      action,
      actionValues,
      feeToken: selected.feeToken,
      antiDdosFee: selected.antiDdosFee,
    });
    const submitted = await fetchJson('/api/futures/leverup/intents?dex=leverup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    const intentHash = submitted?.intentHash;
    if (!/^0x[0-9a-fA-F]{64}$/u.test(String(intentHash || ''))) {
      throw new Error('LeverUp relayer did not return an intent hash');
    }
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const status = await fetchJson(`/api/futures/leverup/intents/${intentHash}?dex=leverup&account=${walletAddr}`);
      if (status?.executed || status?.skipped) {
        feeTokenStatesRef.current = { ...feeTokenStatesRef.current, at: 0 };
        if (status?.success !== true) throw new Error(actionResultError(status));
        if (submitted?.rewardTracking === true) scheduleGoldClaim();
        setTimeout(() => { void fetchAccount().catch(() => null); }, 1_500);
        return { success: true, intentHash, transactionHash: status?.txnHash || null, status };
      }
      await new Promise(resolve => window.setTimeout(resolve, 500));
    }
    throw new Error('LeverUp V2 intent execution timed out');
  }, [fetchAccount, fetchFeeConfig, fetchJson, readFeeTokenStates, scheduleGoldClaim, verifyOneTap, walletAddr, walletMismatch]);

  const ensureCollateralAllowance = useCallback(async (amount) => {
    const scope = captureCredentialOperation();
    if (!walletAddr || walletMismatch) throw new Error('Connect the LeverUp wallet linked to this Clash account');
    const publicClient = getPublicClient(LEVERUP_CHAIN_ID);
    const [balance, allowance] = await Promise.all([
      publicClient.readContract({ address: collateralToken, abi: LEVERUP_ERC20_ABI, functionName: 'balanceOf', args: [walletAddr] }),
      publicClient.readContract({ address: collateralToken, abi: LEVERUP_ERC20_ABI, functionName: 'allowance', args: [walletAddr, LEVERUP_DIAMOND] }),
    ]);
    assertCredentialOperation(scope);
    if (balance < amount) throw new Error(`Insufficient ${collateralSymbol} balance including the open fee`);
    if (allowance < amount) {
      await ensureChain(LEVERUP_CHAIN_ID);
      assertCredentialOperation(scope);
      setActivationStep(`Approve ${collateralSymbol} for LeverUp trading in your wallet`);
      try {
        const walletClient = getWalletClient(LEVERUP_CHAIN_ID);
        const hash = await walletClient.writeContract({ account: walletAddr, address: collateralToken,
          abi: LEVERUP_ERC20_ABI, functionName: 'approve', args: [LEVERUP_DIAMOND, maxLeverupApproval()] });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        assertCredentialOperation(scope);
        if (receipt.status !== 'success') throw new Error(`${collateralSymbol} approval failed onchain`);
      } finally { setActivationStep(null); }
    }
    feeTokenStatesRef.current = { wallet: null, at: 0, states: new Map() };
  }, [captureCredentialOperation, assertCredentialOperation, walletAddr, walletMismatch, getPublicClient, getWalletClient, ensureChain, collateralToken, collateralSymbol]);

  const placeMarketOrder = useCallback(async (symbol, side, collateral, slippage = '0.5', leverage = 1, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      void options;
      const market = findMarket(symbol);
      const mark = findPrice(symbol);
      if (!market || !(mark > 0)) throw new Error(`LeverUp ${symbol} market price is unavailable`);
      if (market.disabled) throw new Error(`LeverUp ${symbol} market is not open for new positions`);
      const margin = num(collateral);
      const lev = Math.max(1, num(leverage, 1));
      if (!(margin > 0)) throw new Error(`Enter a positive ${collateralSymbol} margin`);
      validateLeverupOrderRisk(market, margin, lev);
      const isLong = normalizeLongSide(side);
      const marketSlippagePct = isLong
        ? num(market.slippage_long_pct)
        : num(market.slippage_short_pct);
      const amounts = buildLeverupOpenAmounts({ margin: collateral, leverage, price: mark,
        feeRate: market.open_fee_rate || 0, isLong, collateralDecimals,
        slippage: Math.max(0.001, num(slippage, 0.5), marketSlippagePct) });
      const { amountIn } = amounts;
      if (leverupUnits(collateralBalance, collateralDecimals) < amountIn) {
        throw new Error(`LeverUp needs ${formatUnits(amountIn, collateralDecimals)} ${collateralSymbol} including the open fee`);
      }
      await ensureCollateralAllowance(amountIn);
      const broker = brokerRef.current?.active ? Number(brokerRef.current.brokerId) : 0;
      return await submitAction(OneClickAction.MARKET_OPEN, [
        market.pairBase || market.market,
        isLong,
        collateralToken,
        LEVERUP_LVUSD,
        amountIn,
        amounts.qty,
        amounts.price,
        0n,
        0n,
        broker,
        0n,
      ], { additionalSpends: [{ token: collateralToken, amount: amountIn }] });
    } catch (requestError) {
      const message = requestError?.shortMessage || requestError?.message || 'LeverUp market order failed';
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [findMarket, findPrice, submitAction, collateralToken, collateralDecimals, collateralSymbol, collateralBalance, ensureCollateralAllowance]);

  const placeLimitOrder = useCallback(async (symbol, side, price, collateral, _tif = 'GTC', leverage = 1, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      void _tif;
      const market = findMarket(symbol);
      const limitPrice = num(price);
      if (!market || !(limitPrice > 0)) throw new Error(`LeverUp ${symbol} limit price is invalid`);
      if (market.disabled) throw new Error(`LeverUp ${symbol} market is not open for new positions`);
      const margin = num(collateral);
      const lev = Math.max(1, num(leverage, 1));
      if (!(margin > 0)) throw new Error(`Enter a positive ${collateralSymbol} margin`);
      validateLeverupOrderRisk(market, margin, lev);
      const amounts = buildLeverupOpenAmounts({ margin: collateral, leverage, price,
        feeRate: market.open_fee_rate || 0, collateralDecimals });
      const { amountIn } = amounts;
      if (leverupUnits(collateralBalance, collateralDecimals) < amountIn) {
        throw new Error(`LeverUp needs ${formatUnits(amountIn, collateralDecimals)} ${collateralSymbol} including the open fee`);
      }
      await ensureCollateralAllowance(amountIn);
      const broker = brokerRef.current?.active ? Number(brokerRef.current.brokerId) : 0;
      // V2 limit opens can carry protective prices before a position exists.
      // Market opens use broker-attributed decrease orders after indexing instead.
      const takeProfit = num(options?.take_profit ?? options?.takeProfit ?? options?.tp);
      const stopLoss = num(options?.stop_loss ?? options?.stopLoss ?? options?.sl);
      return await submitAction(OneClickAction.LIMIT_OPEN, [
        market.pairBase || market.market,
        normalizeLongSide(side),
        collateralToken,
        LEVERUP_LVUSD,
        amountIn,
        amounts.qty,
        amounts.price,
        stopLoss > 0 ? rawPrice(stopLoss) : 0n,
        takeProfit > 0 ? rawPrice(takeProfit) : 0n,
        broker,
        0n,
      ], { additionalSpends: [{ token: collateralToken, amount: amountIn }] });
    } catch (requestError) {
      const message = requestError?.shortMessage || requestError?.message || 'LeverUp limit order failed';
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [findMarket, submitAction, collateralToken, collateralDecimals, collateralSymbol, collateralBalance, ensureCollateralAllowance]);

  const closePosition = useCallback(async (symbolOrPosition, _sideArg, amountArg) => {
    const position = typeof symbolOrPosition === 'object'
      ? symbolOrPosition
      : positions.find(row => normalizeSymbol(row.symbol) === normalizeSymbol(symbolOrPosition));
    if (!position?.positionHash) return { error: 'LeverUp position hash is missing' };
    const key = positionKey(walletAddr, position);
    if (closedPositionsRef.current.has(key)) return { error: 'This LeverUp position is already closed. Refresh your account.' };
    if (closingPositionsRef.current.has(key)) return { error: 'This LeverUp position is already being closed. Wait for confirmation.' };
    closingPositionsRef.current.add(key);
    setLoading(true);
    setError(null);
    try {
      const scope = captureCredentialOperation();
      const broker = brokerRef.current?.active ? Number(brokerRef.current.brokerId) : 0;
      const currentQty = num(position.qty ?? position.size ?? position.amount);
      const requestedQty = num(amountArg, currentQty);
      const partial = requestedQty > 0 && currentQty > 0 && requestedQty < currentQty - 1e-10;
      const result = partial
        ? await submitAction(OneClickAction.PARTIAL_CLOSE, [position.positionHash, rawQty(requestedQty), broker])
        : await submitAction(OneClickAction.MARKET_CLOSE, [position.positionHash, broker]);
      if (result?.success === true && !partial) {
        closedPositionsRef.current.add(key);
        assertCredentialOperation(scope);
        setPositions(rows => rows.filter(row => positionKey(walletAddr, row) !== key));
      }
      // Keep successful execution successful even if the subsequent read fails.
      if (result?.success === true) void fetchAccount().catch(() => null);
      return result;
    } catch (requestError) {
      const message = requestError?.shortMessage || requestError?.message || 'LeverUp close failed';
      setError(message);
      return { error: message };
    } finally {
      closingPositionsRef.current.delete(key);
      setLoading(false);
    }
  }, [positions, submitAction, walletAddr, fetchAccount, captureCredentialOperation, assertCredentialOperation]);

  const cancelOrder = useCallback(async (symbolOrOrder, orderIdArg) => {
    const order = typeof symbolOrOrder === 'object' ? symbolOrOrder : null;
    const orderHash = order?.orderHash || order?.order_id || orderIdArg;
    if (!/^0x[0-9a-fA-F]{64}$/u.test(String(orderHash || ''))) return { error: 'LeverUp order hash is missing' };
    setLoading(true);
    setError(null);
    try {
      const decrease = order?.type === 'take_profit' || order?.type === 'stop_loss';
      return await submitAction(decrease ? OneClickAction.CANCEL_DECREASE_ORDER : OneClickAction.LIMIT_CANCEL, [orderHash]);
    } catch (requestError) {
      const message = requestError?.shortMessage || requestError?.message || 'LeverUp cancel failed';
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [submitAction]);

  const setTpsl = useCallback(async (symbol, side, tpPrice, slPrice) => {
    setLoading(true);
    setError(null);
    try {
      const wantLong = !normalizeLongSide(side);
      const findPosition = rows => rows.find(row => (
        normalizeSymbol(row.symbol) === normalizeSymbol(symbol)
        && normalizeLongSide(row.side) === wantLong
      )) || rows.find(row => normalizeSymbol(row.symbol) === normalizeSymbol(symbol));
      let position = findPosition(positions);
      // LeverUp documents an indexer delay after opens. Wait for getPositionsV4
      // visibility before creating broker-attributed decrease orders.
      for (let attempt = 0; !position && attempt < 20; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, attempt === 0 ? 500 : 750));
        const query = `?dex=leverup&address=${encodeURIComponent(walletAddr)}`;
        const rows = await fetchJson(`/api/futures/leverup/positions${query}`);
        const nextPositions = (Array.isArray(rows) ? rows : []).filter(row => !closedPositionsRef.current.has(positionKey(walletAddr, row)));
        setPositions(nextPositions);
        position = findPosition(nextPositions);
      }
      if (!position?.positionHash) throw new Error(`No open LeverUp ${symbol} position found`);
      const broker = brokerRef.current?.active ? Number(brokerRef.current.brokerId) : 0;
      const related = orders.filter(row => (
        String(row.positionHash || '').toLowerCase() === String(position.positionHash).toLowerCase()
        && (row.type === 'take_profit' || row.type === 'stop_loss')
      ));
      const desired = [
        { type: 'take_profit', kind: 0, price: num(tpPrice) },
        { type: 'stop_loss', kind: 1, price: num(slPrice) },
      ];
      const closeQty = rawQty(num(position.qty ?? position.size ?? position.amount));
      const updates = [];
      const creates = [];
      const cancels = [];
      for (const target of desired) {
        const existing = related.find(row => row.type === target.type);
        if (existing && target.price > 0) {
          updates.push([existing.orderHash || existing.order_id, rawPrice(target.price), closeQty, broker]);
        } else if (existing) {
          cancels.push(existing.orderHash || existing.order_id);
        } else if (target.price > 0) {
          creates.push([target.kind, rawPrice(target.price), closeQty, broker]);
        }
      }
      for (const orderHash of cancels) {
        const result = await submitAction(OneClickAction.CANCEL_DECREASE_ORDER, [orderHash]);
        if (result?.error) return result;
      }
      if (updates.length) {
        const result = await submitAction(OneClickAction.BATCH_UPDATE_DECREASE_ORDERS, [updates]);
        if (result?.error) return result;
      }
      if (creates.length) {
        const result = await submitAction(OneClickAction.BATCH_CREATE_DECREASE_ORDERS, [position.positionHash, creates]);
        if (result?.error) return result;
      }
      return { success: true };
    } catch (requestError) {
      const message = requestError?.shortMessage || requestError?.message || 'LeverUp TP/SL failed';
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [fetchJson, orders, positions, submitAction, walletAddr]);

  const setLeverage = useCallback(async (symbol, leverage) => ({
    success: true,
    symbol: normalizeSymbol(symbol),
    leverage: num(leverage, 1),
    local: true,
  }), []);

  const openOfficialApp = useCallback(() => {
    if (typeof window !== 'undefined') window.open(LEVERUP_APP_URL, '_blank', 'noopener,noreferrer');
    return LEVERUP_APP_URL;
  }, []);

  useEffect(() => {
    if (!active) return;
    void Promise.all([fetchConfig(), fetchFeeConfig(), fetchMarkets(), fetchPrices()]).catch((requestError) => {
      setError(requestError?.message || 'LeverUp market data failed');
    });
  }, [active, fetchConfig, fetchFeeConfig, fetchMarkets, fetchPrices]);

  useEffect(() => {
    if (!active || !walletAddr || !feeConfig.length) return;
    void readFeeTokenStates(null, { force: true }).catch(() => null);
  }, [active, feeConfig, readFeeTokenStates, walletAddr]);

  useEffect(() => {
    if (!active || !walletAddr) return;
    setSetupVerified(null);
    void verifyOneTap().then(() => fetchAccount()).catch(() => null);
  }, [active, fetchAccount, verifyOneTap, walletAddr]);

  useEffect(() => {
    if (!active) return undefined;
    const feeInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchFeeConfig().catch(() => null);
      }
    }, FEE_REFRESH_MS);
    const accountInterval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchPrices();
      if (walletAddr && setupVerified === true) void fetchAccount().catch(() => null);
    }, POLL_INTERVAL_MS);
    const refreshFeeState = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchFeeConfig().catch(() => null);
    };
    window.addEventListener('focus', refreshFeeState);
    document.addEventListener('visibilitychange', refreshFeeState);
    return () => {
      window.clearInterval(feeInterval);
      window.clearInterval(accountInterval);
      window.removeEventListener('focus', refreshFeeState);
      document.removeEventListener('visibilitychange', refreshFeeState);
    };
  }, [active, fetchAccount, fetchFeeConfig, fetchPrices, readFeeTokenStates, setupVerified, walletAddr]);

  const clearError = useCallback(() => setError(null), []);

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    leverageSettings: {},
    loading,
    error,
    clearError,
    dataReady,
    accountReady: !!account || !walletAddr,
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder,
    closePosition,
    setTpsl,
    setLeverage,
    activate,
    disconnect: disableOneTap,
    fetchAccount,
    fetchPositions: fetchAccount,
    fetchOrders: fetchAccount,
    fetchBalance: fetchAccount,
    refresh: fetchAccount,
    isSelfCustody: true,
    isReady: setupVerified === true,
    setupVerified,
    activationStep,
    oneTapTrading,
    setOneTapTradingEnabled,
    walletMismatch,
    registeredEvmWallet,
    builderConfig,
    builderAccepted: builderConfig?.active === true,
    brokerPending: builderConfig?.active !== true,
    claimGold,
    goldEarned,
    clearGoldEarned,
    openReferralJoin: openOfficialApp,
    referralUrl: LEVERUP_APP_URL,
    chainId: LEVERUP_CHAIN_ID,
    collateralSymbol,
    collateralBalance: Number(collateralBalance),
    setCollateralSymbol,
  };
}
