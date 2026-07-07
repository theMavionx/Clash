import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import { signDangoTx } from '../lib/dangoBrowserSigner';
import { ARBITRUM_CHAIN_ID } from '../lib/gmxConfig';

const FUTURES_API = '/api/futures';
const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const POLL_INTERVAL_MS = 30_000;
const DANGO_DEPOSIT_URL = 'https://dango.exchange/bridge';
const DANGO_ARBITRUM_SOURCE_CHAIN = Object.freeze({
  id: ARBITRUM_CHAIN_ID,
  key: 'arbitrum',
  name: 'Arbitrum',
  shortName: 'ARB',
  token: 'USDC',
  tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  tokenDecimals: 6,
  routerAddress: '0x9d0ea335355da17ee89e50df43ab823416cf73d4',
});
const DANGO_ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
];
const DANGO_HYPERLANE_ROUTER_ABI = [
  {
    type: 'function',
    name: 'transferRemote',
    stateMutability: 'payable',
    inputs: [
      { name: '_destination', type: 'uint32' },
      { name: '_recipient', type: 'bytes32' },
      { name: '_amountOrId', type: 'uint256' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
];

function playerToken(player) {
  return player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
}

function isDangoAddress(value) {
  return /^0x[0-9a-fA-F]{1,64}$/u.test(String(value || '').trim());
}

function normalizeDangoAddress(value) {
  const raw = String(value || '').trim().toLowerCase();
  return isDangoAddress(raw) ? raw : '';
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.markets)) return payload.markets;
  if (payload && typeof payload === 'object') return Object.values(payload).filter(v => v && typeof v === 'object');
  return [];
}

function normalizeMarket(row) {
  const symbol = String(row?.symbol || row?.display_symbol || '').toUpperCase();
  if (!symbol) return null;
  const price = num(row?.mark ?? row?.mark_price ?? row?.price);
  const minNotionalUsd = num(row?.min_notional_usd ?? row?.min_order_size);
  return {
    ...row,
    symbol,
    mark: String((row?.mark ?? row?.mark_price ?? price) || ''),
    mark_price: String((row?.mark_price ?? row?.mark ?? price) || ''),
    price: String((row?.price ?? row?.mark ?? price) || ''),
    max_leverage: num(row?.max_leverage, 50),
    lot_size: String(row?.lot_size || row?.quantity_step || '0.000001'),
    quantity_step: String(row?.quantity_step || row?.lot_size || '0.000001'),
    min_order_size: String(row?.min_order_size || '0'),
    min_notional_usd: String(minNotionalUsd || ''),
    margin_modes: ['cross'],
    supports_cross_margin: true,
    supports_isolated_margin: false,
  };
}

function normalizePrice(row) {
  const symbol = String(row?.symbol || row?.display_symbol || '').toUpperCase();
  if (!symbol) return null;
  const price = row?.mark ?? row?.mark_price ?? row?.price;
  return {
    ...row,
    symbol,
    mark: String(row?.mark ?? price ?? ''),
    mark_price: String(row?.mark_price ?? price ?? ''),
    price: String(price ?? ''),
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `Dango request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function dangoSignatureError(action, payload = null) {
  const suffix = payload?.message
    ? ' The server returned a Dango message object for the browser signer.'
    : '';
  return `Dango ${action} requires a browser-signed Dango transaction or approved session credential.${suffix}`;
}

function dangoCloseSideClosesLong(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'sell' || s === 'short' || s === 'close_long';
}

function dangoTpslTriggerDirection(closeSide, leg) {
  const closesLong = dangoCloseSideClosesLong(closeSide);
  return leg === 'tp'
    ? (closesLong ? 'above' : 'below')
    : (closesLong ? 'below' : 'above');
}

function dangoAccountToBytes32(account) {
  const clean = normalizeDangoAddress(account);
  if (!clean) throw new Error('Dango account address required');
  return `0x${clean.slice(2).padStart(64, '0')}`;
}

export function useDango() {
  const { dex } = useDex();
  const isActiveDex = dex === 'dango';
  const evm = useEvmWallet();
  const { address, ensureChain, getWalletClient, getPublicClient } = evm;
  const player = usePlayer();
  const token = playerToken(player);
  const registered = registeredDexWallet(player, 'dango', 'evm');
  const walletAddr = normalizeDangoAddress(registered) || normalizeDangoAddress(address) || '';
  const sourceWalletAddr = normalizeDangoAddress(address) || walletAddr;

  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [depositStatus, setDepositStatus] = useState(null);
  const [bridgeConfig, setBridgeConfig] = useState(null);
  const [bridgeSourceBalances, setBridgeSourceBalances] = useState({});
  const [bridgeSourceBalanceStatus, setBridgeSourceBalanceStatus] = useState({});
  const [bridgeDepositSourceChainId, setBridgeDepositSourceChainId] = useState(DANGO_ARBITRUM_SOURCE_CHAIN.id);

  const claimGoldRef = useRef(null);

  const headers = useCallback((extra = {}) => {
    const out = {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token, 'x-dex': 'dango' } : {}),
    };
    for (const [key, value] of Object.entries(extra || {})) {
      if (value == null) delete out[key];
      else out[key] = value;
    }
    return out;
  }, [token]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const authedGet = useCallback((path) => fetchJson(path, {
    headers: headers({ 'Content-Type': undefined }),
  }), [headers]);

  const fetchMarkets = useCallback(async () => {
    try {
      const data = await fetchJson(`${FUTURES_API}/markets?dex=dango`);
      const normalized = rows(data).map(normalizeMarket).filter(Boolean);
      setMarkets(normalized);
      setPrices(normalized.map(normalizePrice).filter(Boolean));
      return normalized;
    } catch (e) {
      console.warn('[useDango] markets:', e?.message || e);
      setError(e?.message || 'Failed to load Dango markets');
      return [];
    }
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const data = await fetchJson(`${FUTURES_API}/prices?dex=dango`);
      setPrices(rows(data).map(normalizePrice).filter(Boolean));
    } catch (e) {
      console.warn('[useDango] prices:', e?.message || e);
    }
  }, []);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr || !token) {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setWalletUsdc(null);
      setAccountReady(false);
      return null;
    }
    try {
      const accountUrl = `${FUTURES_API}/dango/account?dex=dango&account=${encodeURIComponent(walletAddr)}`;
      const positionsUrl = `${FUTURES_API}/dango/positions?dex=dango&account=${encodeURIComponent(walletAddr)}`;
      const ordersUrl = `${FUTURES_API}/dango/orders?dex=dango&account=${encodeURIComponent(walletAddr)}`;
      const [nextAccount, nextPositions, nextOrders] = await Promise.all([
        authedGet(accountUrl),
        authedGet(positionsUrl),
        authedGet(ordersUrl),
      ]);
      setAccount(nextAccount || null);
      setPositions(Array.isArray(nextPositions) ? nextPositions : []);
      setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      setWalletUsdc(num(nextAccount?.available_to_spend ?? nextAccount?.usdc ?? nextAccount?.account_equity));
      setAccountReady(true);
      return nextAccount;
    } catch (e) {
      console.warn('[useDango] account:', e?.message || e);
      setError(e?.message || 'Failed to load Dango account');
      setAccountReady(false);
      return null;
    }
  }, [walletAddr, token, authedGet]);

  const fetchBridgeConfig = useCallback(async () => {
    if (!walletAddr || !token) {
      setBridgeConfig(null);
      return null;
    }
    try {
      const data = await authedGet(`${FUTURES_API}/dango/bridge/config?dex=dango&account=${encodeURIComponent(walletAddr)}`);
      setBridgeConfig(data || null);
      return data || null;
    } catch (e) {
      console.warn('[useDango] bridge config:', e?.message || e);
      return null;
    }
  }, [walletAddr, token, authedGet]);

  const readBridgeSourceUsdc = useCallback(async (chainId = DANGO_ARBITRUM_SOURCE_CHAIN.id) => {
    const id = Number(chainId || DANGO_ARBITRUM_SOURCE_CHAIN.id);
    const source = id === DANGO_ARBITRUM_SOURCE_CHAIN.id ? DANGO_ARBITRUM_SOURCE_CHAIN : null;
    if (!source || !sourceWalletAddr) {
      setBridgeSourceBalances(prev => ({ ...prev, [id]: null }));
      setBridgeSourceBalanceStatus(prev => ({
        ...prev,
        [id]: { status: sourceWalletAddr ? 'unsupported' : 'idle', message: sourceWalletAddr ? 'Unsupported Dango deposit source' : 'Connect EVM wallet' },
      }));
      return null;
    }
    setBridgeSourceBalanceStatus(prev => ({
      ...prev,
      [id]: { status: 'checking', message: `Checking ${source.name} USDC balance...` },
    }));
    try {
      const publicClient = typeof getPublicClient === 'function' ? getPublicClient(id) : null;
      if (!publicClient) throw new Error('Arbitrum RPC is not available');
      const raw = await publicClient.readContract({
        address: source.tokenAddress,
        abi: DANGO_ERC20_ABI,
        functionName: 'balanceOf',
        args: [sourceWalletAddr],
      });
      const balance = Number(formatUnits(raw, source.tokenDecimals));
      setBridgeSourceBalances(prev => ({ ...prev, [id]: balance }));
      setBridgeSourceBalanceStatus(prev => ({
        ...prev,
        [id]: { status: 'ready', message: null, chainId: id },
      }));
      return balance;
    } catch (e) {
      const message = e?.message || `Could not read ${source.name} USDC balance`;
      console.warn('[useDango] bridge source balance:', message);
      setBridgeSourceBalanceStatus(prev => ({
        ...prev,
        [id]: { status: 'error', message, chainId: id },
      }));
      return null;
    }
  }, [sourceWalletAddr, getPublicClient]);

  const refresh = useCallback(async () => {
    if (!isActiveDex) return;
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchMarkets(), fetchAccount(), fetchBridgeConfig(), readBridgeSourceUsdc()]);
      setDataReady(true);
    } finally {
      setLoading(false);
    }
  }, [isActiveDex, fetchMarkets, fetchAccount, fetchBridgeConfig, readBridgeSourceUsdc]);

  const refreshServerResources = useCallback(async () => {
    if (!token) return null;
    try {
      const data = await fetchJson(`${GAME_API}/resources`, { headers: { 'x-token': token } });
      window.onGodotMessage?.({
        action: 'resources',
        data: {
          gold: Number(data?.gold || 0),
          wood: Number(data?.wood || 0),
          ore: Number(data?.ore || 0),
        },
      });
      return data;
    } catch {
      return null;
    }
  }, [token]);

  const claimGold = useCallback(async ({ reason = 'poll' } = {}) => {
    if (!walletAddr || !token) return null;
    try {
      const data = await fetchJson(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'dango' }),
      });
      if (data?.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Dango trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      console.info('[useDango] claim-gold result', { reason, gold: data?.gold || 0, detail: data?.reason || null });
      return data;
    } catch (e) {
      console.warn('[useDango] claim-gold:', e?.message || e);
      return null;
    }
  }, [walletAddr, token, refreshServerResources]);

  claimGoldRef.current = claimGold;

  useEffect(() => {
    if (!isActiveDex) return undefined;
    refresh();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchPrices();
      fetchAccount();
      readBridgeSourceUsdc();
      claimGoldRef.current?.({ reason: 'poll' });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [isActiveDex, refresh, fetchPrices, fetchAccount, readBridgeSourceUsdc]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || !token) return undefined;
    const kickoff = setTimeout(() => claimGoldRef.current?.({ reason: 'startup' }), 3000);
    return () => clearTimeout(kickoff);
  }, [isActiveDex, walletAddr, token]);

  const submitDangoAction = useCallback(async (action, body, label = action) => {
    if (!walletAddr) return { error: 'Connect a Dango/EVM wallet first' };
    setLoading(true);
    setError(null);
    try {
      if (action === 'deposit') setDepositStatus({ status: 'preparing', amount: body?.amount });
      const prepared = await fetchJson(`${FUTURES_API}/dango/tx/prepare?dex=dango`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          action,
          account: walletAddr,
          linkedAccount: address || walletAddr,
          params: { account: walletAddr, ...body },
        }),
      });
      console.info('[useDango] prepared action', {
        action,
        label,
        account: walletAddr,
        message: prepared?.sign_doc?.message || null,
      });
      if (action === 'deposit') setDepositStatus({ status: 'signing', amount: body?.amount });
      const credential = await signDangoTx({
        evm,
        account: address || walletAddr,
        signDoc: prepared?.sign_doc,
        keyHash: prepared?.key_hash || '',
      });
      if (action === 'deposit') setDepositStatus({ status: 'broadcasting', amount: body?.amount });
      const signedTx = {
        ...(prepared?.tx || prepared?.unsigned_tx || {}),
        credential,
      };
      const result = await fetchJson(`${FUTURES_API}/dango/tx/broadcast?dex=dango`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ signedTx }),
      });
      console.info('[useDango] broadcast result', {
        action,
        label,
        result,
      });
      if (action === 'deposit') setDepositStatus({ status: 'confirming', amount: body?.amount, result });
      await fetchAccount();
      setTimeout(fetchAccount, 1200);
      setTimeout(fetchAccount, 3000);
      setTimeout(fetchAccount, 6000);
      setTimeout(fetchAccount, 10_000);
      return {
        success: true,
        submitted: true,
        result,
        txHash: result?.txHash || result?.tx_hash || result?.hash || null,
      };
    } catch (e) {
      const msg = e?.status === 428 ? dangoSignatureError(label, e?.data) : (e?.message || `Dango ${label} failed`);
      setError(msg);
      if (action === 'deposit') setDepositStatus({ status: 'failed', amount: body?.amount, error: msg });
      return { error: msg, signatureRequired: e?.status === 428, payload: e?.data || null };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, headers, evm, address, fetchAccount]);

  const placeMarketOrder = useCallback((symbol, side, amount, _slippage = '0.5', leverage = 1, opts = {}) => (
    submitDangoAction('place_order', {
      symbol,
      side,
      size: amount,
      orderKind: 'market',
      maxSlippage: opts?.maxSlippage ?? opts?.slippage ?? _slippage,
      leverage,
      ...opts,
    }, 'market order')
  ), [submitDangoAction]);

  const placeLimitOrder = useCallback((symbol, side, price, amount, _tif = 'GTC', leverage = 1, opts = {}) => (
    submitDangoAction('place_order', {
      symbol,
      side,
      size: amount,
      orderKind: 'limit',
      price,
      timeInForce: _tif || 'GTC',
      leverage,
      ...opts,
    }, 'limit order')
  ), [submitDangoAction]);

  const closePosition = useCallback((symbol, side, amount, pairId) => {
    const s = String(side || '').toLowerCase();
    const closesLong = s === 'bid' || s === 'buy' || s === 'long' || s === 'close_long';
    const closeSide = closesLong ? 'close_long' : 'close_short';
    return submitDangoAction('place_order', {
      symbol,
      pairId,
      side: closeSide,
      size: amount,
      orderKind: 'market',
      reduceOnly: true,
    }, 'close');
  }, [submitDangoAction]);

  const cancelOrder = useCallback((symbol, orderId) => (
    submitDangoAction('cancel_order', { symbol, orderId }, 'cancel')
  ), [submitDangoAction]);

  const setTpsl = useCallback(async (symbol, side, tpPrice, slPrice, pairIndex, _tradeIndex, amount, marketAddr) => {
    const pairId = marketAddr || pairIndex || undefined;
    const requests = [];
    if (tpPrice) {
      requests.push(submitDangoAction('tpsl', {
        symbol,
        pairId,
        side,
        size: amount,
        triggerPrice: tpPrice,
        triggerDirection: dangoTpslTriggerDirection(side, 'tp'),
        maxSlippage: '0.020000',
      }, 'TP/SL'));
    }
    if (slPrice) {
      requests.push(submitDangoAction('tpsl', {
        symbol,
        pairId,
        side,
        size: amount,
        triggerPrice: slPrice,
        triggerDirection: dangoTpslTriggerDirection(side, 'sl'),
        maxSlippage: '0.020000',
      }, 'TP/SL'));
    }
    if (!requests.length) return { success: true, skipped: true };
    const results = await Promise.all(requests);
    const failed = results.find(result => result?.error);
    if (failed) return { ...failed, results };
    return { success: true, results };
  }, [submitDangoAction]);

  const depositInternalMargin = useCallback(async (amount) => {
    const result = await submitDangoAction('deposit', { amount }, 'deposit');
    if (result?.success) setDepositStatus({ status: 'complete', amount, result });
    return result;
  }, [submitDangoAction]);

  const depositToPacifica = useCallback(async (amount) => {
    const amountText = String(amount ?? '').trim();
    if (!amountText) {
      if (typeof window !== 'undefined') {
        window.open(DANGO_DEPOSIT_URL, '_blank', 'noopener,noreferrer');
      }
      return {
        success: true,
        opened: true,
        info: 'Opened Dango deposit.',
      };
    }
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect a Dango wallet first');
      if (!sourceWalletAddr) throw new Error('Connect an Arbitrum EVM wallet first');
      if (typeof ensureChain !== 'function' || typeof getWalletClient !== 'function') {
        throw new Error('EVM wallet network switching is not available');
      }
      const parsed = Number(amountText);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Enter a positive USDC amount');
      const source = DANGO_ARBITRUM_SOURCE_CHAIN;
      const amountUnits = parseUnits(amountText, source.tokenDecimals);
      const config = bridgeConfig || await fetchBridgeConfig();
      const destinationDomain = Number(config?.destination_domain);
      if (!Number.isFinite(destinationDomain) || destinationDomain <= 0) throw new Error('Dango bridge destination is not ready');
      const serverSource = (config?.source_chains || []).find(row => Number(row?.id) === source.id) || {};
      const routerAddress = serverSource.router_address || source.routerAddress;
      const tokenAddress = serverSource.token_address || source.tokenAddress;
      const protocolFeeWei = BigInt(String(serverSource.protocol_fee_wei ?? '0'));

      const sourceBalance = bridgeSourceBalances[source.id];
      if (Number.isFinite(Number(sourceBalance)) && parsed > Number(sourceBalance) + 0.000001) {
        throw new Error(`${source.name} wallet has ${Number(sourceBalance).toFixed(2)} USDC`);
      }

      setDepositStatus({
        status: 'switching',
        amount: amountText,
        sourceChainId: source.id,
        sourceChain: source.name,
        message: `Switching to ${source.name}`,
      });
      await ensureChain(source.id);

      const walletClient = getWalletClient(source.id) || getWalletClient();
      const publicClient = typeof getPublicClient === 'function' ? getPublicClient(source.id) : null;
      if (!walletClient) throw new Error('EVM wallet is not ready');
      if (!publicClient) throw new Error('Arbitrum RPC is not available');

      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: DANGO_ERC20_ABI,
        functionName: 'allowance',
        args: [sourceWalletAddr, routerAddress],
      });
      if (allowance < amountUnits) {
        setDepositStatus(prev => ({
          ...prev,
          status: 'approving',
          message: `Approve ${amountText} USDC for Dango bridge`,
        }));
        const approveHash = await walletClient.writeContract({
          account: sourceWalletAddr,
          address: tokenAddress,
          abi: DANGO_ERC20_ABI,
          functionName: 'approve',
          args: [routerAddress, amountUnits],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 60_000 });
      }

      setDepositStatus(prev => ({
        ...prev,
        status: 'signing',
        message: `Bridge ${amountText} USDC to Dango`,
      }));
      const txHash = await walletClient.writeContract({
        account: sourceWalletAddr,
        address: routerAddress,
        abi: DANGO_HYPERLANE_ROUTER_ABI,
        functionName: 'transferRemote',
        args: [destinationDomain, dangoAccountToBytes32(walletAddr), amountUnits],
        value: protocolFeeWei,
      });

      setDepositStatus(prev => ({
        ...prev,
        status: 'confirming',
        txHash,
        message: 'Waiting for Arbitrum transaction confirmation',
      }));
      await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });

      setDepositStatus(prev => ({
        ...prev,
        status: 'bridging',
        txHash,
        message: 'Dango bridge is indexing the deposit',
      }));
      await readBridgeSourceUsdc(source.id);
      await fetchAccount();
      setDepositStatus(prev => ({
        ...prev,
        status: 'submitted',
        txHash,
        message: 'Dango bridge deposit submitted',
      }));
      setTimeout(fetchAccount, 10_000);
      setTimeout(fetchAccount, 30_000);
      setTimeout(fetchAccount, 60_000);
      return {
        success: true,
        submitted: true,
        txHash,
        sourceChain: source.name,
        info: 'Dango bridge deposit sent from Arbitrum. It can take a few minutes before the Dango balance updates.',
      };
    } catch (e) {
      const msg = e?.message || 'Dango Arbitrum deposit failed';
      setError(msg);
      setDepositStatus({ status: 'failed', amount: amountText, error: msg });
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [
    walletAddr,
    sourceWalletAddr,
    ensureChain,
    getWalletClient,
    getPublicClient,
    bridgeConfig,
    fetchBridgeConfig,
    bridgeSourceBalances,
    readBridgeSourceUsdc,
    fetchAccount,
  ]);

  const withdraw = useCallback((amount) => (
    submitDangoAction('withdraw', { amount }, 'withdraw')
  ), [submitDangoAction]);

  return useMemo(() => ({
    walletAddr,
    account,
    positions,
    orders,
    markets,
    prices,
    walletUsdc,
    spotUsdc: null,
    connected: !!walletAddr,
    loading,
    error,
    clearError,
    dataReady,
    accountReady,
    goldEarned,
    clearGoldEarned,
    depositStatus,
    walletUsdcStatus: walletAddr
      ? { status: 'ready', message: null }
      : { status: 'idle', message: 'Connect a Dango/EVM wallet' },
    bridgeSourceBalances,
    bridgeSourceBalanceStatus,
    bridgeDepositSourceChainId,
    setBridgeDepositSourceChainId,
    bridgeDepositSources: [DANGO_ARBITRUM_SOURCE_CHAIN],
    leverageSettings: {},
    marginModes: {},
    marginModeDetails: {},
    hasReferrer: true,
    setupVerified: !!walletAddr,
    isReady: !!walletAddr,
    walletMismatch: false,
    registeredEvmWallet: registered || '',
    oneTapTrading: { enabled: false, approved: false, required: true },
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setLeverage: async () => ({ success: true, skipped: true }),
    setMarginMode: async () => ({ success: true, skipped: true }),
    setTpsl,
    depositToPacifica,
    withdraw,
    activate: async () => ({ success: true }),
    disconnect: () => {},
    moveSpotToPerp: depositInternalMargin,
    claimGold,
    refresh,
  }), [
    walletAddr, account, positions, orders, markets, prices, walletUsdc, loading, error,
    clearError, dataReady, accountReady, goldEarned, clearGoldEarned, depositStatus,
    bridgeSourceBalances, bridgeSourceBalanceStatus, bridgeDepositSourceChainId,
    registered, placeMarketOrder, placeLimitOrder, closePosition, cancelOrder, setTpsl,
    depositToPacifica, depositInternalMargin, withdraw, claimGold, refresh,
  ]);
}
