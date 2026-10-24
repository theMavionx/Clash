// Available margin on a ClashBot copy destination, read through the same data
// sources the game's Futures terminal already uses for that venue
// (web/src/hooks/use<Venue>.js). Read-only: nothing here signs or moves funds.
//
// fetchCopyVenueBalance resolves { availableUsd, account } or throws when the
// balance cannot be read (no wallet, no saved game credential for an
// authenticated venue, venue/API failure); the setup wizard then falls back to
// a manual budget input. A venue that answers "no account yet" resolves 0.
import { defaultDestinationAccount } from './copyConnections';
import { readEncryptedCredential } from '../../lib/encryptedCredentialStorage';
import { readOndoSession } from '../../lib/ondoClient';
import { fetchQfexJson, readQfexCredentials } from '../../lib/qfexClient';
import { getPhoenixReadClient, phoenixApiEndpointCandidates } from '../../lib/phoenixClient';

const FUTURES_API = '/api/futures';
const ARCUS_API = 'https://api.arcus.xyz';
/** Game credential the Futures -> GRVT terminal saves (useGrvt.js STORAGE_KEY). */
const GRVT_CREDENTIAL_KEY = 'clash_grvt_credentials_v1';
/** Lighter-style futures route prefix per copy destination (copy ids equal the game's dex ids). */
const LIGHTER_ROUTES = { lighter: 'lighter', rhlighter: 'rh-lighter' };

class BalanceUnavailable extends Error {}

function num(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function usd(value) {
  if (value == null || !Number.isFinite(value)) throw new BalanceUnavailable('The venue did not report an available balance.');
  return Math.max(0, value);
}

function gameHeaders(token, dex, extra = {}) {
  return { ...(token ? { 'x-token': token } : {}), ...(dex ? { 'x-dex': dex } : {}), ...extra };
}

async function getJson(url, { signal, headers, method = 'GET', body, notFound } = {}) {
  const response = await fetch(url, {
    method, signal, cache: 'no-store', headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...(headers || {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 404 && notFound !== undefined) return notFound;
  if (!response.ok) {
    const error = new BalanceUnavailable(payload?.detail || payload?.error || `Balance request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function evmWallet(walletCtx) {
  const owner = String(walletCtx?.evmWalletAddress || walletCtx?.walletAddress || '').toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(owner) ? owner : '';
}

function solanaWallet(walletCtx) {
  return String(walletCtx?.solWallet?.publicKey?.toBase58?.() || walletCtx?.solanaWalletAddress || '').trim();
}

function aptosWallet(walletCtx) {
  const raw = String(walletCtx?.aptosWallet?.address || walletCtx?.aptosWalletAddress || '').trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{1,64}$/.test(raw) ? `0x${raw.padStart(64, '0')}` : '';
}

/**
 * The destination account ClashBot would copy into on `venue` (the same one its
 * connector provisions), or the saved/edited bot's `account` when given.
 */
export function copyBalanceAccount(venue, { account, player, walletCtx } = {}) {
  if (account) return String(account);
  switch (venue) {
    case 'hyperliquid': case 'nado': case 'risex': case 'bulk':
      return defaultDestinationAccount(venue, player, walletCtx);
    case 'decibel':
      return aptosWallet(walletCtx);
    case 'phoenix':
      return solanaWallet(walletCtx);
    default:
      return evmWallet(walletCtx);
  }
}

/** Public futures account read (/api/futures/account?dex=...&address=...) as useNado/useRisex/useHyperliquid do. */
async function futuresAccount(dex, address, token, signal) {
  return getJson(`${FUTURES_API}/account?dex=${dex}&address=${encodeURIComponent(address)}`, {
    signal, headers: gameHeaders(token, dex),
  });
}

async function readHyperliquidStyle(dex, address, token, signal) {
  const account = await futuresAccount(dex, address, token, signal);
  return usd(num(account?.available_to_spend, account?.available_to_withdraw));
}

async function readGmx(address, token, signal) {
  // GMX copies use the wallet's Arbitrum USDC as collateral (useGmx / server gmx.getAccountByAddress).
  const payload = await futuresAccount('gmx', address, token, signal);
  if (payload?.success === false) throw new BalanceUnavailable(payload?.error || 'GMX balance unavailable');
  const account = payload?.data || payload;
  return usd(num(account?.available_to_spend, account?.wallet_usdc));
}

async function readBulk(address, token, signal) {
  const account = await futuresAccount('bulk', address, token, signal);
  const margin = account?.margin || account?.marginSummary || {};
  return usd(num(margin.availableBalance, margin.available_balance, margin.availableMargin, account?.available_to_spend));
}

async function readLighter(venue, account, token, signal) {
  const query = /^\d+$/.test(account) ? `account_index=${account}` : `address=${encodeURIComponent(account)}`;
  const data = await getJson(`${FUTURES_API}/${LIGHTER_ROUTES[venue]}/account?${query}`, {
    signal, headers: gameHeaders(token, venue),
  });
  if (data?.exists === false) return 0;
  return usd(num(data?.available_balance, data?.balance));
}

async function readGrvt(token, signal) {
  const creds = await readEncryptedCredential(GRVT_CREDENTIAL_KEY).catch(() => null);
  if (!creds?.subAccountId || (!creds.apiKey && !(creds.cookie && creds.accountId))) {
    throw new BalanceUnavailable('Connect GRVT in Futures to read its balance.');
  }
  const data = await getJson(`${FUTURES_API}/grvt/account`, {
    signal, method: 'POST', headers: gameHeaders(token, 'grvt'),
    body: {
      api_key: creds.apiKey, cookie: creds.cookie, account_id: creds.accountId,
      sub_account_id: creds.subAccountId, funding_account_address: creds.fundingAccountAddress,
    },
  });
  const raw = data?._raw || data?.account || data?.summary || {};
  return usd(num(data?.available_to_spend, data?.available_balance, raw.available_to_spend, raw.available_balance, raw.ab));
}

async function readOndo(owner, token, signal) {
  const session = readOndoSession(owner);
  if (!session?.token) throw new BalanceUnavailable('Sign in to Ondo in Futures to read its balance.');
  const data = await getJson(`${FUTURES_API}/ondo/account?dex=ondo`, {
    signal, headers: gameHeaders(token, 'ondo', { 'x-ondo-wallet': owner, 'x-ondo-token': session.token }),
  });
  return usd(num(data?.available_to_spend));
}

async function readQfex(token, signal) {
  const credentials = await readQfexCredentials();
  if (!credentials) throw new BalanceUnavailable('Connect QFEX in Futures to read its balance.');
  const snapshot = await fetchQfexJson(`${FUTURES_API}/qfex/account-snapshot`, { token, credentials, signal });
  const account = snapshot?.account || {};
  return usd(num(account.available_to_spend, account.free_collateral, account.balance));
}

async function readDecibel(owner, token, signal) {
  const { getPrimarySubaccountAddr } = await import('../../lib/decibel');
  const subaccount = await getPrimarySubaccountAddr(owner);
  if (!subaccount) return 0;
  const data = await getJson(`${FUTURES_API}/decibel/account?owner=${owner}&subaccountAddr=${encodeURIComponent(String(subaccount))}`, {
    signal, headers: gameHeaders(token, 'decibel'), notFound: null,
  });
  if (!data) return 0;
  return usd(num(data.usdc_cross_withdrawable_balance, data.perp_equity_balance));
}

function tokenAmount(value) {
  if (value == null) return null;
  if (typeof value !== 'object') return num(value);
  const ui = num(value.ui);
  if (ui != null) return ui;
  const raw = num(value.value, value.amount, value.raw);
  const decimals = Number(value.decimals);
  return raw != null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 18 ? raw / 10 ** decimals : raw;
}

async function readPhoenix(owner) {
  // usePhoenix getOneTapCollateralSummary: free collateral of trader PDA 0 / subaccount 0.
  let lastError = null;
  for (const source of phoenixApiEndpointCandidates()) {
    try {
      const traders = getPhoenixReadClient(source.apiUrl)?.api?.traders?.();
      if (!traders) continue;
      const view = typeof traders.getTraderState === 'function'
        ? await traders.getTraderState(owner, { pdaIndex: 0, traderPdaIndex: 0 })
        : await traders.getTraderStateSnapshot(owner, { traderPdaIndex: 0 });
      const rows = Array.isArray(view?.traders) ? view.traders : [];
      const trader = rows.find((row) => Number(row?.traderSubaccountIndex || 0) === 0) || rows[0];
      if (!trader) return 0;
      const collateral = num(tokenAmount(trader.effectiveCollateral), tokenAmount(trader.collateralBalance)) ?? 0;
      return Math.max(0, collateral - (tokenAmount(trader.initialMargin) || 0));
    } catch (error) {
      if (/404|Trader not found|no trader|not registered|does not exist/i.test(String(error?.message || error))) return 0;
      lastError = error;
    }
  }
  throw lastError || new BalanceUnavailable('Phoenix balance unavailable');
}

async function readArcus(owner, signal) {
  // Public Arcus REST (docs.arcus.xyz GET /v1/account): free collateral of subaccount 0, the one ClashBot's key is scoped to.
  const data = await getJson(`${ARCUS_API}/v1/account?address=${owner}&accountIndex=0`, { signal, notFound: null });
  if (!data) return 0;
  return usd(num(data.freeCollateral));
}

/**
 * Available margin (USD) on copy destination `venue`.
 * @param {{ venue: string, token: string, player?: object, walletCtx?: object, account?: string, signal?: AbortSignal }} options
 * @returns {Promise<{ availableUsd: number, account: string }>}
 */
export async function fetchCopyVenueBalance({ venue, token, player, walletCtx, account: knownAccount, signal }) {
  const account = copyBalanceAccount(venue, { account: knownAccount, player, walletCtx });
  if (!account) throw new BalanceUnavailable('Connect the wallet for this exchange to read its balance.');
  let availableUsd;
  switch (venue) {
    case 'hyperliquid': case 'nado': case 'risex':
      availableUsd = await readHyperliquidStyle(venue, account, token, signal); break;
    case 'gmx':
      availableUsd = await readGmx(account, token, signal); break;
    case 'bulk':
      availableUsd = await readBulk(account, token, signal); break;
    case 'lighter': case 'rhlighter':
      availableUsd = await readLighter(venue, account, token, signal); break;
    case 'grvt':
      availableUsd = await readGrvt(token, signal); break;
    case 'ondo':
      availableUsd = await readOndo(account.toLowerCase(), token, signal); break;
    case 'qfex':
      availableUsd = await readQfex(token, signal); break;
    case 'decibel':
      availableUsd = await readDecibel(aptosWallet({ aptosWalletAddress: account }), token, signal); break;
    case 'phoenix':
      availableUsd = await readPhoenix(account); break;
    case 'arcus':
      availableUsd = await readArcus(account.toLowerCase(), signal); break;
    default:
      throw new BalanceUnavailable('Balance reads are not available for this exchange.');
  }
  return { availableUsd, account };
}
