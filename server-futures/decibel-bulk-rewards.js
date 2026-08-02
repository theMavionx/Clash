'use strict';

const decibel = require('./decibel');

const DEFAULT_DECIBEL_BUILDER_SUBACCOUNT =
  '0xfa4d46a481f5bc95de01a629ec95b7876e946ebe1e86374284d899ac4366984a';
const LEGACY_DECIBEL_BUILDER_SUBACCOUNTS = [
  '0xf375ba6776dd44960e460d58e3f5d0ca645bf5d27210a3f16c6adc6abae78c03',
];
const DECIBEL_BUILDER_CHAIN_UNITS_PER_BPS = 100;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_ROWS = 1_000;
const DEFAULT_BOT_TIMEOUT_MS = 8_000;

const transactionCache = new Map();
const phantomSubaccountCache = new Map();

function normalizeAddress(value, client = decibel) {
  return client.normalizeAptosAddress(String(value || ''));
}

function allowedBuilderAddresses(client = decibel, env = process.env) {
  return new Set([
    DEFAULT_DECIBEL_BUILDER_SUBACCOUNT,
    env.DECIBEL_BUILDER_SUBACCOUNT,
    env.DECIBEL_ALLOWED_BUILDER_ADDRS,
    env.DECIBEL_LEGACY_BUILDER_SUBACCOUNTS,
    ...LEGACY_DECIBEL_BUILDER_SUBACCOUNTS,
  ]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => normalizeAddress(value.trim(), client))
    .filter(Boolean));
}

function vectorValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.vec)) return value.vec.length ? vectorValue(value.vec[0]) : '';
    if (value.inner !== undefined) return vectorValue(value.inner);
    if (value.value !== undefined) return vectorValue(value.value);
    if (value.order_id !== undefined) return vectorValue(value.order_id);
  }
  return String(value);
}

function finitePositive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeBulkFill(row, client = decibel) {
  const tradeId = String(row?.trade_id ?? row?.fill_id ?? row?.id ?? '').trim();
  const transactionVersion = String(row?.transaction_version ?? row?.transactionVersion ?? '').trim();
  const transactionUnixMs = Number(row?.transaction_unix_ms ?? row?.transactionUnixMs ?? row?.timestamp_ms ?? 0);
  const price = finitePositive(row?.price ?? row?.fill_price);
  const filledSize = finitePositive(row?.filled_size ?? row?.size);
  const user = normalizeAddress(row?.user ?? row?.account, client);
  const market = normalizeAddress(row?.market ?? row?.market_addr, client);
  if (!tradeId || !/^\d+$/.test(transactionVersion) || !Number.isFinite(transactionUnixMs)
    || transactionUnixMs <= 0 || !price || !filledSize || !user || !market) {
    return null;
  }
  return {
    tradeId,
    transactionVersion,
    transactionUnixMs,
    price,
    filledSize,
    notionalUsd: price * filledSize,
    user,
    market,
    isBid: row?.is_bid === true || String(row?.is_bid).toLowerCase() === 'true',
    sequenceNumber: String(row?.sequence_number ?? row?.sequenceNumber ?? ''),
  };
}

function builderEntryFromTradeEvent(event, client = decibel) {
  const data = event?.data || {};
  const direct = data?.builder_code?.vec?.[0] || null;
  const distributed = data?.fee_distribution?.builder_or_referrer_fees?.vec?.[0] || null;
  const builder = normalizeAddress(
    direct?.builder || direct?.address || distributed?.builder || distributed?.address,
    client,
  );
  const chainUnits = Number(direct?.fees);
  const distributedFee = Number(distributed?.fees);
  return {
    builder,
    chainUnits: Number.isFinite(chainUnits) ? chainUnits : 0,
    distributedFee: Number.isFinite(distributedFee) ? distributedFee : null,
  };
}

function verifyBulkFillTransaction(tx, fill, options = {}) {
  if (!tx || !fill) return null;
  const client = options.decibelClient || decibel;
  const allowedBuilders = options.allowedBuilders || allowedBuilderAddresses(client, options.env);
  const wantedUser = normalizeAddress(options.subaccount || fill.user, client);
  const wantedMarket = normalizeAddress(fill.market, client);
  const events = Array.isArray(tx.events) ? tx.events : [];
  const bulkEvent = events.find((event) => {
    if (!String(event?.type || '').includes('::market_types::BulkOrderFilledEvent')) return false;
    const data = event?.data || {};
    return String(data.fill_id ?? '') === fill.tradeId
      && normalizeAddress(data.user, client) === wantedUser
      && normalizeAddress(data.market, client) === wantedMarket;
  });
  if (!bulkEvent) return null;

  const tradeEvent = events.find((event) => {
    if (!String(event?.type || '').includes('::perp_positions::TradeEvent')) return false;
    const data = event?.data || {};
    if (String(data.fill_id ?? '') !== fill.tradeId) return false;
    if (normalizeAddress(data.account, client) !== wantedUser) return false;
    const eventMarket = normalizeAddress(vectorValue(data.market), client);
    if (eventMarket && eventMarket !== wantedMarket) return false;
    return data.is_taker === false || String(data.is_taker).toLowerCase() === 'false';
  });
  if (!tradeEvent) return null;

  const builder = builderEntryFromTradeEvent(tradeEvent, client);
  if (!builder.builder || !allowedBuilders.has(builder.builder) || builder.chainUnits <= 0) return null;
  const distributedAddress = normalizeAddress(
    tradeEvent?.data?.fee_distribution?.builder_or_referrer_fees?.vec?.[0]?.address,
    client,
  );
  if (distributedAddress && distributedAddress !== builder.builder) return null;

  const eventFeeRaw = Number(tradeEvent?.data?.fee);
  return {
    builderAddr: builder.builder,
    builderFeeBps: builder.chainUnits / DECIBEL_BUILDER_CHAIN_UNITS_PER_BPS,
    builderDistributedFee: builder.distributedFee,
    feeUsd: Number.isFinite(eventFeeRaw) ? eventFeeRaw / 1e6 : null,
    txHash: String(tx.hash || ''),
  };
}

async function fetchTransaction(version, client = decibel) {
  const key = String(version || '');
  if (transactionCache.has(key)) return transactionCache.get(key);
  const promise = client.fetchAptosJsonPath(`transactions/by_version/${key}`)
    .catch((error) => {
      transactionCache.delete(key);
      throw error;
    });
  transactionCache.set(key, promise);
  if (transactionCache.size > 2_000) transactionCache.clear();
  return promise;
}

async function fetchBulkFillPages(subaccount, options = {}) {
  const client = options.decibelClient || decibel;
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || DEFAULT_PAGE_SIZE)));
  const maxRows = Math.max(pageSize, Math.min(10_000, Number(options.maxRows || DEFAULT_MAX_ROWS)));
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = await client.fetchBulkOrderFills(subaccount, { limit: pageSize, offset });
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page.slice(0, maxRows - rows.length));
    if (page.length < pageSize || rows.length >= maxRows) break;
  }
  return rows;
}

async function marketSymbols(client = decibel) {
  try {
    const rows = await client.fetchMarkets();
    return new Map((Array.isArray(rows) ? rows : []).map((market) => {
      const address = normalizeAddress(market?.market || market?.market_addr || market?.address, client);
      const name = String(market?.market_name || market?.marketName || market?.symbol || 'UNKNOWN');
      const symbol = (name.split(/[-/]/)[0] || name).toUpperCase();
      return [address, symbol];
    }).filter(([address]) => address));
  } catch {
    return new Map();
  }
}

async function recordRecentBulkFills(playerId, subaccount, options = {}) {
  const client = options.decibelClient || decibel;
  const store = options.tradeDb || require('./db');
  const normalizedSubaccount = normalizeAddress(subaccount, client);
  if (!playerId || !/^0x[0-9a-f]{64}$/.test(normalizedSubaccount)) {
    return { fetched: 0, eligible: 0, verified: 0, imported: 0, updated: 0, existing: 0, rejected: 0, skipped: 'invalid_player_or_subaccount' };
  }
  const rawRows = await fetchBulkFillPages(normalizedSubaccount, options);
  const startMs = options.startAt ? Date.parse(options.startAt) : Number.NEGATIVE_INFINITY;
  const endMs = options.endAt ? Date.parse(options.endAt) : Number.POSITIVE_INFINITY;
  const fills = rawRows
    .map((row) => normalizeBulkFill(row, client))
    .filter((fill) => fill
      && fill.user === normalizedSubaccount
      && fill.transactionUnixMs >= startMs
      && fill.transactionUnixMs <= endMs);
  const symbols = await marketSymbols(client);
  const allowedBuilders = allowedBuilderAddresses(client, options.env);
  const stats = {
    fetched: rawRows.length,
    eligible: fills.length,
    verified: 0,
    imported: 0,
    updated: 0,
    existing: 0,
    rejected: 0,
    volume_usd: 0,
    imported_volume_usd: 0,
  };

  for (const fill of fills) {
    const clientOrderId = `decibel:bulk-fill:${fill.tradeId}`;
    if (typeof store.getTradeByClientOrderId === 'function'
      && store.getTradeByClientOrderId(playerId, 'decibel', clientOrderId)) {
      stats.existing++;
      stats.volume_usd += fill.notionalUsd;
      continue;
    }
    let tx;
    try {
      tx = await fetchTransaction(fill.transactionVersion, client);
    } catch {
      stats.rejected++;
      continue;
    }
    const proof = verifyBulkFillTransaction(tx, fill, {
      decibelClient: client,
      allowedBuilders,
      subaccount: normalizedSubaccount,
    });
    if (!proof) {
      stats.rejected++;
      continue;
    }
    stats.verified++;
    stats.volume_usd += fill.notionalUsd;
    const proofJson = JSON.stringify({
      source: 'decibel_bulk_fill',
      bulk_trade_id: fill.tradeId,
      sequence_number: fill.sequenceNumber || null,
      transaction_version: fill.transactionVersion,
      transaction_hash: proof.txHash || null,
      transaction_unix_ms: fill.transactionUnixMs,
      subaccount: normalizedSubaccount,
      market: fill.market,
      builder: proof.builderAddr,
      builder_fee_bps: proof.builderFeeBps,
      builder_distributed_fee: proof.builderDistributedFee,
    });
    if (options.dryRun) continue;
    const trade = {
      symbol: symbols.get(fill.market) || 'UNKNOWN',
      side: fill.isBid ? 'long' : 'short',
      orderType: 'limit',
      amount: String(fill.filledSize),
      price: String(fill.price),
      orderId: null,
      clientOrderId,
      status: 'filled',
      dex: 'decibel',
      notional_usd: fill.notionalUsd,
      verifiedSource: 'decibel_fill',
      fee: proof.feeUsd,
      proofJson,
      createdAt: new Date(fill.transactionUnixMs).toISOString(),
    };
    const result = typeof store.upsertVerifiedTrade === 'function'
      ? store.upsertVerifiedTrade(playerId, trade)
      : store.addTrade(playerId, trade);
    stats.imported += Number(result?.inserted ?? result?.changes ?? 0);
    stats.updated += Number(result?.updated || 0);
    if (Number(result?.inserted ?? result?.changes ?? 0) > 0) {
      stats.imported_volume_usd += fill.notionalUsd;
    }
    if (typeof store.recordDecibelOrderProof === 'function') {
      store.recordDecibelOrderProof({
        playerId,
        subaccount: normalizedSubaccount,
        clientOrderId,
        symbol: trade.symbol,
        side: trade.side,
        orderType: trade.orderType,
        marketAddr: fill.market,
        builderAddr: proof.builderAddr,
        builderFeeBps: proof.builderFeeBps,
        txHash: proof.txHash || null,
        proofJson,
      });
    }
  }
  for (const key of ['volume_usd', 'imported_volume_usd']) {
    stats[key] = Number(stats[key].toFixed(6));
  }
  return stats;
}

function extractAccounts(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  if (Array.isArray(payload?.data?.accounts)) return payload.data.accounts;
  return [];
}

async function resolvePhantomDecibelSubaccount(playerId, options = {}) {
  const cached = phantomSubaccountCache.get(String(playerId));
  const cacheMs = Math.max(5_000, Number(options.cacheMs || 5 * 60_000));
  if (cached && Date.now() - cached.at < cacheMs) return cached.subaccount;
  const env = options.env || process.env;
  const botUrl = String(options.botUrl || env.CLASH_BOT_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
  const proxySecret = String(options.botProxySecret
    || env.CLASH_BOT_PROXY_SECRET
    || env.PHANTOM__AUTH__TRUSTED_PROXY_SECRET
    || '').trim();
  if (!proxySecret) return '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1_000, Number(options.timeoutMs || DEFAULT_BOT_TIMEOUT_MS)));
  try {
    const response = await (options.fetchImpl || fetch)(`${botUrl}/api/v1/accounts`, {
      headers: {
        accept: 'application/json',
        'x-tenant-id': String(playerId),
        'x-proxy-secret': proxySecret,
      },
      signal: controller.signal,
    });
    if (!response.ok) return '';
    const accounts = extractAccounts(await response.json());
    const account = accounts.find((item) => String(item?.exchange || '').toLowerCase() === 'decibel'
      && String(item?.status || 'active').toLowerCase() === 'active');
    const subaccount = normalizeAddress(account?.sub_account || account?.subAccount, options.decibelClient || decibel);
    if (!/^0x[0-9a-f]{64}$/.test(subaccount)) return '';
    phantomSubaccountCache.set(String(playerId), { at: Date.now(), subaccount });
    return subaccount;
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  recordRecentBulkFills,
  resolvePhantomDecibelSubaccount,
  normalizeBulkFill,
  verifyBulkFillTransaction,
  allowedBuilderAddresses,
  __test: {
    extractAccounts,
    transactionCache,
    phantomSubaccountCache,
  },
};
