#!/usr/bin/env node
'use strict';

const path = require('path');

const APP_ROOT = process.env.CLASH_APP_ROOT
  || path.resolve(__dirname, '..');
const Database = require(path.join(APP_ROOT, 'server-futures', 'node_modules', 'better-sqlite3'));
const auditOutput = console.log;
console.log = (...args) => console.error(...args);
const decibel = require(path.join(APP_ROOT, 'server-futures', 'decibel'));
const {
  allowedBuilderAddresses,
} = require(path.join(APP_ROOT, 'server-futures', 'decibel-bulk-rewards'));
const {
  normalizeFillId,
} = require(path.join(APP_ROOT, 'server-futures', 'decibel-fill-identity'));
console.log = auditOutput;

const PAGE_SIZE = 100;
const DEFAULT_MAX_ROWS = 10_000;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function sqlDateMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return Number.NaN;
  return Date.parse(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
}

function laterMs(...values) {
  const parsed = values.map(sqlDateMs).filter(Number.isFinite);
  return parsed.length ? Math.max(...parsed) : Number.NaN;
}

function normalizeSubaccount(value) {
  const normalized = decibel.normalizeAptosAddress(String(value || ''));
  return /^0x[0-9a-f]{64}$/u.test(normalized) ? normalized : '';
}

function fillTimeMs(row) {
  const direct = Number(row?.transaction_unix_ms ?? row?.transactionUnixMs ?? row?.unix_ms ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return sqlDateMs(row?.created_at ?? row?.createdAt ?? row?.timestamp);
}

function fillNotional(row) {
  const size = Math.abs(Number(row?.size ?? row?.filled_size ?? row?.base_size ?? 0));
  const price = Number(row?.price ?? row?.fill_price ?? row?.avg_price ?? 0);
  const value = size * price;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function exactFillId(row) {
  return normalizeFillId(row?.trade_id ?? row?.fill_id ?? row?.id);
}

function scopedFillId(subaccount, fillId) {
  const account = normalizeSubaccount(subaccount);
  const id = normalizeFillId(fillId);
  return account && id ? `${account}:${id}` : '';
}

function exactOrderId(row) {
  return String(row?.order_id ?? row?.orderId ?? row?.orderID ?? '').trim().toLowerCase();
}

function exactClientOrderId(row) {
  return String(row?.client_order_id ?? row?.clientOrderId ?? row?.clientOrderID ?? '').trim().toLowerCase();
}

function roundUsd(value) {
  return Number((Number(value) || 0).toFixed(6));
}

function parseJson(raw) {
  try {
    return JSON.parse(String(raw || ''));
  } catch {
    return null;
  }
}

function vectorValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.vec)) return value.vec.length ? vectorValue(value.vec[0]) : '';
    if (value.inner !== undefined) return vectorValue(value.inner);
    if (value.value !== undefined) return vectorValue(value.value);
  }
  return String(value);
}

function verifyTradeEvent(tx, fill, allowedBuilders) {
  const events = Array.isArray(tx?.events) ? tx.events : [];
  const event = events.find((candidate) => {
    if (!String(candidate?.type || '').includes('::perp_positions::TradeEvent')) return false;
    const data = candidate?.data || {};
    if (normalizeFillId(data.fill_id) !== fill.trade_id) return false;
    if (normalizeSubaccount(data.account) !== fill.subaccount) return false;
    const eventMarket = normalizeSubaccount(vectorValue(data.market));
    return !fill.market || !eventMarket || eventMarket === fill.market;
  });
  if (!event) return { verified: false, reason: 'matching_trade_event_missing' };
  const data = event.data || {};
  const direct = data?.builder_code?.vec?.[0] || null;
  const distributed = data?.fee_distribution?.builder_or_referrer_fees?.vec?.[0] || null;
  const builder = normalizeSubaccount(
    direct?.builder || direct?.address || distributed?.builder || distributed?.address,
  );
  const chainFee = Number(direct?.fees);
  const distributedFee = Number(distributed?.fees);
  const hasPositiveFee = (Number.isFinite(chainFee) && chainFee > 0)
    || (Number.isFinite(distributedFee) && distributedFee > 0);
  if (!builder || !allowedBuilders.has(builder) || !hasPositiveFee) {
    return {
      verified: false,
      reason: builder && !allowedBuilders.has(builder) ? 'different_builder' : 'builder_fee_missing',
      builder: builder || null,
    };
  }
  return { verified: true, builder, transaction_hash: String(tx?.hash || '') || null };
}

async function verifyUnresolvedFills(unresolved, allowedBuilders, concurrency = 8) {
  const txCache = new Map();
  const rows = [...unresolved.values()];
  const outcomes = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const fill = rows[cursor++];
      const version = String(fill.transaction_version || '').trim();
      if (!/^\d+$/u.test(version)) {
        outcomes.set(fill.identity, { verified: false, reason: 'transaction_version_missing' });
        continue;
      }
      try {
        if (!txCache.has(version)) {
          txCache.set(version, decibel.fetchAptosJsonPath(`transactions/by_version/${version}`));
        }
        const tx = await txCache.get(version);
        outcomes.set(fill.identity, verifyTradeEvent(tx, fill, allowedBuilders));
      } catch (error) {
        txCache.delete(version);
        outcomes.set(fill.identity, { verified: false, reason: `transaction_fetch_failed:${error?.status || 'unknown'}` });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));
  return outcomes;
}

async function fetchWindowPages(fetchPage, startMs, cutoffMs, maxRows) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
    const page = await fetchPage({
      limit: PAGE_SIZE,
      offset,
      sortDir: 'DESC',
      throwOnError: true,
    });
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page.slice(0, maxRows - rows.length));
    const times = page.map(fillTimeMs).filter(Number.isFinite);
    if (page.length < PAGE_SIZE || rows.length >= maxRows) break;
    if (times.length && Math.max(...times) < startMs) break;
  }
  return rows.filter((row) => {
    const time = fillTimeMs(row);
    return Number.isFinite(time) && time >= startMs && time <= cutoffMs;
  });
}

function loadProofIndex(futuresDb, playerId, allowedBuilders) {
  const rows = futuresDb.prepare(`
    SELECT subaccount, order_id, client_order_id, builder_addr, builder_fee_bps,
           tx_hash, proof_json
    FROM decibel_order_proofs
    WHERE player_id = ?
  `).all(playerId);
  const byOrder = new Map();
  const byClient = new Map();
  const subaccounts = new Set();
  for (const row of rows) {
    const subaccount = normalizeSubaccount(row.subaccount);
    const builder = normalizeSubaccount(row.builder_addr);
    if (!subaccount || !allowedBuilders.has(builder) || Number(row.builder_fee_bps) <= 0) continue;
    subaccounts.add(subaccount);
    const orderId = exactOrderId(row);
    const clientOrderId = exactClientOrderId(row);
    if (orderId) byOrder.set(`${subaccount}:${orderId}`, row);
    if (clientOrderId) byClient.set(`${subaccount}:${clientOrderId}`, row);
  }
  return { byOrder, byClient, subaccounts };
}

function loadVerifiedBulkIds(futuresDb, playerId, allowedBuilders) {
  const rows = futuresDb.prepare(`
    SELECT proof_json
    FROM trade_history
    WHERE player_id = ? AND dex = 'decibel' AND status = 'filled'
      AND verified_source = 'decibel_fill'
      AND json_valid(COALESCE(proof_json, ''))
      AND json_extract(proof_json, '$.source') = 'decibel_bulk_fill'
  `).all(playerId);
  const ids = new Set();
  const subaccounts = new Set();
  for (const row of rows) {
    const proof = parseJson(row.proof_json);
    const builder = normalizeSubaccount(proof?.builder);
    const subaccount = normalizeSubaccount(proof?.subaccount);
    const fillId = normalizeFillId(proof?.bulk_trade_id);
    if (!fillId || !subaccount || !allowedBuilders.has(builder) || Number(proof?.builder_fee_bps) <= 0) continue;
    ids.add(scopedFillId(subaccount, fillId));
    subaccounts.add(subaccount);
  }
  return { ids, subaccounts };
}

function tournamentCredits(mainDb, tournamentId, playerId) {
  return mainDb.prepare(`
    SELECT source, trade_id, dex, trades_count, volume_usd, pnl_usd, credited_at
    FROM tournament_trade_credits
    WHERE tournament_id = ? AND player_id = ? AND lower(dex) = 'decibel'
  `).all(tournamentId, playerId);
}

function futuresRowsForCredits(futuresDb, playerId, credits) {
  const ids = [...new Set(credits
    .filter((row) => row.source === 'trade_history' && /^\d+$/u.test(String(row.trade_id)))
    .map((row) => Number(row.trade_id))
    .filter(Number.isSafeInteger))];
  const rows = new Map();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const chunk = ids.slice(offset, offset + 500);
    const placeholders = chunk.map(() => '?').join(',');
    for (const row of futuresDb.prepare(`
      SELECT id, player_id, client_order_id, proof_json, notional_usd, created_at
      FROM trade_history
      WHERE player_id = ? AND id IN (${placeholders})
    `).all(playerId, ...chunk)) {
      rows.set(String(row.id), row);
    }
  }
  return rows;
}

function knownLegacyDuplicateVolume(credits, futuresRows) {
  const legacyIds = new Set(credits
    .filter((row) => row.source === 'decibel_bulk_fill')
    .map((row) => String(row.trade_id)));
  let rows = 0;
  let volume = 0;
  const fillIds = [];
  for (const credit of credits) {
    if (credit.source !== 'trade_history') continue;
    const future = futuresRows.get(String(credit.trade_id));
    const proof = parseJson(future?.proof_json);
    const fillId = String(proof?.bulk_trade_id || '').trim();
    if (proof?.source !== 'decibel_bulk_fill' || !legacyIds.has(fillId)) continue;
    rows++;
    volume += Number(credit.volume_usd) || 0;
    fillIds.push(fillId);
  }
  return { rows, volume_usd: roundUsd(volume), fill_ids: fillIds };
}

async function ownerSubaccounts(owner) {
  const normalizedOwner = normalizeSubaccount(owner);
  if (!normalizedOwner) return [];
  try {
    const rows = await decibel.fetchUserSubaccounts(normalizedOwner);
    return [...new Set((Array.isArray(rows) ? rows : [])
      .map((row) => normalizeSubaccount(row?.subaccount_address || row?.address))
      .filter(Boolean))];
  } catch {
    return [];
  }
}

async function auditParticipant(context, participant) {
  const {
    mainDb,
    futuresDb,
    tournament,
    cutoffMs,
    maxRows,
    allowedBuilders,
  } = context;
  const startMs = laterMs(tournament.start_at, participant.joined_at);
  const participantCutoffMs = Math.min(Date.now(), cutoffMs);
  const endMs = Math.min(
    participantCutoffMs,
    sqlDateMs(tournament.end_at) || participantCutoffMs,
    sqlDateMs(participant.left_at) || participantCutoffMs,
  );
  const proofIndex = loadProofIndex(futuresDb, participant.player_id, allowedBuilders);
  const verifiedBulk = loadVerifiedBulkIds(futuresDb, participant.player_id, allowedBuilders);
  const subaccounts = new Set([...proofIndex.subaccounts, ...verifiedBulk.subaccounts]);
  for (const subaccount of await ownerSubaccounts(participant.wallet_address || participant.wallet)) {
    subaccounts.add(subaccount);
  }

  const credits = tournamentCredits(mainDb, tournament.id, participant.player_id);
  const legacyBulkIds = new Set(credits
    .filter((row) => row.source === 'decibel_bulk_fill')
    .map((row) => String(row.trade_id)));
  const expected = new Map();
  const unresolved = new Map();
  const upstreamBulkIds = new Set();

  for (const subaccount of subaccounts) {
    const [trades, bulkRows] = await Promise.all([
      fetchWindowPages(
        (page) => decibel.fetchTradeHistory(subaccount, page),
        startMs,
        endMs,
        maxRows,
      ),
      fetchWindowPages(
        (page) => decibel.fetchBulkOrderFills(subaccount, page),
        startMs,
        endMs,
        maxRows,
      ),
    ]);
    for (const bulk of bulkRows) {
      const fillId = exactFillId(bulk);
      if (fillId) upstreamBulkIds.add(scopedFillId(subaccount, fillId));
    }
    for (const fill of trades) {
      const fillId = exactFillId(fill);
      const identity = scopedFillId(subaccount, fillId);
      const notional = fillNotional(fill);
      if (!identity || !notional || expected.has(identity) || unresolved.has(identity)) continue;
      const isBulk = upstreamBulkIds.has(identity);
      const exactProof = proofIndex.byOrder.get(`${subaccount}:${exactOrderId(fill)}`)
        || proofIndex.byClient.get(`${subaccount}:${exactClientOrderId(fill)}`)
        || null;
      const proven = isBulk
        ? verifiedBulk.ids.has(identity) || legacyBulkIds.has(fillId)
        : Boolean(exactProof);
      const row = {
        identity,
        trade_id: fillId,
        subaccount,
        order_id: exactOrderId(fill) || null,
        client_order_id: exactClientOrderId(fill) || null,
        transaction_version: String(fill?.transaction_version ?? ''),
        transaction_unix_ms: fillTimeMs(fill),
        notional_usd: notional,
        kind: isBulk ? 'bulk' : 'order',
        market: normalizeSubaccount(fill?.market),
      };
      (proven ? expected : unresolved).set(identity, row);
    }
  }

  const proofCoveredFills = expected.size;
  const onChainOutcomes = await verifyUnresolvedFills(unresolved, allowedBuilders);
  const unresolvedReasons = {};
  let onChainVerifiedFills = 0;
  let onChainVerifiedVolume = 0;
  for (const [identity, outcome] of onChainOutcomes) {
    const fill = unresolved.get(identity);
    if (!fill) continue;
    if (outcome?.verified) {
      unresolved.delete(identity);
      expected.set(identity, {
        ...fill,
        proof: 'aptos_trade_event',
        builder: outcome.builder,
        transaction_hash: outcome.transaction_hash,
      });
      onChainVerifiedFills++;
      onChainVerifiedVolume += fill.notional_usd;
      continue;
    }
    const reason = String(outcome?.reason || 'unknown');
    unresolvedReasons[reason] = (unresolvedReasons[reason] || 0) + 1;
  }

  const creditedVolume = credits.reduce((sum, row) => sum + Number(row.volume_usd || 0), 0);
  const creditedTrades = credits.reduce((sum, row) => sum + Number(row.trades_count || 0), 0);
  const expectedVolume = [...expected.values()].reduce((sum, row) => sum + row.notional_usd, 0);
  const unresolvedVolume = [...unresolved.values()].reduce((sum, row) => sum + row.notional_usd, 0);
  const futuresRows = futuresRowsForCredits(futuresDb, participant.player_id, credits);
  const legacyDuplicates = knownLegacyDuplicateVolume(credits, futuresRows);
  const creditedAfterKnownDedupe = creditedVolume - legacyDuplicates.volume_usd;
  const provenDeltaAfterKnownDedupe = expectedVolume - creditedAfterKnownDedupe;
  const sources = {};
  for (const credit of credits) {
    const key = String(credit.source || 'unknown');
    sources[key] ||= { rows: 0, trades_count: 0, volume_usd: 0 };
    sources[key].rows++;
    sources[key].trades_count += Number(credit.trades_count || 0);
    sources[key].volume_usd += Number(credit.volume_usd || 0);
  }
  for (const value of Object.values(sources)) value.volume_usd = roundUsd(value.volume_usd);

  return {
    player_id: participant.player_id,
    player_name: participant.player_name,
    joined_at: participant.joined_at,
    left_at: participant.left_at || null,
    cutoff_at: new Date(participantCutoffMs).toISOString(),
    subaccounts: [...subaccounts],
    upstream: {
      proof_covered_fills: proofCoveredFills,
      onchain_verified_fills: onChainVerifiedFills,
      onchain_verified_volume_usd: roundUsd(onChainVerifiedVolume),
      proven_fills: expected.size,
      proven_volume_usd: roundUsd(expectedVolume),
      unresolved_fills: unresolved.size,
      unresolved_volume_usd: roundUsd(unresolvedVolume),
      unresolved_reasons: unresolvedReasons,
    },
    credited: {
      rows: credits.length,
      trades_count: creditedTrades,
      volume_usd: roundUsd(creditedVolume),
      sources,
    },
    known_legacy_duplicates: legacyDuplicates,
    credited_after_known_dedupe_usd: roundUsd(creditedAfterKnownDedupe),
    proven_delta_after_known_dedupe_usd: roundUsd(provenDeltaAfterKnownDedupe),
    classification: Math.abs(provenDeltaAfterKnownDedupe) < 0.01
      ? (unresolved.size ? 'matches_proven_but_has_unresolved_fills' : 'matches')
      : (provenDeltaAfterKnownDedupe > 0 ? 'missing_proven_volume' : 'credited_above_proven_volume'),
    ...(process.argv.includes('--include-fill-details') ? {
      proven_fill_details: [...expected.values()],
    } : {}),
    unresolved_sample: [...unresolved.values()].slice(0, 10),
  };
}

async function main() {
  const tournamentId = Number(argValue('--tournament-id') || 24);
  const maxRows = Math.max(PAGE_SIZE, Math.min(50_000, Number(argValue('--max-rows') || DEFAULT_MAX_ROWS)));
  const mainDbPath = process.env.CLASH_MAIN_DB || path.join(APP_ROOT, 'server', 'clash.db');
  const futuresDbPath = process.env.CLASH_FUTURES_DB || path.join(APP_ROOT, 'server-futures', 'futures.db');
  const mainDb = new Database(mainDbPath, { readonly: true, fileMustExist: true });
  const futuresDb = new Database(futuresDbPath, { readonly: true, fileMustExist: true });
  const markets = await decibel.fetchMarkets();
  if (!Array.isArray(markets) || markets.length === 0) {
    throw new Error('Decibel API preflight returned no markets; refusing to treat an API/auth failure as zero volume');
  }
  const tournament = mainDb.prepare(`
    SELECT * FROM tournaments WHERE id = ? AND lower(dex) = 'decibel'
  `).get(tournamentId);
  if (!tournament) throw new Error(`Decibel tournament ${tournamentId} not found`);
  let participants = mainDb.prepare(`
    SELECT tp.player_id, tp.joined_at, tp.left_at, p.name AS player_name, p.wallet,
           pda.wallet_address
    FROM tournament_participants tp
    JOIN players p ON p.id = tp.player_id
    LEFT JOIN player_dex_accounts pda
      ON pda.player_id = p.id AND pda.dex = 'decibel'
    WHERE tp.tournament_id = ?
    ORDER BY lower(p.name), tp.player_id
  `).all(tournamentId);
  const playerFilter = new Set(String(argValue('--players') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
  if (playerFilter.size) {
    participants = participants.filter((participant) => playerFilter.has(String(participant.player_name || '').toLowerCase())
      || playerFilter.has(String(participant.player_id || '').toLowerCase()));
  }
  if (!participants.length) throw new Error('No tournament participants matched the requested filter');
  const requestedCutoff = String(argValue('--cutoff-at') || '').trim();
  const parsedCutoff = requestedCutoff ? Date.parse(requestedCutoff) : Date.now();
  if (!Number.isFinite(parsedCutoff)) throw new Error('--cutoff-at must be a valid ISO timestamp');
  const cutoffMs = Math.min(Date.now(), parsedCutoff);
  const context = {
    mainDb,
    futuresDb,
    tournament,
    cutoffMs,
    maxRows,
    allowedBuilders: allowedBuilderAddresses(decibel, process.env),
  };
  const results = [];
  for (const participant of participants) {
    const result = await auditParticipant(context, participant);
    results.push(result);
    process.stderr.write(`[decibel-audit] ${participant.player_name}: ${result.classification}\n`);
  }
  const summary = {
    participants: results.length,
    matches: results.filter((row) => row.classification === 'matches').length,
    missing_proven_volume: results.filter((row) => row.classification === 'missing_proven_volume').length,
    credited_above_proven_volume: results.filter((row) => row.classification === 'credited_above_proven_volume').length,
    with_unresolved_fills: results.filter((row) => row.upstream.unresolved_fills > 0).length,
    total_proven_volume_usd: roundUsd(results.reduce((sum, row) => sum + row.upstream.proven_volume_usd, 0)),
    total_credited_volume_usd: roundUsd(results.reduce((sum, row) => sum + row.credited.volume_usd, 0)),
    total_known_legacy_duplicate_volume_usd: roundUsd(results.reduce((sum, row) => sum + row.known_legacy_duplicates.volume_usd, 0)),
    total_proven_delta_after_known_dedupe_usd: roundUsd(results.reduce((sum, row) => sum + row.proven_delta_after_known_dedupe_usd, 0)),
  };
  console.log(JSON.stringify({
    audit: 'decibel_tournament_volume',
    mode: 'read_only',
    tournament: {
      id: tournament.id,
      name: tournament.name,
      start_at: tournament.start_at,
      end_at: tournament.end_at,
      cutoff_at: new Date(cutoffMs).toISOString(),
    },
    summary,
    participants: results,
  }, null, 2));
  mainDb.close();
  futuresDb.close();
}

main().catch((error) => {
  console.error(`[decibel-audit] ${error.stack || error.message}`);
  process.exit(1);
});
