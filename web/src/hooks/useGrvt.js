import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { GRVT_CHAIN_ID, ensureGrvtChain } from '../lib/grvtConfig';
import { signTypedDataCompat } from '../lib/risexClient';
import { reportClientEvent } from '../lib/clientLogger';
import { usePlayer } from './useGodot';
import { useCredentialOperationScope } from './useCredentialOperationScope';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
} from '../lib/encryptedCredentialStorage';
import { fetchGrvtMarketsDirect } from '../lib/grvtClient';
import {
  buildGrvtPositionConfigTypedData,
  formatGrvtLeverage,
  grvtLeverageFailureAllowsOrder,
  planGrvtLeverageUpdate,
} from '../lib/grvtPositionConfig';
import { buildGrvtOrderTypedData, formatGrvtSize, grvtBaseDecimals } from '../lib/grvtOrderSigning';

const STORAGE_KEY = 'clash_grvt_credentials_v1';
const ONE_TAP_SIGNER_STORAGE_KEY = 'clash_grvt_one_tap_signer_v1';
const POLL_INTERVAL_MS = 45_000;
const PRICE_POLL_INTERVAL_MS = 10_000;
const WALLET_USDC_POLL_INTERVAL_MS = 120_000;
const GRVT_REF_URL = 'https://grvt.io/?ref=UERIHL5';
const GRVT_BUILDER_ACCOUNT_ID = String(import.meta.env.VITE_GRVT_BUILDER_ACCOUNT_ID || '').trim();
const GRVT_BUILDER_FEE_RATE = String(import.meta.env.VITE_GRVT_BUILDER_FEE_RATE || '0.01').trim();
const GRVT_BUILDER_API_KEY_PERMISSIONS = normalizeGrvtPermissions(
  import.meta.env.VITE_GRVT_BUILDER_API_KEY_PERMISSIONS || 'Admin&Trade',
);
function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function normalizeGrvtCredentials(value) {
  if (!value?.apiKey && (!value?.cookie || !value?.accountId)) return null;
  if (value?.apiKey && !value?.subAccountId) return null;
  return {
    ...(value.apiKey ? { apiKey: String(value.apiKey) } : {}),
    ...(value.cookie ? { cookie: String(value.cookie) } : {}),
    ...(value.accountId ? { accountId: String(value.accountId) } : {}),
    subAccountId: String(value.subAccountId || ''),
    fundingAccountAddress: String(value.fundingAccountAddress || ''),
  };
}

function normalizeGrvtPermissions(value) {
  const order = ['Admin', 'InternalTransfer', 'ExternalTransfer', 'Withdraw', 'VaultInvestor', 'Trade'];
  const aliases = new Map(order.map(name => [name.toLowerCase(), name]));
  const parts = String(value || '')
    .split('&')
    .map(part => aliases.get(part.trim().toLowerCase()))
    .filter(Boolean);
  const unique = [...new Set(parts)];
  unique.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return unique.join('&') || 'Trade';
}

async function loadCredentials() {
  const migrated = await migratePlainLocalStorageCredential(STORAGE_KEY, STORAGE_KEY, normalizeGrvtCredentials);
  const stored = migrated || await readEncryptedCredential(STORAGE_KEY);
  return normalizeGrvtCredentials(stored);
}

async function writeCredentials(creds, options) {
  await writeEncryptedCredential(STORAGE_KEY, normalizeGrvtCredentials(creds), options);
}

async function clearCredentials(options) {
  await removeEncryptedCredential(STORAGE_KEY, options);
}

function normalizePrivateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (!/^0x[a-fA-F0-9]{64}$/u.test(hex)) throw new Error('Enter a valid GRVT Secret Private Key');
  return hex;
}

function signerFromPrivateKey(value) {
  const privateKey = normalizePrivateKey(value);
  const account = privateKeyToAccount(privateKey);
  return { privateKey, account, address: account.address };
}

function createOneTapSigner() {
  return signerFromPrivateKey(generatePrivateKey());
}

function normalizeOneTapSigner(value) {
  if (!value?.privateKey) return null;
  const signer = signerFromPrivateKey(value.privateKey);
  return {
    privateKey: signer.privateKey,
    address: signer.address,
    savedAt: Number(value.savedAt || Date.now()),
  };
}

async function loadOneTapSigner() {
  const migrated = await migratePlainLocalStorageCredential(ONE_TAP_SIGNER_STORAGE_KEY, ONE_TAP_SIGNER_STORAGE_KEY, normalizeOneTapSigner);
  const stored = migrated || await readEncryptedCredential(ONE_TAP_SIGNER_STORAGE_KEY);
  const normalized = normalizeOneTapSigner(stored);
  return normalized ? signerFromPrivateKey(normalized.privateKey) : null;
}

async function writeOneTapSigner(signer, options) {
  await writeEncryptedCredential(ONE_TAP_SIGNER_STORAGE_KEY, {
    privateKey: signer.privateKey,
    address: signer.address,
    savedAt: Date.now(),
  }, options);
}

async function clearOneTapSigner(options) {
  await removeEncryptedCredential(ONE_TAP_SIGNER_STORAGE_KEY, options);
}

function stripDomainTypes(types = {}) {
  const { EIP712Domain: _domain, ...rest } = types;
  return rest;
}

// GRVT onboarding happens almost entirely in the wallet, so without these events a failed
// setup leaves no server trace (see a wallet that never reached /grvt/authorize-builder).
function reportGrvtSetupEvent(type, data = {}, level = 'info') {
  try {
    reportClientEvent(`grvt.setup.${type}`, { at: new Date().toISOString(), ...data }, {
      level,
      source: 'grvt.setup',
      message: `grvt.setup.${type}`,
      flush: level === 'warn' || level === 'error',
    });
  } catch {}
}

const GRVT_WALLET_STEP_TIMEOUT_MS = 120_000;

// A wallet request that never settles (popup hidden, extension stuck) otherwise leaves the
// setup button spinning forever with no error.
function withWalletTimeout(promise, step) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Your wallet did not respond (${step}). Open the wallet extension, approve or reject the pending request, then try again.`);
      err.code = 'wallet_timeout';
      reject(err);
    }, GRVT_WALLET_STEP_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function grvtErrorMessage(error, fallback = 'GRVT request failed') {
  return error?.detail || error?.error || error?.message || String(error || fallback);
}

function apiKeyFromAuthorizeResult(value) {
  return String(
    value?.apiKey
    || value?.api_key
    || value?.result?.api_key
    || value?.result?.apiKey
    || '',
  ).trim();
}

function finiteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function randomUint32() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0];
  }
  return Math.floor(Math.random() * 0x100000000);
}

function randomClientOrderId() {
  const highBit = 1n << 63n;
  let random = 0n;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(2);
    crypto.getRandomValues(arr);
    random = (BigInt(arr[0]) << 32n) | BigInt(arr[1]);
  } else {
    random = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
  }
  return (highBit + (random & ((1n << 63n) - 1n))).toString();
}

function nowNs() {
  return BigInt(Date.now()) * 1_000_000n;
}

function decimalPlaces(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 0;
  if (text.includes('e-')) {
    const [, exp] = text.split('e-');
    return Math.max(0, Number(exp) || 0);
  }
  const [, frac = ''] = text.split('.');
  return frac.replace(/0+$/u, '').length;
}

function floorToStep(value, step) {
  const n = Number(value);
  const s = Number(step);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(s) || s <= 0) return n;
  return Math.floor((n + 1e-12) / s) * s;
}

function formatStepNumber(value, step, fallbackDecimals = 9) {
  const places = Math.min(9, Math.max(0, decimalPlaces(step) || fallbackDecimals));
  return Number(value).toFixed(places).replace(/\.?0+$/u, '') || '0';
}

function roundToTick(value, tick) {
  const n = Number(value);
  const t = Number(tick);
  if (!Number.isFinite(n) || n <= 0) return String(value ?? '');
  if (!Number.isFinite(t) || t <= 0) return String(value);
  const snapped = Math.round(n / t) * t;
  return formatStepNumber(snapped > 0 ? snapped : t, tick, 9);
}

function splitSignature(signature) {
  const hex = String(signature || '').replace(/^0x/u, '');
  if (hex.length !== 130) throw new Error('Invalid GRVT signature length');
  const vRaw = Number.parseInt(hex.slice(128, 130), 16);
  const v = vRaw < 27 ? vRaw + 27 : vRaw;
  return {
    r: `0x${hex.slice(0, 64)}`,
    s: `0x${hex.slice(64, 128)}`,
    v,
  };
}

function timeInForceValue(value, isMarket) {
  const tif = String(value || '').toUpperCase();
  if (isMarket) return { api: 'IMMEDIATE_OR_CANCEL', sign: 3 };
  if (tif === 'IOC' || tif === 'IMMEDIATE_OR_CANCEL') return { api: 'IMMEDIATE_OR_CANCEL', sign: 3 };
  if (tif === 'FOK' || tif === 'FILL_OR_KILL') return { api: 'FILL_OR_KILL', sign: 4 };
  return { api: 'GOOD_TILL_TIME', sign: 1 };
}

function builderFeeSignValue(rate = GRVT_BUILDER_FEE_RATE) {
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10_000);
}

const ensureGrvtSigningChain = ensureGrvtChain;

function normalizeGrvtAccount(payload) {
  const src = payload?.data || payload?.result || payload || {};
  const raw = src?._raw || src?.account || src?.summary || {};
  const equity = finiteNumber(
    src.account_equity,
    src.total_account_value,
    src.total_equity,
    src.equity,
    src.balance,
    raw.account_equity,
    raw.total_account_value,
    raw.total_equity,
    raw.equity,
    raw.balance,
    raw.te
  ) ?? 0;
  const available = finiteNumber(
    src.available_to_spend,
    src.available_balance,
    src.usdc,
    src.available_to_withdraw,
    raw.available_to_spend,
    raw.available_balance,
    raw.usdc,
    raw.available_to_withdraw,
    raw.ab
  ) ?? 0;
  const withdrawable = finiteNumber(
    src.available_to_withdraw,
    src.withdrawable_balance,
    src.available_to_spend,
    raw.available_to_withdraw,
    raw.withdrawable_balance,
    raw.available_balance,
    raw.ab
  ) ?? available;
  const marginUsed = finiteNumber(
    src.total_margin_used,
    src.total_initial_margin,
    src.initial_margin,
    src.maintenance_margin,
    raw.total_margin_used,
    raw.total_initial_margin,
    raw.initial_margin,
    raw.maintenance_margin,
    raw.im,
    raw.mm
  ) ?? 0;
  const fundingBalance = finiteNumber(
    src.funding_balance,
    raw.funding_balance,
    raw.fb
  ) ?? 0;
  const fundingTotalEquity = finiteNumber(
    src.funding_total_equity,
    raw.funding_total_equity
  ) ?? fundingBalance;
  return {
    ...src,
    balance: String(equity),
    usdc: String(available),
    account_equity: String(equity),
    available_to_spend: String(available),
    available_to_withdraw: String(withdrawable),
    total_margin_used: String(marginUsed),
    funding_balance: String(fundingBalance),
    funding_currency: src.funding_currency || raw.funding_currency || '',
    funding_total_equity: String(fundingTotalEquity),
    funding_spot_balances: Array.isArray(src.funding_spot_balances) ? src.funding_spot_balances : [],
  };
}

function mergeTriggerOrdersIntoPositions(positionRows, orderRows) {
  const next = (Array.isArray(positionRows) ? positionRows : []).map(p => ({ ...p }));
  const openOrders = Array.isArray(orderRows) ? orderRows : [];
  openOrders.forEach(order => {
    if (!order?.reduce_only && !order?.is_trigger_order) return;
    const symbol = String(order.symbol || '').toUpperCase();
    if (!symbol) return;
    const triggerType = String(order.trigger_type || '').toUpperCase();
    const triggerPrice = finiteNumber(order.trigger_price, order.stop_price, order.take_profit_price, order.stop_loss_price);
    if (!triggerPrice || triggerPrice <= 0) return;
    const pos = next.find(row => String(row.symbol || '').toUpperCase() === symbol);
    if (!pos) return;
    if (triggerType === 'TAKE_PROFIT') {
      pos.take_profit_price = String(triggerPrice);
      pos.tp_trigger_price = String(triggerPrice);
      pos.take_profit_order_id = order.order_id || null;
      pos.take_profit_client_order_id = order.client_order_id || null;
    } else if (triggerType === 'STOP_LOSS') {
      pos.stop_loss_price = String(triggerPrice);
      pos.sl_trigger_price = String(triggerPrice);
      pos.stop_loss_order_id = order.order_id || null;
      pos.stop_loss_client_order_id = order.client_order_id || null;
    }
  });
  return next;
}

export function useGrvt() {
  const { dex } = useDex();
  const isActiveDex = dex === 'grvt';
  const player = usePlayer();
  const evmWallet = useEvmWallet();
  const [credentials, setCredentials] = useState(null);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [leverageSettings, setLeverageSettings] = useState({});
  // GRVT instruments carry no leverage cap; the account's leverage rows do (equities are lower).
  const [maxLeverageBySymbol, setMaxLeverageBySymbol] = useState({});
  const [marginModes, setMarginModes] = useState({});
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [builderConfig, setBuilderConfig] = useState(null);
  const [builderAuthorized, setBuilderAuthorized] = useState(false);
  const [oneTapSigner, setOneTapSigner] = useState(null);
  const claimGoldRef = useRef(null);
  const rewardSyncTimersRef = useRef([]);

  const token = useMemo(() => (
    (typeof window !== 'undefined' ? window._playerToken : null) || player?.token || null
  ), [player?.token]);
  const oneTapSignerAddress = oneTapSigner?.address || null;
  const walletAddr = evmWallet?.address || player?.wallet || oneTapSignerAddress || null;
  const { capture: captureCredential, assert: assertCredential } = useCredentialOperationScope({ player, token, wallet: walletAddr, dex: 'grvt' });
  const registeredEvmWallet = registeredDexWallet(player, 'grvt', 'evm') || null;
  const walletMismatch = false;
  const hasResolvedCredentials = !!(
    credentials?.subAccountId
    && (credentials?.apiKey || (credentials?.cookie && credentials?.accountId))
  );

  const authHeaders = useCallback((extra = {}) => ({
    'Content-Type': 'application/json',
    ...(token ? { 'x-token': token, 'x-dex': 'grvt' } : {}),
    ...extra,
  }), [token]);

  const credentialBody = useCallback((extra = {}) => ({
    api_key: credentials?.apiKey,
    cookie: credentials?.cookie,
    account_id: credentials?.accountId,
    sub_account_id: credentials?.subAccountId,
    funding_account_address: credentials?.fundingAccountAddress,
    ...extra,
  }), [credentials]);

  const fetchJson = useCallback(async (path, options = {}) => {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || data?.error || `GRVT request failed (${res.status})`);
    return data;
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);
  const signTypedDataForGrvt = useCallback(async ({ provider, account, domain, types, primaryType, message }) => {
    if (oneTapSigner?.account) {
      return oneTapSigner.account.signTypedData({
        domain,
        types: stripDomainTypes(types),
        primaryType,
        message,
      });
    }
    return signTypedDataCompat({
      provider,
      walletClient: null,
      account,
      domain,
      types,
      primaryType,
      message,
    });
  }, [oneTapSigner]);

  const setGrvtOneTapTradingEnabled = useCallback(async (enabled, privateKey = '') => {
    const scope = captureCredential();
    if (!enabled) {
      await clearOneTapSigner({ scope });
      assertCredential(scope);
      setOneTapSigner(null);
      return { success: true };
    }
    try {
      const signer = signerFromPrivateKey(privateKey);
      await writeOneTapSigner(signer, { scope });
      assertCredential(scope);
      setOneTapSigner(signer);
      return { success: true, address: signer.address };
    } catch (e) {
      return { error: grvtErrorMessage(e, 'Failed to enable GRVT one tap trading') };
    }
  }, [captureCredential, assertCredential]);

  const resolveBrowserCredentials = useCallback(async (next) => {
    if (!token) throw new Error('Game session is not ready');
    const data = await fetchJson('/api/futures/grvt/credentials/resolve', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        api_key: next.apiKey,
        sub_account_id: next.subAccountId || '',
        funding_account_address: next.fundingAccountAddress || '',
      }),
    });
    if (data?.needs_sub_account_id) {
      throw new Error(data?.error || 'GRVT could not auto-detect a trading account from this API key. Create the key from the funded GRVT trading account and save it again.');
    }
    if (!data?.sub_account_id) {
      throw new Error('GRVT could not auto-detect a trading account from this API key. Create the key from the funded GRVT trading account and save it again.');
    }
    return data;
  }, [authHeaders, fetchJson, token]);

  const fetchBuilderConfig = useCallback(async () => {
    if (!isActiveDex || !token) return null;
    try {
      const data = await fetchJson('/api/futures/grvt/config?dex=grvt', {
        headers: authHeaders(),
      });
      setBuilderConfig(data || null);
      return data;
    } catch (e) {
      console.warn('[useGrvt] builder config:', e?.message || e);
      return null;
    }
  }, [authHeaders, fetchJson, isActiveDex, token]);

  const activateWithBuilderSignature = useCallback(async () => {
    const scope = captureCredential();
    if (!token) throw new Error('Game session is not ready');
    const mainAccountId = String(evmWallet?.address || '').trim();
    const provider = evmWallet?.provider;
    reportGrvtSetupEvent('start', {
      has_evm_address: !!mainAccountId,
      has_provider: !!provider,
      wallet_source: evmWallet?.source || null,
      wallet_matches_player: !!(mainAccountId && player?.wallet && mainAccountId.toLowerCase() === String(player.wallet).toLowerCase()),
    });
    if (!/^0x[a-fA-F0-9]{40}$/u.test(mainAccountId)) throw new Error('Connect your GRVT Exchange wallet first');
    if (!provider) throw new Error('GRVT wallet signer is not ready');

    const config = builderConfig || await fetchBuilderConfig();
    const builderAccount = String(config?.accountId || GRVT_BUILDER_ACCOUNT_ID || '').trim();
    const builderFeeRate = String(config?.feeRate || GRVT_BUILDER_FEE_RATE || '0').trim();
    const permissions = normalizeGrvtPermissions(config?.apiKeyPermissions || GRVT_BUILDER_API_KEY_PERMISSIONS);
    if (!builderAccount || !/^0x[a-fA-F0-9]{40}$/u.test(builderAccount)) {
      throw new Error('GRVT builder account is not configured');
    }

    await withWalletTimeout(ensureGrvtSigningChain(provider), 'switch to GRVT Exchange network').catch((e) => { if (e && typeof e === 'object' && !e.grvtStep) e.grvtStep = 'switch_chain'; throw e; });
    reportGrvtSetupEvent('chain_ready');
    const signer = createOneTapSigner();
    const nonce = randomUint32();
    const expiration = nowNs() + 30n * 60n * 1_000_000_000n;
    const maxFee = builderFeeSignValue(builderFeeRate);
    const primaryType = 'AddAccountSignerWithBuilder';
    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      [primaryType]: [
        { name: 'accountID', type: 'address' },
        { name: 'signer', type: 'address' },
        { name: 'permissions', type: 'string' },
        { name: 'builderAccountID', type: 'address' },
        { name: 'maxFutureFeeRate', type: 'uint32' },
        { name: 'maxSpotFeeRate', type: 'uint32' },
        { name: 'nonce', type: 'uint32' },
        { name: 'expiration', type: 'int64' },
      ],
    };
    const rawSignature = await withWalletTimeout(signTypedDataCompat({
      provider,
      walletClient: null,
      account: mainAccountId,
      domain: { name: 'GRVT Exchange', version: '0', chainId: GRVT_CHAIN_ID },
      types,
      primaryType,
      message: {
        accountID: mainAccountId,
        signer: signer.address,
        permissions,
        builderAccountID: builderAccount,
        maxFutureFeeRate: maxFee,
        maxSpotFeeRate: maxFee,
        nonce,
        expiration,
      },
    }), 'sign GRVT builder authorization').catch((e) => { if (e && typeof e === 'object' && !e.grvtStep) e.grvtStep = 'sign_builder_authorization'; throw e; });
    reportGrvtSetupEvent('signed');
    const sig = splitSignature(rawSignature);
    const authorized = await fetchJson('/api/futures/grvt/authorize-builder', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        main_account_id: mainAccountId,
        max_futures_fee_rate: builderFeeRate,
        max_spot_fee_rate: builderFeeRate,
        builder_api_key_label: `clash-${Date.now().toString(36)}`,
        builder_api_key_signer: signer.address,
        builder_api_key_permissions: permissions,
        signature: {
          signer: mainAccountId,
          r: sig.r,
          s: sig.s,
          v: sig.v,
          expiration: expiration.toString(),
          nonce,
          chain_id: String(GRVT_CHAIN_ID),
        },
      }),
    }).catch((e) => { if (e && typeof e === 'object' && !e.grvtStep) e.grvtStep = 'authorize_builder'; throw e; });
    const apiKey = apiKeyFromAuthorizeResult(authorized);
    if (!apiKey) throw new Error('GRVT did not return an API key for this authorization');
    const saved = await resolveBrowserCredentials({ apiKey }).catch((e) => { if (e && typeof e === 'object' && !e.grvtStep) e.grvtStep = 'resolve_sub_account'; throw e; });
    const resolved = {
      apiKey,
      subAccountId: String(saved?.sub_account_id || '').trim(),
      fundingAccountAddress: String(saved?.funding_account_address || mainAccountId).trim(),
    };
    if (!resolved.subAccountId) {
      throw new Error('GRVT could not find a trading account for the new API key. Create or fund a GRVT trading account, then try again.');
    }
    assertCredential(scope);
    await Promise.all([
      writeCredentials(resolved, { scope }),
      writeOneTapSigner(signer, { scope }),
    ]);
    assertCredential(scope);
    setCredentials(resolved);
    setOneTapSigner(signer);
    setBuilderAuthorized(true);
    reportGrvtSetupEvent('authorized');
    return {
      success: true,
      auto_created_api_key: true,
      signer: signer.address,
      sub_account_id: resolved.subAccountId,
    };
  }, [authHeaders, builderConfig, evmWallet?.address, evmWallet?.provider, evmWallet?.source, fetchBuilderConfig, fetchJson, player?.wallet, resolveBrowserCredentials, token, captureCredential, assertCredential]);

  const fetchMarkets = useCallback(async () => {
    try {
      // The server keeps one shared GRVT snapshot (180+ tickers), so it answers instantly;
      // reading every ticker from the browser is the fallback.
      let payload;
      try {
        payload = await fetchJson('/api/futures/markets?dex=grvt');
        if (!rows(payload).length) throw new Error('empty GRVT market list');
      } catch (serverError) {
        console.warn('[useGrvt] server markets read failed; reading GRVT directly:', serverError?.message || serverError);
        payload = await fetchGrvtMarketsDirect();
      }
      const next = rows(payload);
      setMarkets(next);
      setPrices(next.map(m => ({
        symbol: m.symbol,
        mark: String(m.mark || ''),
        mid: String(m.mid || m.mark || ''),
        oracle: String(m.oracle || m.mark || ''),
        volume_24h: m.volume_24h || 0,
        open_interest: String(m.open_interest || 0),
        funding_rate: m.funding_rate || 0,
      })));
      return next;
    } catch (e) {
      const msg = grvtErrorMessage(e);
      console.warn('[useGrvt] markets:', msg);
      setError(msg);
      return [];
    }
  }, [fetchJson]);

  const authedPost = useCallback(async (path, body = {}) => {
    if (!hasResolvedCredentials) throw new Error('Connect GRVT API session first');
    if (!token) throw new Error('Game session is not ready');
    return fetchJson(path, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(credentialBody(body)),
    });
  }, [hasResolvedCredentials, token, fetchJson, authHeaders, credentialBody]);

  const fetchWalletUsdc = useCallback(async () => {
    setWalletUsdc(null);
    return null;
  }, []);

  const fetchAccount = useCallback(async () => {
    if (!hasResolvedCredentials || !token) {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setLeverageSettings({});
      setMarginModes({});
      setDataReady(false);
      return null;
    }
    try {
      const [acct, pos, ord, lev] = await Promise.all([
        authedPost('/api/futures/grvt/account'),
        authedPost('/api/futures/grvt/positions'),
        authedPost('/api/futures/grvt/orders'),
        authedPost('/api/futures/grvt/leverage').catch(() => []),
      ]);
      const normalizedAccount = acct ? normalizeGrvtAccount(acct) : null;
      const orderRows = Array.isArray(ord) ? ord : [];
      const posRows = mergeTriggerOrdersIntoPositions(Array.isArray(pos) ? pos : [], orderRows);
      setAccount(normalizedAccount);
      setPositions(posRows);
      setOrders(orderRows);
      const nextLev = {};
      const nextModes = {};
      posRows.forEach(row => {
        const sym = String(row.symbol || '').toUpperCase();
        if (!sym) return;
        const levNum = Number(row.leverage);
        if (Number.isFinite(levNum) && levNum > 0) nextLev[sym] = levNum;
        if (row.margin_type) nextModes[sym] = String(row.margin_type).toUpperCase() === 'ISOLATED';
        else if (row.is_isolated != null) nextModes[sym] = !!row.is_isolated;
      });
      const nextMaxLev = {};
      if (Array.isArray(lev)) {
        lev.forEach(row => {
          const sym = String(row.symbol || '').toUpperCase();
          if (!sym) return;
          const levNum = Number(row.leverage);
          if (Number.isFinite(levNum) && levNum > 0) nextLev[sym] = levNum;
          const maxNum = Number(row.max_leverage);
          if (Number.isFinite(maxNum) && maxNum >= 2) nextMaxLev[sym] = maxNum;
          nextModes[sym] = String(row.margin_type || '').toUpperCase() === 'ISOLATED';
        });
      }
      if (Object.keys(nextMaxLev).length) setMaxLeverageBySymbol(nextMaxLev);
      setLeverageSettings(nextLev);
      setMarginModes(nextModes);
      setDataReady(true);
      return normalizedAccount;
    } catch (e) {
      const msg = grvtErrorMessage(e);
      console.warn('[useGrvt] account:', msg);
      setError(msg);
      setDataReady(false);
      return null;
    }
  }, [hasResolvedCredentials, token, authedPost]);

  const refreshServerResources = useCallback(async () => {
    if (!token) return null;
    try {
      const res = await fetch('/api/resources', { headers: { 'x-token': token } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return null;
      window.onGodotMessage?.({ action: 'resources', data: {
        gold: Number(data.gold || 0),
        wood: Number(data.wood || 0),
        ore: Number(data.ore || 0),
      } });
      return data;
    } catch {
      return null;
    }
  }, [token]);

  const importFills = useCallback(async () => {
    if (!hasResolvedCredentials || !token) return null;
    try {
      return await authedPost('/api/futures/grvt/import-fills');
    } catch (e) {
      console.warn('[useGrvt] import-fills:', e?.message || e);
      return null;
    }
  }, [hasResolvedCredentials, token, authedPost]);

  const claimGold = useCallback(async ({ reason = 'poll' } = {}) => {
    if (!hasResolvedCredentials || !token) return null;
    try {
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'grvt' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data;
      console.info('[useGrvt] claim-gold result', { reason, gold: data?.gold || 0, detail: data?.reason || null });
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      return data;
    } catch (e) {
      console.warn('[useGrvt] claim-gold:', e?.message || e);
      return null;
    }
  }, [hasResolvedCredentials, token, walletAddr, refreshServerResources]);

  claimGoldRef.current = claimGold;

  const clearRewardSyncTimers = useCallback(() => {
    rewardSyncTimersRef.current.forEach(clearTimeout);
    rewardSyncTimersRef.current = [];
  }, []);

  const scheduleRewardSync = useCallback((reason = 'order') => {
    if (!hasResolvedCredentials || !token) return;
    clearRewardSyncTimers();
    for (const delayMs of [4_000, 15_000, 45_000, 120_000, 240_000]) {
      const timer = setTimeout(async () => {
        await importFills();
        await claimGoldRef.current?.({ reason });
      }, delayMs);
      rewardSyncTimersRef.current.push(timer);
    }
  }, [clearRewardSyncTimers, hasResolvedCredentials, importFills, token]);

  useEffect(() => clearRewardSyncTimers, [clearRewardSyncTimers]);

  useEffect(() => {
    if (!isActiveDex) return;
    fetchMarkets();
  }, [isActiveDex, fetchMarkets]);

  // Keep marks live after the first load. The server shares one cached GRVT ticker snapshot
  // across players, so this costs one cheap request instead of one GRVT call per market.
  useEffect(() => {
    if (!isActiveDex) return undefined;
    let cancelled = false;
    const refresh = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const live = rows(await fetchJson('/api/futures/prices?dex=grvt'));
        if (cancelled || !live.length) return;
        const bySymbol = new Map(live.map(p => [String(p.symbol || '').toUpperCase(), p]));
        setPrices(prev => {
          const seen = new Set();
          const next = prev.map((row) => {
            const key = String(row.symbol || '').toUpperCase();
            seen.add(key);
            const p = bySymbol.get(key);
            return p && Number(p.mark) > 0 ? { ...row, ...p } : row;
          });
          live.forEach((p) => {
            if (!seen.has(String(p.symbol || '').toUpperCase())) next.push(p);
          });
          return next;
        });
        setMarkets(prev => prev.map((m) => {
          const p = bySymbol.get(String(m.symbol || '').toUpperCase());
          const mark = Number(p?.mark);
          if (!(mark > 0)) return m;
          const yesterday = Number(p.yesterday_price) || Number(m.yesterday_price) || 0;
          return {
            ...m,
            mark,
            mid: Number(p.mid) || mark,
            oracle: Number(p.oracle) || mark,
            yesterday_price: yesterday,
            price_change_24h: yesterday > 0 ? ((mark - yesterday) / yesterday) * 100 : m.price_change_24h,
            volume_24h: p.volume_24h ?? m.volume_24h,
            open_interest: Number(p.open_interest) || m.open_interest,
            funding_rate: p.funding_rate ?? m.funding_rate,
          };
        }));
      } catch (e) {
        console.warn('[useGrvt] price refresh:', e?.message || e);
      }
    };
    const iv = setInterval(refresh, PRICE_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isActiveDex, fetchJson]);

  useEffect(() => {
    if (!isActiveDex) return;
    let cancelled = false;
    (async () => {
      try {
        const [storedCredentials, storedOneTapSigner] = await Promise.all([
          loadCredentials(),
          loadOneTapSigner(),
        ]);
        if (!cancelled) {
          setCredentials(storedCredentials);
          setOneTapSigner(storedOneTapSigner);
        }
      } catch (e) {
        console.warn('[useGrvt] encrypted credential load failed:', e?.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [isActiveDex]);

  useEffect(() => {
    if (!isActiveDex || !token) return;
    fetchBuilderConfig();
  }, [isActiveDex, token, fetchBuilderConfig]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    fetchWalletUsdc();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchWalletUsdc();
    }, WALLET_USDC_POLL_INTERVAL_MS);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') fetchWalletUsdc();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(iv);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [fetchWalletUsdc, isActiveDex]);

  useEffect(() => {
    if (!isActiveDex || !hasResolvedCredentials) return undefined;
    fetchAccount();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchAccount();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') fetchAccount();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(iv);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [isActiveDex, hasResolvedCredentials, fetchAccount]);

  useEffect(() => {
    if (!isActiveDex || !hasResolvedCredentials || !token) return undefined;
    const fire = async () => {
      await importFills();
      await claimGoldRef.current?.({ reason: 'poll' });
    };
    const kickoff = setTimeout(fire, 3000);
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fire();
    }, 60_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [isActiveDex, hasResolvedCredentials, token, importFills]);

  const activate = useCallback(async (input = null) => {
    const scope = captureCredential();
    setLoading(true);
    setError(null);
    try {
      const wantsAutoBuilderKey = !input || input.autoBuilderKey || input.auto_builder_key;
      if (wantsAutoBuilderKey && !String(input?.apiKey || input?.api_key || '').trim()) {
        return await activateWithBuilderSignature();
      }
      const next = input
        ? {
          apiKey: String(input.apiKey || input.api_key || '').trim(),
          subAccountId: String(input.subAccountId || input.sub_account_id || credentials?.subAccountId || '').trim(),
          fundingAccountAddress: String(input.fundingAccountAddress || input.funding_account_address || credentials?.fundingAccountAddress || '').trim(),
        }
        : null;
      if (!next?.apiKey) return { error: 'Enter your GRVT API key' };
      const saved = await resolveBrowserCredentials(next);
      const resolved = {
        ...next,
        subAccountId: String(saved?.sub_account_id || next.subAccountId || '').trim(),
        fundingAccountAddress: String(saved?.funding_account_address || next.fundingAccountAddress || '').trim(),
      };
      if (!resolved.subAccountId) return { error: 'GRVT could not auto-detect a trading account from this API key. Create the key from the funded GRVT trading account and save it again.' };
      assertCredential(scope);
      await writeCredentials(resolved, { scope });
      assertCredential(scope);
      setCredentials(resolved);
      return { success: true };
    } catch (e) {
      const msg = grvtErrorMessage(e, 'GRVT activation failed');
      const step = e?.grvtStep || (input?.apiKey || input?.api_key ? 'manual_api_key' : 'precheck');
      console.warn('[useGrvt] activation failed:', step, msg);
      reportGrvtSetupEvent('failed', { step, error: String(msg).slice(0, 300), code: e?.code ?? null }, 'warn');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [activateWithBuilderSignature, credentials?.fundingAccountAddress, credentials?.subAccountId, resolveBrowserCredentials, captureCredential, assertCredential]);

  const disconnect = useCallback(async () => {
    const scope = captureCredential();
    await clearCredentials({ scope });
    assertCredential(scope);
    await clearOneTapSigner({ scope });
    assertCredential(scope);
    setCredentials(null);
    setOneTapSigner(null);
    setAccount(null);
    setPositions([]);
    setOrders([]);
    setLeverageSettings({});
    setMaxLeverageBySymbol({});
    setMarginModes({});
    setDataReady(false);
    setBuilderAuthorized(false);
  }, [captureCredential, assertCredential]);

  const openOfficialDeposit = useCallback(() => {
    try { window.open(GRVT_REF_URL, '_blank', 'noopener,noreferrer'); } catch {}
    return { success: true, info: 'Opened GRVT deposit.' };
  }, []);

  const openOfficialWithdraw = useCallback(() => {
    try { window.open(GRVT_REF_URL, '_blank', 'noopener,noreferrer'); } catch {}
    return { success: true, info: 'Opened GRVT withdraw.' };
  }, []);

  const marketForSymbol = useCallback((symbol) => {
    const key = String(symbol || '').toUpperCase();
    return markets.find(m => String(m.symbol || '').toUpperCase() === key)
      || markets.find(m => String(m.base || '').toUpperCase() === key)
      || null;
  }, [markets]);

  const priceForOrder = useCallback((symbol, explicitPrice = null) => {
    const direct = Number(explicitPrice);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const key = String(symbol || '').toUpperCase();
    const p = prices.find(row => String(row.symbol || '').toUpperCase() === key);
    const mark = Number(p?.mark || p?.mid || p?.oracle);
    if (Number.isFinite(mark) && mark > 0) return mark;
    const m = marketForSymbol(symbol);
    const marketMark = Number(m?.mark || m?.mid || m?.oracle);
    if (Number.isFinite(marketMark) && marketMark > 0) return marketMark;
    throw new Error('GRVT market price is not ready');
  }, [marketForSymbol, prices]);

  const authorizeBuilder = useCallback(async (force = false) => {
    if (!hasResolvedCredentials) throw new Error('Connect GRVT API session first');
    if (!walletAddr) throw new Error('Connect your GRVT Exchange wallet first');
    if (builderAuthorized && !force) return { success: true, already_authorized: true };
    const builderAccount = String(builderConfig?.accountId || GRVT_BUILDER_ACCOUNT_ID || '').trim();
    const builderFeeRate = String(builderConfig?.feeRate || GRVT_BUILDER_FEE_RATE || '0').trim();
    const mainAccountId = String(credentials?.fundingAccountAddress || walletAddr || '').trim();
    if (!builderAccount || !/^0x[a-fA-F0-9]{40}$/.test(builderAccount)) {
      throw new Error('GRVT builder account is not configured');
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(mainAccountId)) {
      throw new Error('GRVT funding account address is not ready. Save your GRVT API key again.');
    }
    if (String(mainAccountId).toLowerCase() !== String(walletAddr).toLowerCase()) {
      throw new Error('Connect the same GRVT wallet that owns this GRVT funding account.');
    }
    const provider = evmWallet?.provider;
    if (!provider) throw new Error('GRVT wallet signer is not ready');
    await ensureGrvtSigningChain(provider);

    const nonce = randomUint32();
    const expiration = nowNs() + 24n * 60n * 60n * 1_000_000_000n;
    const maxFee = builderFeeSignValue(builderFeeRate);
    const primaryType = 'AuthorizeBuilder';
    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      [primaryType]: [
        { name: 'mainAccountID', type: 'address' },
        { name: 'builderAccountID', type: 'address' },
        { name: 'maxFutureFeeRate', type: 'uint32' },
        { name: 'maxSpotFeeRate', type: 'uint32' },
        { name: 'nonce', type: 'uint32' },
        { name: 'expiration', type: 'int64' },
      ],
    };
    const rawSignature = await signTypedDataCompat({
      provider,
      walletClient: null,
      account: walletAddr,
      domain: { name: 'GRVT Exchange', version: '0', chainId: GRVT_CHAIN_ID },
      types,
      primaryType,
      message: {
        mainAccountID: mainAccountId,
        builderAccountID: builderAccount,
        maxFutureFeeRate: maxFee,
        maxSpotFeeRate: maxFee,
        nonce,
        expiration,
      },
    });
    const sig = splitSignature(rawSignature);
    const result = await authedPost('/api/futures/grvt/authorize-builder', {
      main_account_id: mainAccountId,
      max_futures_fee_rate: builderFeeRate,
      max_spot_fee_rate: builderFeeRate,
      signature: {
        signer: walletAddr,
        r: sig.r,
        s: sig.s,
        v: sig.v,
        expiration: expiration.toString(),
        nonce,
        chain_id: String(GRVT_CHAIN_ID),
      },
    });
    setBuilderAuthorized(true);
    return result;
  }, [authedPost, builderAuthorized, builderConfig, credentials, evmWallet, hasResolvedCredentials, walletAddr]);

  // GRVT set_position_config: signed SetSubAccountPositionMarginConfig (replaces the
  // deprecated set_initial_leverage). Signed by the same key that signs orders.
  const syncPositionConfig = useCallback(async (instrument, symbol, leverage, isIsolated) => {
    if (!instrument) return null;
    const leverageText = formatGrvtLeverage(leverage);
    if (!hasResolvedCredentials) throw new Error('Connect GRVT API session first');
    const signerAddress = oneTapSigner?.address || walletAddr;
    if (!signerAddress) throw new Error('Connect your GRVT Exchange wallet first');
    const provider = evmWallet?.provider;
    if (!oneTapSigner?.account) {
      if (!provider) throw new Error('GRVT wallet signer is not ready');
      await ensureGrvtSigningChain(provider);
    }
    const market = marketForSymbol(symbol);
    const instrumentHash = market?._raw?.instrument_hash || market?._grvt?.raw?.instrument_hash;
    if (!instrumentHash) throw new Error(`GRVT instrument metadata is not ready for ${symbol || instrument}`);

    const nonce = randomUint32();
    const expiration = nowNs() + 24n * 60n * 60n * 1_000_000_000n;
    const marginType = isIsolated ? 'ISOLATED' : 'CROSS';
    const typed = buildGrvtPositionConfigTypedData({
      subAccountId: credentials.subAccountId,
      instrumentHash,
      marginType,
      leverage: leverageText,
      nonce,
      expiration,
      chainId: GRVT_CHAIN_ID,
    });
    const rawSignature = await signTypedDataForGrvt({
      provider,
      account: signerAddress,
      ...typed,
    });
    const sig = splitSignature(rawSignature);
    const result = await authedPost('/api/futures/grvt/set-position-config', {
      instrument,
      leverage: leverageText,
      margin_type: marginType,
      signature: {
        signer: signerAddress,
        r: sig.r,
        s: sig.s,
        v: sig.v,
        expiration: expiration.toString(),
        nonce,
        chain_id: String(GRVT_CHAIN_ID),
      },
    });
    const sym = String(symbol || '').toUpperCase();
    if (sym) {
      setLeverageSettings(prev => ({ ...prev, [sym]: Number(leverageText) }));
      setMarginModes(prev => ({ ...prev, [sym]: !!isIsolated }));
    }
    return result;
  }, [authedPost, credentials, evmWallet, hasResolvedCredentials, marketForSymbol, oneTapSigner, signTypedDataForGrvt, walletAddr]);

  const setGrvtMarginMode = useCallback(async (symbol, isIsolated) => {
    const market = marketForSymbol(symbol);
    const instrument = market?._grvt?.instrument || market?.market_name || `${String(symbol || '').toUpperCase()}_USDT_Perp`;
    const lev = leverageSettings[String(symbol || '').toUpperCase()] || 20;
    return syncPositionConfig(instrument, symbol, lev, !!isIsolated);
  }, [leverageSettings, marketForSymbol, syncPositionConfig]);

  // Change leverage only; keep the position's current GRVT margin type (CROSS by default).
  const setGrvtInitialLeverage = useCallback(async (instrument, symbol, leverage) => {
    const lev = Number(leverage);
    if (!instrument || !Number.isFinite(lev) || lev <= 0) return null;
    const sym = String(symbol || '').toUpperCase();
    const plan = planGrvtLeverageUpdate({ requested: lev, current: leverageSettings[sym] });
    if (!plan.update) return { success: true, skipped: true, reason: plan.reason, leverage: lev };
    return syncPositionConfig(instrument, symbol, lev, !!marginModes[sym]);
  }, [leverageSettings, marginModes, syncPositionConfig]);

  const buildSignedOrder = useCallback(async ({
    symbol,
    side,
    marginUsdc,
    price = null,
    tif = 'GTC',
    leverage = 1,
    isMarket = false,
    reduceOnly = false,
    amountBase = null,
    trigger = null,
  }) => {
    if (!hasResolvedCredentials) throw new Error('Connect GRVT API session first');
    const signerAddress = oneTapSigner?.address || walletAddr;
    if (!signerAddress) throw new Error('Connect your GRVT Exchange wallet first');
    const builderAccount = String(builderConfig?.accountId || GRVT_BUILDER_ACCOUNT_ID || '').trim();
    const builderFeeRate = String(builderConfig?.feeRate || GRVT_BUILDER_FEE_RATE || '0').trim();
    if (!builderAccount || !/^0x[a-fA-F0-9]{40}$/.test(builderAccount)) {
      throw new Error('GRVT builder account is not configured');
    }
    const provider = evmWallet?.provider;
    if (!oneTapSigner?.account) {
      if (!provider) throw new Error('GRVT wallet signer is not ready');
      await ensureGrvtSigningChain(provider);
    }

    const market = marketForSymbol(symbol);
    const instrument = market?._grvt?.instrument || market?.market_name || `${String(symbol || '').toUpperCase()}_USDT_Perp`;
    const assetId = market?._raw?.instrument_hash || market?._grvt?.raw?.instrument_hash;
    if (!assetId) throw new Error(`GRVT instrument metadata is not ready for ${symbol}`);

    const orderPrice = priceForOrder(symbol, price);
    const margin = Number(marginUsdc);
    const lev = Math.max(1, Number(leverage) || 1);
    const maxLev = maxLeverageBySymbol[String(symbol || '').toUpperCase()];
    if (!reduceOnly && maxLev && lev > maxLev) {
      throw new Error(`GRVT max leverage for ${symbol} is ${maxLev}x. Lower the leverage and try again.`);
    }
    if (!reduceOnly) {
      try {
        await setGrvtInitialLeverage(instrument, symbol, lev);
      } catch (e) {
        const msg = grvtErrorMessage(e, 'GRVT leverage update failed');
        const current = leverageSettings[String(symbol || '').toUpperCase()];
        console.warn('[useGrvt] set position config:', msg, { symbol, requested: lev, current: current ?? null });
        // GRVT already runs this market at >= the requested leverage, so the order needs no
        // more margin than the player chose; place it rather than block on the update.
        if (!grvtLeverageFailureAllowsOrder({ requested: lev, current })) {
          throw new Error(`Could not set GRVT leverage to ${lev}x for ${symbol}${Number(current) > 0 ? ` (currently ${current}x)` : ''}: ${msg}`);
        }
      }
    }
    const explicitSize = Number(amountBase);
    let contractSize = Number.isFinite(explicitSize) && explicitSize > 0
      ? explicitSize
      : ((Number.isFinite(margin) && margin > 0) ? (margin * lev) / orderPrice : 0);
    if (!Number.isFinite(contractSize) || contractSize <= 0) throw new Error('GRVT order size is too small');

    const minSize = Number(market?.min_order_size || market?._raw?.min_size || 0);
    const sizeStep = String(market?._raw?.min_size || market?.min_order_size || '');
    contractSize = floorToStep(contractSize, minSize);
    if (!Number.isFinite(contractSize) || contractSize <= 0) throw new Error('GRVT order size is below this market lot size.');
    if (minSize > 0 && contractSize + 1e-12 < minSize) {
      throw new Error(`GRVT minimum order size is ${minSize} ${symbol}. Increase margin or leverage.`);
    }
    const minNotional = Number(market?.min_notional_usd || market?._raw?.min_notional || 0);
    const notional = contractSize * orderPrice;
    if (!reduceOnly && minNotional > 0 && notional + 1e-9 < minNotional) {
      throw new Error(`GRVT requires a position >= $${minNotional.toFixed(2)}. Increase margin or leverage.`);
    }

    const nonce = randomUint32();
    const expiration = nowNs() + 3n * 60n * 60n * 1_000_000_000n;
    const clientOrderId = randomClientOrderId();
    const tifInfo = timeInForceValue(tif, isMarket);
    // GRVT signs contractSize with the instrument's base_decimals (6 or 3 on many markets),
    // so the wire size must not carry more decimals than that.
    const baseDecimals = grvtBaseDecimals(market?._raw || market?._grvt?.raw);
    const sizeText = formatGrvtSize(formatStepNumber(contractSize, sizeStep, baseDecimals), baseDecimals);
    // GRVT rejects prices off the instrument tick, so snap typed/limit/trigger prices to it.
    const tickSize = String(market?._raw?.tick_size || market?.tick_size || '');
    const limitPriceText = isMarket ? '0' : roundToTick(price || orderPrice, tickSize);
    const triggerPriceText = trigger ? roundToTick(trigger.price, tickSize) : '';
    const isBuyingAsset = side === 'bid' || side === 'buy' || side === 'long';
    const typed = buildGrvtOrderTypedData({
      subAccountId: credentials.subAccountId,
      isMarket,
      timeInForceCode: tifInfo.sign,
      postOnly: false,
      reduceOnly,
      legs: [{
        instrumentHash: assetId,
        size: sizeText,
        limitPrice: limitPriceText,
        isBuying: isBuyingAsset,
        baseDecimals,
      }],
      builder: builderAccount,
      builderFee: builderFeeRate,
      nonce,
      expiration,
      chainId: GRVT_CHAIN_ID,
    });
    const rawSignature = await signTypedDataForGrvt({
      provider,
      account: signerAddress,
      ...typed,
    });
    const sig = splitSignature(rawSignature);
    const order = {
      sub_account_id: String(credentials.subAccountId),
      is_market: isMarket,
      time_in_force: tifInfo.api,
      post_only: false,
      reduce_only: reduceOnly,
      legs: [{
        instrument,
        size: sizeText,
        limit_price: isMarket ? '0' : limitPriceText,
        is_buying_asset: isBuyingAsset,
      }],
      signature: {
        signer: signerAddress,
        r: sig.r,
        s: sig.s,
        v: sig.v,
        expiration: expiration.toString(),
        nonce,
        chain_id: String(GRVT_CHAIN_ID),
      },
      metadata: {
        client_order_id: clientOrderId,
        create_time: nowNs().toString(),
        ...(trigger ? {
          trigger: {
            trigger_type: trigger.type,
            tpsl: {
              trigger_by: trigger.triggerBy || 'LAST',
              trigger_price: triggerPriceText,
              close_position: !!trigger.closePosition,
              is_split_position: !!trigger.isSplitPosition,
            },
          },
        } : {}),
      },
      builder: builderAccount,
      builder_fee: builderFeeRate,
    };
    return {
      order,
      symbol,
      notional_usd: notional,
      sizeText,
      instrument,
    };
  }, [builderConfig, credentials, evmWallet, hasResolvedCredentials, leverageSettings, marketForSymbol, maxLeverageBySymbol, oneTapSigner, priceForOrder, setGrvtInitialLeverage, signTypedDataForGrvt, walletAddr]);

  const postSignedGrvtPayload = useCallback(async (path, payload) => {
    try {
      return await authedPost(path, payload);
    } catch (e) {
      const msg = grvtErrorMessage(e);
      if (!/builder is not authorized|7504/i.test(msg)) throw e;
      await authorizeBuilder(true);
      return await authedPost(path, payload);
    }
  }, [authedPost, authorizeBuilder]);

  const submitSignedOrder = useCallback(async (args) => {
    const built = await buildSignedOrder(args);
    const result = await postSignedGrvtPayload('/api/futures/grvt/create-order', {
      order: built.order,
      symbol: built.symbol,
      notional_usd: built.notional_usd,
    });
    scheduleRewardSync('order');
    return result;
  }, [buildSignedOrder, postSignedGrvtPayload, scheduleRewardSync]);

  const submitBulkSignedOrders = useCallback(async (builtOrders, { symbol, notionalUsd } = {}) => {
    const result = await postSignedGrvtPayload('/api/futures/grvt/bulk-orders', {
      orders: builtOrders.map(item => item.order || item),
      symbol,
      notional_usd: notionalUsd,
      time_to_live_ms: '500',
    });
    scheduleRewardSync('order');
    return result;
  }, [postSignedGrvtPayload, scheduleRewardSync]);

  const buildGrvtAttachedTpslOrders = useCallback(async ({ symbol, parentSide, parentSize, takeProfit, stopLoss }) => {
    const closeSide = parentSide === 'bid' || parentSide === 'buy' || parentSide === 'long' ? 'ask' : 'bid';
    const ordersToBuild = [];
    if (takeProfit) {
      ordersToBuild.push({
        symbol,
        side: closeSide,
        amountBase: parentSize,
        price: takeProfit,
        tif: 'GTC',
        isMarket: false,
        reduceOnly: true,
        trigger: {
          type: 'TAKE_PROFIT',
          price: takeProfit,
          triggerBy: 'LAST',
          closePosition: false,
          isSplitPosition: false,
        },
      });
    }
    if (stopLoss) {
      ordersToBuild.push({
        symbol,
        side: closeSide,
        amountBase: parentSize,
        price: stopLoss,
        tif: 'GTC',
        isMarket: false,
        reduceOnly: true,
        trigger: {
          type: 'STOP_LOSS',
          price: stopLoss,
          triggerBy: 'LAST',
          closePosition: false,
          isSplitPosition: false,
        },
      });
    }
    const built = [];
    for (const args of ordersToBuild) {
      built.push(await buildSignedOrder(args));
    }
    return built;
  }, [buildSignedOrder]);

  const placeGrvtMarketOrder = useCallback(async (symbol, side, marginUsdc, _slippage = '0.5', leverage = 1) => {
    try {
      const result = await submitSignedOrder({ symbol, side, marginUsdc, leverage, isMarket: true });
      await fetchAccount();
      return result;
    } catch (e) {
      return { error: grvtErrorMessage(e, 'GRVT market order failed') };
    }
  }, [fetchAccount, submitSignedOrder]);

  const placeGrvtLimitOrder = useCallback(async (symbol, side, price, marginUsdc, tif = 'GTC', leverage = 1, options = {}) => {
    try {
      let result;
      if (options?.attached_tpsl && (options.take_profit || options.stop_loss || options.takeProfit || options.stopLoss)) {
        const parent = await buildSignedOrder({ symbol, side, marginUsdc, price, tif, leverage, isMarket: false });
        const tpslOrders = await buildGrvtAttachedTpslOrders({
          symbol,
          parentSide: side,
          parentSize: parent.sizeText,
          takeProfit: options.take_profit || options.takeProfit || options.tp || null,
          stopLoss: options.stop_loss || options.stopLoss || options.sl || null,
        });
        result = await submitBulkSignedOrders([parent, ...tpslOrders], {
          symbol,
          notionalUsd: parent.notional_usd,
        });
      } else {
        result = await submitSignedOrder({ symbol, side, marginUsdc, price, tif, leverage, isMarket: false });
      }
      await fetchAccount();
      return result;
    } catch (e) {
      return { error: grvtErrorMessage(e, 'GRVT limit order failed') };
    }
  }, [buildGrvtAttachedTpslOrders, buildSignedOrder, fetchAccount, submitBulkSignedOrders, submitSignedOrder]);

  const closeGrvtPosition = useCallback(async (symbol, side, amountBase) => {
    try {
      const isLong = side === 'bid' || side === 'long' || side === 'buy';
      const result = await submitSignedOrder({
        symbol,
        side: isLong ? 'ask' : 'bid',
        amountBase,
        isMarket: true,
        reduceOnly: true,
      });
      await fetchAccount();
      return result;
    } catch (e) {
      return { error: grvtErrorMessage(e, 'GRVT close failed') };
    }
  }, [fetchAccount, submitSignedOrder]);

  const cancelGrvtOrder = useCallback(async (_symbol, orderId, _pairIndex = null, _tradeIndex = null, clientOrderId = null) => {
    try {
      const result = await authedPost('/api/futures/grvt/cancel-order', {
        order_id: orderId || '',
        client_order_id: clientOrderId || '',
        time_to_live_ms: '500',
      });
      await fetchAccount();
      return result;
    } catch (e) {
      return { error: grvtErrorMessage(e, 'GRVT cancel failed') };
    }
  }, [authedPost, fetchAccount]);

  const setGrvtTpsl = useCallback(async (symbol, closeSide, takeProfit, stopLoss, _pairIndex, _tradeIndex, amountBase) => {
    try {
      if (!takeProfit && !stopLoss) return { success: true };
      const placed = [];
      const closeBuy = closeSide === 'bid' || closeSide === 'buy' || closeSide === 'long';
      if (takeProfit) {
        placed.push(await submitSignedOrder({
          symbol,
          side: closeBuy ? 'bid' : 'ask',
          amountBase,
          price: takeProfit,
          tif: 'GTC',
          isMarket: false,
          reduceOnly: true,
          trigger: {
            type: 'TAKE_PROFIT',
            price: takeProfit,
            triggerBy: 'LAST',
            closePosition: false,
            isSplitPosition: false,
          },
        }));
      }
      if (stopLoss) {
        placed.push(await submitSignedOrder({
          symbol,
          side: closeBuy ? 'bid' : 'ask',
          amountBase,
          price: stopLoss,
          tif: 'GTC',
          isMarket: false,
          reduceOnly: true,
          trigger: {
            type: 'STOP_LOSS',
            price: stopLoss,
            triggerBy: 'LAST',
            closePosition: false,
            isSplitPosition: false,
          },
        }));
      }
      const failed = placed.find(row => row?.error || /reject|fail|cancel/i.test(String(row?.status || '')));
      if (failed) throw new Error(failed.error || `GRVT TP/SL ${failed.status}`);
      const sym = String(symbol || '').toUpperCase();
      setPositions(prev => prev.map(pos => (
        String(pos?.symbol || '').toUpperCase() === sym
          ? {
            ...pos,
            ...(takeProfit ? { take_profit_price: String(takeProfit), tp_trigger_price: String(takeProfit) } : {}),
            ...(stopLoss ? { stop_loss_price: String(stopLoss), sl_trigger_price: String(stopLoss) } : {}),
          }
          : pos
      )));
      await fetchAccount();
      setTimeout(fetchAccount, 1500);
      return { success: true, orders: placed };
    } catch (e) {
      return { error: grvtErrorMessage(e, 'GRVT TP/SL failed') };
    }
  }, [fetchAccount, submitSignedOrder]);

  const marketsWithLimits = useMemo(() => {
    if (!Object.keys(maxLeverageBySymbol).length) return markets;
    return markets.map((m) => {
      const cap = maxLeverageBySymbol[String(m.symbol || '').toUpperCase()];
      return cap ? { ...m, max_leverage: cap } : m;
    });
  }, [markets, maxLeverageBySymbol]);

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets: marketsWithLimits,
    walletUsdc,
    walletEth: null,
    leverageSettings,
    marginModes,
    dataReady,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    placeMarketOrder: placeGrvtMarketOrder,
    placeLimitOrder: placeGrvtLimitOrder,
    closePosition: closeGrvtPosition,
    cancelOrder: cancelGrvtOrder,
    setTpsl: setGrvtTpsl,
    setLeverage: async (symbol, lev) => {
      const key = String(symbol || '').toUpperCase();
      const market = marketForSymbol(symbol);
      const instrument = market?._grvt?.instrument || market?.market_name || `${key}_USDT_Perp`;
      return setGrvtInitialLeverage(instrument, symbol, lev);
    },
    setMarginMode: setGrvtMarginMode,
    depositToPacifica: openOfficialDeposit,
    withdraw: openOfficialWithdraw,
    activate,
    disconnect,
    claimGold,
    fetchOrders: fetchAccount,
    isSelfCustody: true,
    isReady: hasResolvedCredentials,
    setupVerified: hasResolvedCredentials,
    subaccountAddr: credentials?.subAccountId || null,
    walletMismatch,
    registeredEvmWallet,
    hasReferrer: hasResolvedCredentials,
    linkOurReferrer: activate,
    oneTapTrading: {
      enabled: !!oneTapSigner?.address,
      approved: !!oneTapSigner?.address,
      signer: oneTapSigner?.address || null,
      storage: 'browser',
      note: oneTapSigner?.address
        ? 'GRVT orders sign locally. The API signer is encrypted on this device; encrypted server sync requires wallet verification.'
        : 'Add the GRVT Secret Private Key to sign orders without wallet popups.',
    },
    setOneTapTradingEnabled: setGrvtOneTapTradingEnabled,
  };
}
