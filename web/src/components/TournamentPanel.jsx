// Player-facing tournament view.
//
// Matches the cartoon parchment style of LeaderboardPanel / BattleLogPanel:
// fdf8e7 paper, d4c8b0 stitched border, brown title, red round close button,
// e8dfc8 rows. Three states (no tournament / not joined / joined) share the
// same paper modal so the visual language is consistent across the game.
import { memo, useEffect, useState, useMemo } from 'react';
import { useLuckyRaider, useTournament, useTournamentDailyPoints, useTournamentLeaderboard, useTournamentHistory } from '../hooks/useTournament';
import { useBuildingDefs, usePlayer } from '../hooks/useGodot';
import { useDex } from '../contexts/DexContext';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';
import { uiButton, uiIconButton } from '../styles/theme';

function formatNumber(n, options = {}) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', options).replace(/,/g, ' ');
}

const fmt = (n) => formatNumber(n, { maximumFractionDigits: 0 });
const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TWITTER_HANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;
const DEX_LABELS = {
  pacifica: 'Pacifica',
  avantis: 'Avantis',
  decibel: 'Decibel',
  gmx: 'GMX',
  monad: 'Perpl',
  phoenix: 'Phoenix',
  hyperliquid: 'Hyperliquid',
  risex: 'RISEx',
  nado: 'Nado',
  ondo: 'Ondo Perps',
  hibachi: 'Hibachi',
  hotstuff: 'Hotstuff',
  grvt: 'GRVT',
  katana: 'Katana',
  gmtrade: 'GMTrade',
  flash: 'Flash Trade',
};

function fmtUsd(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return '$' + formatNumber(Math.round(v), { maximumFractionDigits: 0 });
  return '$' + formatNumber(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUsdWhole(n) {
  return '$' + formatNumber(Math.round(Number(n) || 0), { maximumFractionDigits: 0 });
}

function fmtPrize(amount) {
  const v = Number(amount) || 0;
  const rounded = Number(v.toFixed(2));
  if (Math.abs(rounded) >= 1000 || Number.isInteger(rounded)) {
    return '$' + formatNumber(Math.round(rounded), { maximumFractionDigits: 0 });
  }
  return '$' + formatNumber(rounded, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRewardAmount(reward, fallbackCurrency = 'USD') {
  const amount = Number(reward?.amount ?? reward?.pool_amount ?? reward?.quantity ?? 0) || 0;
  const type = String(reward?.type || '').toLowerCase();
  if (type === 'money') {
    const currency = String(reward?.currency || fallbackCurrency || 'USD').toUpperCase();
    if (currency === 'USD') return fmtPrize(amount);
    if (currency === 'CLASH') return `${fmtPrize(amount)} in CLASH`;
    return `${formatNumber(amount, { maximumFractionDigits: 2 })} ${currency}`;
  }
  const unit = reward?.unit || (type === 'amp' ? 'AMP' : type === 'points' ? 'points' : type === 'nft' ? 'NFT' : 'reward');
  const value = Number.isInteger(amount) ? fmt(amount) : formatNumber(amount, { maximumFractionDigits: 2 });
  return `${value} ${unit}`;
}

function rewardLabel(reward, fallbackCurrency = 'USD') {
  const type = String(reward?.type || '').toLowerCase();
  const label = String(reward?.label || reward?.type || 'Reward').trim();
  const normalizedLabel = label.toLowerCase();
  if ((type === 'money' && (normalizedLabel === 'cash' || normalizedLabel === 'money'))
    || (type === 'amp' && normalizedLabel === 'amp')) {
    return fmtRewardAmount(reward, fallbackCurrency);
  }
  return `${label}: ${fmtRewardAmount(reward, fallbackCurrency)}`;
}

function rewardPoolSummary(rewards, fallbackCurrency = 'USD') {
  const arr = Array.isArray(rewards) ? rewards : [];
  return arr.filter((reward) => Number(reward?.pool_amount ?? reward?.quantity ?? 0) > 0)
    .map((reward) => rewardLabel(reward, fallbackCurrency));
}

function rankRewardSummary(rewards, fallbackCurrency = 'USD') {
  const arr = Array.isArray(rewards) ? rewards : [];
  return arr.filter((reward) => Number(reward?.amount || 0) > 0)
    .map((reward) => rewardLabel(reward, fallbackCurrency));
}

function fmtTeamMetric(metric, value) {
  if (metric === 'volume_usd' || metric === 'pnl_usd') return fmtUsd(value);
  if (metric === 'points') return `${fmtPoints(value)} pts`;
  return fmt(value);
}

function fmtPoints(n) {
  const v = Number(n) || 0;
  return formatNumber(Math.round(v), { maximumFractionDigits: 0 });
}

function fmtDate(s) {
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDay(s) {
  if (!s) return '';
  const d = new Date(`${s}T00:00:00Z`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function fmtUtcDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

function dailyRoundNumber(dayRow) {
  const idx = Number(
    dayRow?.round_number
    ?? (
      Number(
        dayRow?.estimate?.pool_state?.day_index
        ?? dayRow?.run?.details?.pool_state?.day_index
      ) + 1
    )
  );
  return Number.isFinite(idx) && idx > 0 ? idx : null;
}

function dailyRoundLabel(dayRow) {
  const n = dailyRoundNumber(dayRow);
  return n ? `Day ${n}` : fmtDay(dayRow?.day_utc);
}

function dailyWindowLabel(dayRow) {
  const start = fmtUtcDateTime(dayRow?.window?.starts_at);
  const end = fmtUtcDateTime(dayRow?.window?.ends_at || dayRow?.window?.closes_at);
  if (!start || !end) return '';
  return `${start} -> ${end} UTC`;
}

function compactPlayerName(row) {
  const name = String(row?.name || '').trim();
  if (name) return name;
  const wallet = String(row?.wallet || '').trim();
  if (wallet) return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  return String(row?.player_id || '').slice(0, 8) || 'Player';
}

function shortWallet(wallet) {
  const text = String(wallet || '').trim();
  if (!text) return '';
  if (text.length <= 14) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function playerTownHallLevel(player, buildingDefs) {
  return Number(
    buildingDefs?.th_level
    || player?.town_hall_level
    || player?.buildings?.town_hall?.level
    || 0,
  ) || 0;
}

function TownHallRequirementBlock({ required, current, blocked = false, compact = false }) {
  const req = Math.max(0, Math.floor(Number(required || 0) || 0));
  if (req <= 0) return null;
  const cur = Math.max(0, Math.floor(Number(current || 0) || 0));
  const known = cur > 0;
  const ok = known ? cur >= req : !blocked;
  const style = {
    ...S.townHallReq,
    ...(ok ? S.townHallReqOk : S.townHallReqBlocked),
    ...(compact ? S.townHallReqCompact : null),
  };
  return (
    <div style={style}>
      <div style={S.townHallReqTop}>
        <span style={S.townHallReqTitle}>Town Hall requirement</span>
        <span style={ok ? S.townHallReqBadgeOk : S.townHallReqBadgeBlocked}>{ok ? 'OK' : 'LOCKED'}</span>
      </div>
      <div style={S.townHallReqText}>Requires Town Hall level {fmt(req)}+</div>
      {known && <div style={S.townHallReqSub}>Your level: {fmt(cur)}</div>}
    </div>
  );
}

function isPointsSort(sortBy) {
  return sortBy === 'points' || sortBy === 'volume_trophies_50_50';
}

function isDailyPoolTournament(t) {
  return String(t?.scoring_mode || 'live') === 'daily_pool';
}

function dailyPoolAwardTime(t) {
  const value = String(t?.daily_pool_award_time_utc || '00:00').trim();
  return /^\d{2}:\d{2}$/.test(value) ? value : '00:00';
}

function pointWeights(t) {
  if (t?.sort_by === 'volume_trophies_50_50') return { trophies: 50, volume: 50, pnl: 0 };
  const w = t?.points_weights || {};
  return {
    trophies: Number(w.trophies ?? t?.points_trophy_weight ?? 20) || 0,
    volume: Number(w.volume ?? t?.points_volume_weight ?? 60) || 0,
    pnl: Number(w.pnl ?? t?.points_pnl_weight ?? 20) || 0,
  };
}

function fmtWeight(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}

function sortLabel(tOrSort) {
  const sortBy = typeof tOrSort === 'string' ? tOrSort : tOrSort?.sort_by;
  if (typeof tOrSort === 'object' && tOrSort?.sort_label) return tOrSort.sort_label;
  if (typeof tOrSort === 'object' && isDailyPoolTournament(tOrSort)) {
    const w = pointWeights(tOrSort);
    const parts = [];
    if (Number(w.trophies) > 0) parts.push(`${fmtWeight(w.trophies)}% Trophy`);
    if (Number(w.volume) > 0) parts.push(`${fmtWeight(w.volume)}% Volume`);
    if (Number(w.pnl) > 0) parts.push(`${fmtWeight(w.pnl)}% PnL`);
    return parts.length ? `Daily pool: ${parts.join(' / ')}` : 'Daily pool';
  }
  if (sortBy === 'trophies') return 'Trophies';
  if (sortBy === 'volume_usd') return 'Volume';
  if (sortBy === 'gold') return 'Gold';
  if (isPointsSort(sortBy)) {
    const w = pointWeights(typeof tOrSort === 'string' ? { sort_by: sortBy } : tOrSort);
    const parts = [];
    if (Number(w.trophies) > 0) parts.push(`${fmtWeight(w.trophies)}% Trophy`);
    if (Number(w.volume) > 0) parts.push(`${fmtWeight(w.volume)}% Volume`);
    if (Number(w.pnl) > 0) parts.push(`${fmtWeight(w.pnl)}% PnL`);
    return parts.length ? parts.join(' / ') : 'Custom points';
  }
  return 'PnL';
}

function dexLabel(t, fallbackDex) {
  if (t?.dex_label) return t.dex_label;
  if (t?.dex_scope === 'all') return 'All DEXes';
  const list = Array.isArray(t?.eligible_dexes) ? t.eligible_dexes : [];
  if (list.length > 1) return list.map(d => DEX_LABELS[d] || String(d).toUpperCase()).join(', ');
  const dex = list[0] || t?.dex || fallbackDex || '';
  return DEX_LABELS[dex] || String(dex).toUpperCase();
}

function featuredMetric(sortKey, row) {
  if (!row) return { value: '-', color: 'var(--terminal-text-muted)' };
  if (sortKey === 'trophies') return { value: fmt(row.trophies), color: 'var(--terminal-warning)' };
  if (sortKey === 'gold') return { value: fmt(row.gold), color: 'var(--terminal-warning)' };
  if (sortKey === 'volume_usd') return { value: fmtUsd(row.volume_usd), color: 'var(--terminal-warning)' };
  if (isPointsSort(sortKey)) {
    return { value: `${fmtPoints(row.score)} pts`, color: 'var(--terminal-warning)' };
  }
  return {
    value: fmtUsd(row.pnl_usd),
    color: (row.pnl_usd || 0) >= 0 ? 'var(--terminal-long)' : 'var(--terminal-short-strong)',
  };
}

function leaderboardUsesPnl(t, sortKey) {
  if (sortKey === 'pnl_usd') return true;
  if (isDailyPoolTournament(t)) return Number(pointWeights(t).pnl) > 0;
  if (isPointsSort(sortKey)) return Number(pointWeights(t).pnl) > 0;
  return false;
}

function isMegaTournament(t) {
  return !!(t?.is_mega || t?.tournament_kind === 'mega' || t?.mega_config?.enabled);
}

function shouldShowLeaderboardDexBadge(t) {
  if (isMegaTournament(t)) return true;
  if (t?.mode === 'dex_vs_dex') return true;
  if (t?.dex_scope === 'all' || t?.dex_scope === 'custom') return true;
  const eligible = Array.isArray(t?.eligible_dexes) ? t.eligible_dexes.filter(Boolean) : [];
  return eligible.length > 1;
}

function normalizedDex(value) {
  return String(value || '').trim().toLowerCase();
}

function tournamentEligibleDexSet(t) {
  const list = Array.isArray(t?.eligible_dexes)
    ? t.eligible_dexes.map(normalizedDex).filter(Boolean)
    : [];
  if (list.length > 0) return new Set(list);
  const fallback = normalizedDex(t?.dex);
  return fallback ? new Set([fallback]) : new Set();
}

function leaderboardDexBadgeLabel(t, row) {
  if (!shouldShowLeaderboardDexBadge(t)) return null;
  const eligible = tournamentEligibleDexSet(t);
  const accepts = (dex) => {
    const normalized = normalizedDex(dex);
    return normalized && (!eligible.size || eligible.has(normalized));
  };

  const breakdown = Array.isArray(row?.dex_breakdown) ? row.dex_breakdown : [];
  const activeDex = [...breakdown]
    .filter(item => accepts(item?.dex))
    .sort((a, b) =>
      (Number(b?.volume_usd || 0) || 0) - (Number(a?.volume_usd || 0) || 0)
      || (Number(b?.trades_count || 0) || 0) - (Number(a?.trades_count || 0) || 0)
      || normalizedDex(a?.dex).localeCompare(normalizedDex(b?.dex))
    )[0];
  if (activeDex?.dex) return activeDex.label || DEX_LABELS[normalizedDex(activeDex.dex)] || String(activeDex.dex).toUpperCase();

  if (accepts(row?.top_dex)) {
    const dex = normalizedDex(row.top_dex);
    return DEX_LABELS[dex] || row.top_dex_label || String(row.top_dex).toUpperCase();
  }

  if (accepts(row?.team_dex)) {
    const dex = normalizedDex(row.team_dex);
    return DEX_LABELS[dex] || row.team_label || String(row.team_dex).toUpperCase();
  }

  return null;
}

function sectorRequirementText(sector) {
  const parts = [];
  if (Number(sector?.min_town_hall_level || 0) > 0) parts.push(`TH ${sector.min_town_hall_level}`);
  if (Number(sector?.min_volume_usd || 0) > 0) parts.push(`${fmtUsdWhole(sector.min_volume_usd)} vol`);
  if (Number(sector?.min_daily_volume_usd || 0) > 0) parts.push(`${fmtUsdWhole(sector.min_daily_volume_usd)} daily`);
  if (Number(sector?.min_trades || 0) > 0) parts.push(`${fmt(sector.min_trades)} trades`);
  return parts.join(' · ') || 'Open';
}

function dexBreakdownSummary(row) {
  const list = Array.isArray(row?.dex_breakdown) ? row.dex_breakdown : [];
  return list.slice(0, 3).map((item) => `${item.label || DEX_LABELS[item.dex] || item.dex}: ${fmtUsdWhole(item.volume_usd)}`).join(' · ');
}

function rewardScheduleHasContent(schedule) {
  return !!(
    (schedule?.daily_pools || []).length
    || (schedule?.final_pools || []).length
    || schedule?.lucky_daily_raider?.enabled
  );
}

function rewardPoolLine(pool, fallbackCurrency = 'USD') {
  const rewards = rewardPoolSummary(pool?.rewards || [], fallbackCurrency);
  const label = pool?.label || 'Reward pool';
  const top = Number(pool?.top_n || 0) > 0 ? `top ${pool.top_n}` : '';
  const day = pool?.day_utc ? `UTC ${pool.day_utc}` : '';
  const target = Number(pool?.volume_target_usd || 0) > 0
    ? `${fmtUsdWhole(pool.volume_target_usd)} ${pool.volume_target_scope === 'tournament' ? 'tournament' : 'per player'} target`
    : '';
  return [label, day, target, top, rewards.join(' + ')].filter(Boolean).join(' | ');
}

function RewardScheduleCard({ schedule, sectorName, currency = 'USD', currentTownHallLevel = 0 }) {
  if (!rewardScheduleHasContent(schedule)) return null;
  const lucky = schedule?.lucky_daily_raider || {};
  const required = (lucky.required_collections || [])
    .map((item) => item === 'demon_king' ? 'Demon King' : item === 'dragon' ? 'Dragon' : item)
    .join(' or ');
  const luckyRewards = rewardPoolSummary(lucky.rewards || [], currency);
  const ticketMetric = String(lucky.ticket_metric || 'volume');
  const attackWinsPerTicket = fmt(lucky.attack_wins_per_ticket || 10);
  const volumePerTicket = fmtUsdWhole(lucky.volume_per_ticket_usd);
  const volumeTicketsPerStep = Math.max(1, Math.floor(Number(lucky.volume_tickets_per_step || 1) || 1));
  const maxVolumeTickets = Math.max(0, Math.floor(Number(lucky.max_volume_tickets || 0) || 0));
  const volumeBonusText = `${volumePerTicket} volume = +${fmt(volumeTicketsPerStep)}${maxVolumeTickets > 0 ? `, max +${fmt(maxVolumeTickets)}` : ''}`;
  const luckyTicketRule = ticketMetric === 'attack_wins'
    ? `${attackWinsPerTicket} winning attacks = 1 ticket`
    : ticketMetric === 'attack_wins_plus_volume'
      ? `${attackWinsPerTicket} winning attacks = 1 ticket + ${volumeBonusText}`
    : ticketMetric === 'volume_or_attack_wins'
      ? `${volumePerTicket} volume OR ${attackWinsPerTicket} winning attacks = 1 ticket`
      : ticketMetric === 'volume_and_attack_wins'
        ? `${volumePerTicket} volume AND ${attackWinsPerTicket} winning attacks = 1 ticket`
        : `${volumePerTicket} volume = 1 ticket`;
  return (
    <div style={S.rewardScheduleCard}>
      <div style={S.rewardScheduleHeader}>
        <strong>Rewards</strong>
        {sectorName && <span>{sectorName}</span>}
      </div>
      {(schedule.daily_pools || []).filter((pool) => (
        pool.enabled !== false && (!pool.day_utc || pool.is_active !== false)
      )).map((pool, idx) => (
        <div key={`daily-${idx}`} style={S.rewardScheduleLine}>Daily: {rewardPoolLine(pool, currency)}</div>
      ))}
      {(schedule.final_pools || []).filter((pool) => pool.enabled !== false).map((pool, idx) => (
        <div key={`final-${idx}`} style={S.rewardScheduleLine}>Final: {rewardPoolLine(pool, currency)}</div>
      ))}
      {lucky.enabled && (
        <div style={S.rewardScheduleLucky}>
          <div><strong>{lucky.label || 'Lucky Daily Raider'}</strong>: {luckyTicketRule}, top {fmt(lucky.winner_count || 1)}, max {fmt(lucky.max_tickets)} tickets</div>
          <TownHallRequirementBlock
            required={lucky.min_town_hall_level}
            current={lucky.town_hall_level || lucky.my_town_hall_level || currentTownHallLevel}
            blocked={String(lucky.my_reason || '') === 'town_hall_requirement_not_met'}
            compact
          />
          {Number(lucky.min_attack_wins || 0) > 0 && <div>Minimum today: {fmt(lucky.min_attack_wins)} winning attacks</div>}
          {lucky.require_nft && <div>Requires {required || 'Dragon or Demon King'}</div>}
          {lucky.my_tickets !== undefined && (
            <div>
              Today: {fmtUsdWhole(lucky.my_volume_usd || 0)} volume | {luckyAttackSummary(lucky)} | {luckyTicketBreakdown(lucky)}/{fmt(lucky.max_tickets || 0)} tickets
              {luckyReasonText(lucky.my_reason) ? ` | ${luckyReasonText(lucky.my_reason)}` : ''}
            </div>
          )}
          {luckyRewards.length > 0 && <div>Prize: {luckyRewards.join(' + ')}</div>}
          {Array.isArray(lucky.last_winners) && lucky.last_winners.length > 0 ? (
            <div>Last winners: {lucky.last_winners.slice(0, 5).map((winner) => `#${winner.place || '?'} ${winner.name || winner.player_id || 'Player'}`).join(' | ')}</div>
          ) : lucky.last_winner?.name && <div>Last winner: {lucky.last_winner.name}</div>}
        </div>
      )}
    </div>
  );
}

function luckyAttackStats(source = {}, lucky = source) {
  const limit = Math.max(1, Math.floor(Number(source.max_counted_attacks ?? lucky?.max_counted_attacks ?? lucky?.max_tickets ?? 50) || 50));
  const wins = Math.max(0, Math.floor(Number(source.attack_wins ?? source.my_attack_wins ?? 0) || 0));
  const attemptsRaw = Number(source.attack_attempts ?? source.my_attack_attempts);
  const attempts = Math.max(0, Math.floor(Number.isFinite(attemptsRaw) ? attemptsRaw : Math.min(limit, wins)));
  const losses = Math.max(0, attempts - wins);
  const surrenders = Math.max(0, Math.floor(Number(source.attack_surrenders ?? source.my_attack_surrenders ?? 0) || 0));
  const rawAttempts = Math.max(0, Math.floor(Number(source.raw_attack_attempts ?? source.my_raw_attack_attempts ?? attempts) || 0));
  const rawWins = Math.max(0, Math.floor(Number(source.raw_attack_wins ?? source.my_raw_attack_wins ?? wins) || 0));
  const rawLosses = Math.max(0, rawAttempts - rawWins);
  return { limit, wins, attempts, losses, surrenders, rawAttempts, rawWins, rawLosses };
}

function luckyAttackSummary(source = {}, lucky = source) {
  const s = luckyAttackStats(source, lucky);
  return `${fmt(s.wins)} wins / ${fmt(s.losses)} losses from ${fmt(s.attempts)}/${fmt(s.limit)} attacks`;
}

function luckyTicketStats(source = {}, lucky = source) {
  const attack = Math.max(0, Math.floor(Number(source.attack_win_tickets ?? source.my_attack_win_tickets ?? 0) || 0));
  const volume = Math.max(0, Math.floor(Number(source.volume_tickets ?? source.my_volume_tickets ?? 0) || 0));
  const total = Math.max(0, Math.floor(Number(source.tickets ?? source.my_tickets ?? (attack + volume)) || 0));
  const maxVolume = Math.max(0, Math.floor(Number(source.max_volume_tickets ?? lucky?.max_volume_tickets ?? 0) || 0));
  const volumePerTicket = Math.max(1, Number(source.volume_per_ticket_usd ?? lucky?.volume_per_ticket_usd ?? 1000) || 1000);
  const volumeTicketsPerStep = Math.max(1, Math.floor(Number(source.volume_tickets_per_step ?? lucky?.volume_tickets_per_step ?? 1) || 1));
  return { attack, volume, total, maxVolume, volumePerTicket, volumeTicketsPerStep };
}

function luckyVolumeBonusText(lucky) {
  const s = luckyTicketStats(lucky);
  return `${fmtUsdWhole(s.volumePerTicket)} volume = +${fmt(s.volumeTicketsPerStep)} bonus ticket${s.volumeTicketsPerStep === 1 ? '' : 's'}${s.maxVolume > 0 ? `, max +${fmt(s.maxVolume)}` : ''}`;
}

function luckyTicketBreakdown(source = {}, lucky = source) {
  const metric = String(lucky?.ticket_metric || source.ticket_metric || '').toLowerCase();
  const s = luckyTicketStats(source, lucky);
  if (metric === 'attack_wins_plus_volume') return `${fmt(s.attack)} attack + ${fmt(s.volume)} volume = ${fmt(s.total)}`;
  return fmt(s.total);
}

function luckyEntryDetail(entry, lucky) {
  const s = luckyAttackStats(entry, lucky);
  const parts = [
    `${fmt(s.wins)}W`,
    `${fmt(s.losses)}L`,
    `${fmt(s.attempts)}/${fmt(s.limit)} attacks`,
  ];
  if (s.surrenders > 0) parts.push(`${fmt(s.surrenders)} surrender`);
  return parts.join(' | ');
}

function luckyWinTicketText(lucky) {
  const winsPerTicket = Math.max(1, Math.floor(Number(lucky?.attack_wins_per_ticket || 1) || 1));
  return winsPerTicket === 1 ? '1 win = 1 ticket' : `${fmt(winsPerTicket)} wins = 1 ticket`;
}

function luckyReasonText(reason) {
  const key = String(reason || '').trim();
  if (!key || key === 'eligible') return '';
  if (key === 'attack_wins_below_ticket') return 'No ticket yet: counted wins are below the ticket requirement';
  if (key === 'volume_below_ticket') return 'No ticket yet: counted volume is below the ticket requirement';
  if (key === 'attack_wins_plus_volume_below_ticket') return 'No ticket yet: counted wins and volume are below ticket requirements';
  if (key === 'volume_or_attack_wins_below_ticket') return 'No ticket yet: counted wins or volume are below ticket requirements';
  if (key === 'volume_and_attack_wins_below_ticket') return 'No ticket yet: counted wins and volume are below ticket requirements';
  if (key === 'nft_required') return 'NFT requirement not met';
  if (key === 'missing_required_nft') return 'NFT requirement not met';
  if (key === 'town_hall_requirement_not_met') return 'Town Hall requirement not met';
  if (key === 'min_attack_wins_not_met') return 'Minimum counted wins not met';
  return key.replace(/_/g, ' ');
}

function LuckyRaiderPanel({ t, schedule, currentTownHallLevel = 0 }) {
  const lucky = schedule?.lucky_daily_raider || {};
  if (!lucky.enabled) {
    return (
      <div style={S.empty}>
        <div style={S.emptyTitle}>No Daily Lucky Raider</div>
        <div style={S.emptySub}>This tournament does not have a lucky daily raid draw configured.</div>
      </div>
    );
  }
  const rewards = rewardPoolSummary(lucky.rewards || [], t?.prize_currency || 'USD');
  const metric = String(lucky.ticket_metric || 'volume');
  const winTicketText = luckyWinTicketText(lucky);
  const volumeBonusText = luckyVolumeBonusText(lucky);
  const rule = metric === 'attack_wins'
    ? winTicketText
    : metric === 'attack_wins_plus_volume'
      ? `${winTicketText} + ${volumeBonusText}`
    : metric === 'volume_or_attack_wins'
      ? `${fmtUsdWhole(lucky.volume_per_ticket_usd)} volume OR ${winTicketText}`
      : metric === 'volume_and_attack_wins'
        ? `${fmtUsdWhole(lucky.volume_per_ticket_usd)} volume AND ${winTicketText}`
        : `${fmtUsdWhole(lucky.volume_per_ticket_usd)} volume = 1 ticket`;
  const entries = Array.isArray(lucky.today_entries) ? lucky.today_entries : [];
  const history = Array.isArray(lucky.history) ? lucky.history : [];
  const myStats = luckyAttackStats(lucky);
  const myTickets = luckyTicketStats(lucky);
  const myRawOverflow = myStats.rawAttempts > myStats.attempts;
  const myReason = luckyReasonText(lucky.my_reason);
  const luckyTownHallLevel = Number(lucky.town_hall_level || lucky.my_town_hall_level || currentTownHallLevel || 0) || 0;
  const blockedByTownHall = String(lucky.my_reason || '') === 'town_hall_requirement_not_met';
  return (
    <>
      <div style={S.luckyHero}>
        <div>
          <div style={S.luckyKicker}>Daily Lucky Raider</div>
          <div style={S.luckyTitle}>{lucky.label || 'Daily Lucky Raider'}</div>
          <div style={S.luckySub}>Only your first {fmt(myStats.limit)} attacks each UTC day count. Wins become tickets; losses and surrenders spend an attack and give 0 tickets. Volume can add bonus tickets.</div>
        </div>
        <div style={S.luckyPrize}>{rewards.join(' + ') || 'Prize configured by admin'}</div>
      </div>

      <div className="tournament-modal__lucky-grid" style={S.luckyGrid}>
        <Stat label="Your tickets" value={`${fmt(lucky.my_tickets || 0)} / ${fmt(lucky.max_tickets || 0)}`} />
        <Stat label="Attack tickets" value={fmt(myTickets.attack)} />
        <Stat label="Volume tickets" value={`${fmt(myTickets.volume)}${myTickets.maxVolume > 0 ? ` / ${fmt(myTickets.maxVolume)}` : ''}`} />
        <Stat label="Won / Lost" value={`${fmt(myStats.wins)} / ${fmt(myStats.losses)}`} />
        <Stat label="Counted attacks" value={`${fmt(myStats.attempts)} / ${fmt(myStats.limit)}`} />
        <Stat label="Winners" value={fmt(lucky.winner_count || 1)} />
      </div>

      <div style={S.luckyRuleBox}>
        <strong>{rule}</strong>
        <span>First {fmt(myStats.limit)} attacks per UTC day count for attack tickets. Total cap is {fmt(lucky.max_tickets || myStats.limit)} tickets/day.</span>
        <span>A win gives a ticket; a defeat or surrender spends one of those first {fmt(myStats.limit)} attacks and gives 0 tickets.</span>
        {metric === 'attack_wins_plus_volume' && (
          <span>
            Volume bonus: {volumeBonusText}
            {myTickets.maxVolume > 0 ? `. ${fmtUsdWhole(Math.ceil(myTickets.maxVolume / myTickets.volumeTicketsPerStep) * myTickets.volumePerTicket)} volume reaches the +${fmt(myTickets.maxVolume)} cap.` : '.'}
          </span>
        )}
        <span>Your counted score: {fmt(myStats.wins)} wins, {fmt(myStats.losses)} losses, {luckyTicketBreakdown(lucky)} tickets.</span>
        {myStats.surrenders > 0 && <span>Your losses include {fmt(myStats.surrenders)} surrender{myStats.surrenders === 1 ? '' : 's'}.</span>}
        {myRawOverflow && <span>Total today: {fmt(myStats.rawAttempts)} attacks / {fmt(myStats.rawWins)} wins. Extra attacks after #{fmt(myStats.limit)} do not add tickets.</span>}
        <span>Draw runs at {lucky.draw_time_utc || '00:05'} UTC.</span>
        <TownHallRequirementBlock required={lucky.min_town_hall_level} current={luckyTownHallLevel} blocked={blockedByTownHall} />
        {lucky.require_nft && <span>Requires Dragon or Demon King NFT.</span>}
        {myReason && <span>Status: {myReason}</span>}
      </div>

      <div style={S.luckySectionTitle}>Today entries</div>
      <div style={S.luckyList}>
        {!entries.length && <div style={S.emptySmall}>No tickets yet today.</div>}
        {entries.map((entry, idx) => (
          <div key={entry.player_id || idx} style={S.luckyEntry}>
            <div style={S.luckyRank}>{idx + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.luckyEntryName}>{entry.name || shortWallet(entry.wallet) || 'Player'}</div>
              <div style={S.luckyEntryMeta}>
                {luckyEntryDetail(entry, lucky)}
                {luckyReasonText(entry.reason) ? ` | ${luckyReasonText(entry.reason)}` : ''}
              </div>
              {Number(entry.raw_attack_attempts || 0) > Number(entry.attack_attempts || 0) && (
                <div style={S.luckyEntrySubMeta}>
                  Total today: {fmt(entry.raw_attack_attempts || 0)} attacks / {fmt(entry.raw_attack_wins || 0)} wins
                </div>
              )}
              {metric === 'attack_wins_plus_volume' && (
                <div style={S.luckyEntrySubMeta}>
                  Tickets: {luckyTicketBreakdown(entry, lucky)}
                </div>
              )}
            </div>
            <div style={S.luckyTickets}>{fmt(entry.tickets || 0)} tickets</div>
          </div>
        ))}
      </div>

      <div style={S.luckySectionTitle}>Draw history</div>
      <div style={S.luckyList}>
        {!history.length && <div style={S.emptySmall}>No completed draws yet.</div>}
        {history.map((run) => (
          <div key={run.day_utc} style={S.luckyHistoryRow}>
            <div style={S.luckyHistoryDay}>{fmtDay(run.day_utc)}</div>
            <div style={S.luckyHistoryMeta}>
              {run.status} | {fmt(run.eligible_players || 0)} players | {fmt(run.total_tickets || 0)} tickets
              {Array.isArray(run.winners) && run.winners.length > 0 && (
                <div style={S.luckyHistoryWinners}>
                  {run.winners.map((winner) => `#${winner.place || '?'} ${winner.name || 'Player'} (${fmt(winner.tickets || 0)})`).join(' | ')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RankedRaidSummary({ state, tournament, joined }) {
  const attackLimit = Number(state?.daily_attack_limit || tournament?.ranked_daily_attack_limit || 0);
  const defenseLimit = Number(state?.max_defenses_per_day || tournament?.ranked_max_defenses_per_day || 0);
  const attacksUsed = Number(state?.attacks_used || 0);
  const defensesUsed = Number(state?.defenses_used || 0);
  const shieldUntil = state?.shield_until ? fmtDate(state.shield_until) : null;

  return (
    <div style={S.rankedSummary}>
      <div style={S.rankedSummaryHead}>
        <div>
          <div style={S.rankedSummaryTitle}>Ranked raids</div>
          <div style={S.rankedSummarySub}>
            Trading and island raids contribute to this same tournament.
          </div>
        </div>
        <span style={joined ? S.rankedSummaryLive : S.rankedSummaryLocked}>
          {joined ? 'ACTIVE' : 'JOIN TO PLAY'}
        </span>
      </div>

      {joined ? (
        <>
          <div className="tournament-modal__ranked-summary-grid" style={S.rankedSummaryGrid}>
            <div style={S.rankedSummaryStat}>
              <span style={S.rankedSummaryValue}>{fmt(state?.score || 0)}</span>
              <span style={S.rankedSummaryLabel}>Raid trophies</span>
            </div>
            <div style={S.rankedSummaryStat}>
              <span style={S.rankedSummaryValue}>{attacksUsed}/{attackLimit || '-'}</span>
              <span style={S.rankedSummaryLabel}>Attacks today</span>
            </div>
            <div style={S.rankedSummaryStat}>
              <span style={S.rankedSummaryValue}>{defensesUsed}/{defenseLimit || '∞'}</span>
              <span style={S.rankedSummaryLabel}>Defenses today</span>
            </div>
            <div style={S.rankedSummaryStat}>
              <span style={S.rankedSummaryValue}>{Number(state?.wins || 0)}W / {Number(state?.losses || 0)}L</span>
              <span style={S.rankedSummaryLabel}>Raid record</span>
            </div>
          </div>
          <div style={S.rankedSummaryMeta}>
            <span>Attack {Number(state?.offense_trophies || 0) >= 0 ? '+' : ''}{fmt(state?.offense_trophies || 0)}</span>
            <span>Defense {Number(state?.defense_trophies || 0) >= 0 ? '+' : ''}{fmt(state?.defense_trophies || 0)}</span>
            <span>{shieldUntil ? `Shield until ${shieldUntil}` : 'No tournament shield'}</span>
          </div>
        </>
      ) : (
        <div style={S.rankedSummaryJoin}>
          Join once to unlock both trading standings and the tournament raid quota.
        </div>
      )}
    </div>
  );
}

function TournamentPanel({ onClose }) {
  // Tab gate: 'active' (default) or 'history'. History shows ended
  // tournaments + their final leaderboards so a finished cup doesn't just
  // disappear from the player's view.
  const [tab, setTab] = useState('active');
  const [pickedHistoryId, setPickedHistoryId] = useState(null);
  const [pickedDailyDay, setPickedDailyDay] = useState(null);
  const [dailyOpen, setDailyOpen] = useState(false);

  const {
    me,
    loading: tournamentLoading,
    loaded: tournamentLoaded,
    error: tournamentError,
    join,
    leave,
    updateRewardWallet,
  } = useTournament({ active: tab === 'active' });
  const {
    me: luckyMe,
    loaded: luckyLoaded,
    error: luckyError,
    updateRewardWallet: updateLuckyRewardWallet,
  } = useLuckyRaider({ active: tab === 'lucky' });
  const { items: history } = useTournamentHistory({ active: tab === 'history' });
  const player = usePlayer();
  const { buildingDefs } = useBuildingDefs();
  const { dex } = useDex();
  const [busy, setBusy] = useState(false);
  const [rewardWalletEvm, setRewardWalletEvm] = useState('');
  const [rewardTwitterHandle, setRewardTwitterHandle] = useState('');
  const [rewardWalletEditing, setRewardWalletEditing] = useState(false);

  // When the History tab is active and the user clicks a row, swap the
  // leaderboard pointer to that ended tournament. Otherwise the active
  // (live) tournament leaderboard.
  const liveTournament = me?.tournament || null;
  const historyTournament = useMemo(
    () => (history || []).find(t => t.id === pickedHistoryId) || null,
    [history, pickedHistoryId]
  );
  const luckyTournament = luckyMe?.tournament || null;
  const t = tab === 'history' ? historyTournament : (tab === 'lucky' ? luckyTournament : liveTournament);
  const isHistory = tab === 'history' && !!historyTournament;

  const joined = tab === 'lucky' ? !!luckyMe?.joined : !!me?.joined;
  const myStats = isHistory ? (historyTournament?.me || null) : (tab === 'lucky' ? (luckyMe?.me || null) : (me?.me || null));
  const needsCopRewardWallet = !!t?.rewards_in_cop;
  const requiresTwitterHandle = !!t?.registration_require_twitter;
  const showJoinContactFields = needsCopRewardWallet || requiresTwitterHandle;
  const storedRewardWallet = String(myStats?.reward_wallet_evm || '').trim();
  const storedTwitterHandle = String(myStats?.twitter_handle || '').trim();
  const hasRewardWallet = needsCopRewardWallet
    ? SOLANA_WALLET_RE.test(storedRewardWallet)
    : !!storedRewardWallet;
  const canManageRewardWallet = !isHistory && !!t && needsCopRewardWallet && (joined || tab === 'lucky');
  const canSaveLuckyRewardWallet = tab === 'lucky' && canManageRewardWallet && (!hasRewardWallet || rewardWalletEditing);
  const phase = t?.phase || me?.phase || null;
  const preregistration = !isHistory && phase === 'preregistration';
  const live = !isHistory && phase === 'live';
  const paused = !isHistory && phase === 'paused';
  const canJoin = !isHistory && !!me?.can_join;
  const joinBlockedByTownHall = !isHistory && me?.can_join_reason === 'town_hall_requirement_not_met';
  const joinTownHallRequirement = me?.town_hall_requirement || null;
  const currentTownHallLevel = Number(joinTownHallRequirement?.current || playerTownHallLevel(player, buildingDefs) || 0) || 0;
  const { board } = useTournamentLeaderboard(t?.id, { active: !!t && tab !== 'lucky', pollMs: isHistory ? 60000 : 10000 });
  const dailyActive = !!t && isDailyPoolTournament(t);
  const { daily } = useTournamentDailyPoints(t?.id, {
    active: dailyActive,
    pollMs: isHistory ? 60000 : 20000,
    limit: 7,
  });
  const dailyDays = daily?.days || [];
  const activeDailyDayId = daily?.server_round_day_utc || dailyDays[0]?.day_utc || null;
  const selectedDailyDay = useMemo(() => {
    if (!dailyDays.length) return null;
    return dailyDays.find(day => day.day_utc === pickedDailyDay)
      || dailyDays.find(day => day.day_utc === activeDailyDayId)
      || dailyDays[0];
  }, [dailyDays, pickedDailyDay, activeDailyDayId]);
  const playerId = player?.player_id || player?.id;
  const dailyMyPlayerId = daily?.my_player_id || playerId;
  const rankedRaid = !isHistory && tab === 'active' ? me?.ranked_raid : null;
  const activeInitialLoading = tab === 'active' && !tournamentLoaded && !me;
  const luckyInitialLoading = tab === 'lucky' && !luckyLoaded && !luckyMe;
  const prizeProgress = useMemo(() => {
    if (!t) return null;
    const prizeState = board?.prize || {};
    const nextTier = prizeState.next_tier || t.prize_next_tier;
    const nextVolume = Number(nextTier?.volume_usd || 0);
    if (!nextTier || nextVolume <= 0) return null;

    const activeTier = prizeState.active_tier || t.prize_active_tier || null;
    const currentVolume = Number(prizeState.total_volume_usd ?? t.prize_total_volume_usd ?? 0) || 0;
    const baseVolume = Math.min(Number(activeTier?.volume_usd || 0) || 0, nextVolume);
    const span = Math.max(1, nextVolume - baseVolume);
    const progress = Math.max(0, Math.min(1, (currentVolume - baseVolume) / span));

    return {
      currentVolume,
      nextVolume,
      remainingVolume: Math.max(0, nextVolume - currentVolume),
      nextPoolUsd: Number(nextTier.pool_usd || 0) || 0,
      nextRewards: rewardPoolSummary(nextTier.rewards || [], t.prize_currency || 'USD'),
      pct: Math.round(progress * 100),
    };
  }, [board?.prize, t]);
  const activePrizeRewards = rewardPoolSummary(t?.prize_rewards || [], t?.prize_currency || 'USD');
  const nextPrizeRewards = rewardPoolSummary(t?.prize_next_tier?.rewards || [], t?.prize_currency || 'USD');
  const myBoardRow = useMemo(() => {
    if (!board || !playerId) return null;
    return (board.leaderboard || []).find(r => r.player_id === playerId) || null;
  }, [board, playerId]);
  const megaSectors = useMemo(() => (
    isMegaTournament(t) && Array.isArray(board?.mega?.sectors) ? board.mega.sectors : []
  ), [board?.mega?.sectors, t]);
  const activeRewardSchedule = useMemo(() => {
    if (!t) return null;
    if (isMegaTournament(t) && myBoardRow?.mega_sector_id) {
      const sector = megaSectors.find((item) => item.id === myBoardRow.mega_sector_id);
      if (sector?.reward_config && rewardScheduleHasContent(sector.reward_config)) {
        return { schedule: sector.reward_config, sectorName: sector.name };
      }
    }
    return { schedule: board?.reward_schedule || t.reward_schedule || t.reward_config || null, sectorName: null };
  }, [board?.reward_schedule, megaSectors, myBoardRow?.mega_sector_id, t]);
  useEffect(() => {
    const stored = String(myStats?.reward_wallet_evm || '').trim();
    if (!stored) {
      setRewardWalletEvm('');
      return;
    }
    if (needsCopRewardWallet && !SOLANA_WALLET_RE.test(stored)) {
      setRewardWalletEvm('');
      return;
    }
    setRewardWalletEvm(stored);
  }, [myStats?.reward_wallet_evm, needsCopRewardWallet]);

  useEffect(() => {
    setRewardTwitterHandle(String(myStats?.twitter_handle || '').trim());
  }, [myStats?.twitter_handle]);

  useEffect(() => {
    setRewardWalletEditing(false);
  }, [tab, t?.id]);

  useEffect(() => {
    if (!dailyActive) {
      setPickedDailyDay(null);
      return;
    }
    if (!dailyDays.length) return;
    if (!pickedDailyDay || !dailyDays.some(day => day.day_utc === pickedDailyDay)) {
      setPickedDailyDay(activeDailyDayId || dailyDays[0].day_utc);
    }
  }, [dailyActive, dailyDays, pickedDailyDay, activeDailyDayId]);

  useEffect(() => {
    setDailyOpen(false);
  }, [dailyActive, t?.id]);

  const myRank = useMemo(() => {
    if (!board || !playerId) return null;
    const row = board.leaderboard.find(r => r.player_id === playerId);
    return row ? row.rank : null;
  }, [board, playerId]);

  const handleJoin = async () => {
    if (!t || busy || !canJoin) return;
    const needsCopWallet = !!t.rewards_in_cop;
    const rewardWallet = rewardWalletEvm.trim();
    if (needsCopWallet && !SOLANA_WALLET_RE.test(rewardWallet)) {
      alert('Enter a valid Solana address for CLASH rewards.');
      return;
    }
    const twitterHandle = rewardTwitterHandle.trim();
    if (requiresTwitterHandle && !twitterHandle) {
      alert('Enter your Twitter/X handle to register.');
      return;
    }
    if (twitterHandle && !TWITTER_HANDLE_RE.test(twitterHandle)) {
      alert('Enter a valid Twitter/X handle.');
      return;
    }
    setBusy(true);
    const result = await join(t.id, {
      rewardWalletEvm: needsCopWallet ? rewardWallet : undefined,
      twitterHandle: twitterHandle || undefined,
    });
    if (result && result.ok === false) alert(result.error || 'Could not join tournament');
    setBusy(false);
  };
  const handleLeave = async () => {
    if (!t || busy) return;
    const message = preregistration
      ? 'Cancel tournament pre-registration?'
      : 'Leave tournament? Your tournament trophies and stats will reset if you re-join later.';
    if (!confirm(message)) return;
    setBusy(true);
    await leave(t.id);
    setBusy(false);
  };
  const handleSaveRewardWallet = async () => {
    if (!t || busy || tab === 'lucky' || !canManageRewardWallet) return;
    const rewardWallet = rewardWalletEvm.trim();
    if (!SOLANA_WALLET_RE.test(rewardWallet)) {
      alert('Enter a valid Solana address for CLASH rewards.');
      return;
    }
    const twitterHandle = rewardTwitterHandle.trim();
    if (twitterHandle && !TWITTER_HANDLE_RE.test(twitterHandle)) {
      alert('Enter a valid Twitter/X handle.');
      return;
    }
    setBusy(true);
    const result = await updateRewardWallet(t.id, rewardWallet, { twitterHandle });
    if (result && result.ok === false) alert(result.error || 'Could not save CLASH reward address');
    else setRewardWalletEditing(false);
    setBusy(false);
  };
  const handleSaveLuckyRewardWallet = async () => {
    if (!t || busy || !canSaveLuckyRewardWallet) return;
    const rewardWallet = rewardWalletEvm.trim();
    if (!SOLANA_WALLET_RE.test(rewardWallet)) {
      alert('Enter a valid Solana address for CLASH rewards.');
      return;
    }
    const twitterHandle = rewardTwitterHandle.trim();
    if (twitterHandle && !TWITTER_HANDLE_RE.test(twitterHandle)) {
      alert('Enter a valid Twitter/X handle.');
      return;
    }
    setBusy(true);
    const result = await updateLuckyRewardWallet(t.id, rewardWallet, { twitterHandle });
    if (result && result.ok === false) alert(result.error || 'Could not save CLASH reward address');
    else setRewardWalletEditing(false);
    setBusy(false);
  };

  const renderRewardWalletControl = ({ lucky = false } = {}) => {
    if (!canManageRewardWallet) return null;
    const editing = !hasRewardWallet || rewardWalletEditing;
    const saveHandler = lucky ? handleSaveLuckyRewardWallet : handleSaveRewardWallet;
    const help = lucky
      ? 'This Solana wallet receives CLASH rewards if your Lucky Raider tickets win.'
      : 'This Solana wallet receives CLASH tournament rewards.';
    if (!editing) {
      return (
        <div style={S.rewardBox}>
          <div style={S.rewardHeaderRow}>
            <div>
              <div style={S.rewardLabel}>CLASH Solana reward address</div>
              <div style={S.rewardCurrent}>{shortWallet(storedRewardWallet)}</div>
              {storedTwitterHandle ? <div style={S.rewardHelp}>{storedTwitterHandle}</div> : null}
            </div>
            <button
              type="button"
              style={S.rewardChangeBtn}
              onClick={() => setRewardWalletEditing(true)}
              disabled={busy}
            >
              Change
            </button>
          </div>
          <div style={S.rewardHelp}>{help}</div>
        </div>
      );
    }
    return (
      <div style={S.rewardBox}>
        <div style={S.rewardLabel}>CLASH Solana reward address</div>
        <div style={S.rewardHelp}>{help}</div>
        <input
          style={{ ...S.rewardInput, marginTop: 8 }}
          value={rewardWalletEvm}
          onChange={(e) => setRewardWalletEvm(e.target.value)}
          placeholder="Solana wallet address"
          autoCapitalize="none"
          spellCheck={false}
        />
        <input
          style={S.rewardInput}
          value={rewardTwitterHandle}
          onChange={(e) => setRewardTwitterHandle(e.target.value)}
          placeholder="Twitter/X handle (optional)"
          autoCapitalize="none"
          spellCheck={false}
        />
        <div style={S.rewardActionRow}>
          {hasRewardWallet && (
            <button
              type="button"
              style={S.rewardCancelBtn}
              onClick={() => {
                setRewardWalletEvm(storedRewardWallet);
                setRewardTwitterHandle(storedTwitterHandle);
                setRewardWalletEditing(false);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          )}
          <button style={S.rewardSaveBtn} onClick={saveHandler} disabled={busy}>
            {busy ? 'SAVING...' : (lucky && !joined ? 'REGISTER LUCKY RAIDER' : 'SAVE ADDRESS')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Component-local motion and responsive rules render only while this
          modal is mounted, keeping its phone layout independent from the
          global legacy selectors for inline panel widths. */}
      <style>{`
        @keyframes tournamentFade { from { opacity: 0 } to { opacity: 1 } }

        @media (max-width: 899px), (max-height: 600px) {
          .tournament-modal button {
            min-height: 44px;
          }

          .tournament-modal input,
          .tournament-modal select,
          .tournament-modal textarea {
            min-height: 44px;
            box-sizing: border-box;
          }

          .tournament-modal__close {
            min-width: 44px !important;
            min-height: 44px !important;
          }
        }

        @media (max-width: 600px) {
          .tournament-modal {
            width: 100dvw !important;
            max-width: 100dvw !important;
            height: min(620px, 85dvh) !important;
            max-height: min(620px, 85dvh) !important;
            left: 0 !important;
            transform: translateY(-50%) !important;
            border-radius: 0 !important;
          }
        }

        @media (max-width: 359px) {
          .tournament-modal__ranked-summary-grid,
          .tournament-modal__daily-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .tournament-modal__lucky-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
      <div style={S.backdrop} onClick={onClose} />
      <div className="tournament-modal" style={S.modal}>
        <div style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={trophyIcon} alt="" style={S.headerIcon} />
            <span style={S.headerTitle}>Tournament</span>
          </div>
          <button className="tournament-modal__close" style={S.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="tournament-modal__tabs" style={S.tabRow}>
          <button
            style={tab === 'active' ? S.tabActive : S.tab}
            onClick={() => { setTab('active'); setPickedHistoryId(null); }}
          >Active</button>
          <button
            style={tab === 'history' ? S.tabActive : S.tab}
            onClick={() => setTab('history')}
          >History</button>
          <button
            style={tab === 'lucky' ? S.tabActive : S.tab}
            onClick={() => { setTab('lucky'); setPickedHistoryId(null); }}
          >Lucky</button>
        </div>

        <div
          className="clash-scroll"
          // Keying on tab+pickedHistoryId restarts the CSS animation each
          // time the user switches view, giving a soft 150ms cross-fade
          // instead of a hard content swap. Combined with the fixed modal
          // height above, this is what removes the "jump" the user saw.
          key={`${tab}:${pickedHistoryId || ''}`}
          style={{ ...S.body, animation: 'tournamentFade 0.15s ease-out' }}>
          {activeInitialLoading && (
            <div style={S.empty}>
              <div style={S.emptyTitle}>Loading tournament...</div>
              <div style={S.emptySub}>Checking the latest tournament state from the server.</div>
            </div>
          )}

          {tab === 'active' && !activeInitialLoading && tournamentError && !t && (
            <div style={S.empty}>
              <div style={S.emptyTitle}>Could not load tournament</div>
              <div style={S.emptySub}>{tournamentError}</div>
            </div>
          )}

          {tab === 'active' && !activeInitialLoading && !tournamentError && !t && (
            <div style={S.empty}>
              <div style={S.emptyIcon}>🏆</div>
              <div style={S.emptyTitle}>No tournament running</div>
              <div style={S.emptySub}>
                There's no live or upcoming tournament for {String(dex || '').toUpperCase()} right now.<br />
                Check back soon!
              </div>
            </div>
          )}

          {tab === 'history' && !pickedHistoryId && (
            <>
              {!history && <div style={S.empty}>Loading history...</div>}
              {history && history.length === 0 && (
                <div style={S.empty}>
                  <div style={S.emptyIcon}>📜</div>
                  <div style={S.emptyTitle}>No past tournaments</div>
                  <div style={S.emptySub}>Finished cups for {String(dex || '').toUpperCase()} will appear here.</div>
                </div>
              )}
              {history && history.map((h) => {
                const ended = h.end_at ? fmtDate(h.end_at) : 'past';
                const placed = !!h.me;
                const sortKey = h.sort_by;
                const featured = !placed ? '—'
                  : sortKey === 'trophies' ? fmt(h.me.trophies)
                  : sortKey === 'gold' ? fmt(h.me.gold)
                  : sortKey === 'volume_usd' ? fmtUsd(h.me.volume_usd)
                  : fmtUsd(h.me.pnl_usd);
                const featuredColor = !placed ? 'var(--terminal-text-muted)'
                  : sortKey === 'pnl_usd' ? ((h.me.pnl_usd || 0) >= 0 ? 'var(--terminal-long)' : 'var(--terminal-short-strong)')
                  : 'var(--terminal-warning)';
                const featuredDisplay = placed
                  ? featuredMetric(sortKey, h.me)
                  : { value: featured, color: featuredColor };
                return (
                  <button
                    key={h.id}
                    style={S.histRow}
                    onClick={() => setPickedHistoryId(h.id)}
                  >
                    <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                      <div style={S.histName}>{h.name}</div>
                      <div style={S.histSub}>
                        {dexLabel(h, dex)} | Ended {ended}
                        {Number(h.gold_boost) !== 1 && <> · ×{h.gold_boost}G</>}
                        {Number(h.seeker_gold_boost || 1) !== 1 && <> · Seeker ×{h.seeker_gold_boost}G</>}
                        {Number(h.trophy_boost) !== 1 && <> · ×{h.trophy_boost}T</>}
                        {placed ? <> · sort: {sortLabel(h)}</> : <> · did not join</>}
                      </div>
                    </div>
                    <span style={{ ...S.histFeatured, color: featuredDisplay.color }}>{featuredDisplay.value}</span>
                  </button>
                );
              })}
            </>
          )}

          {tab === 'history' && pickedHistoryId && (
            <button style={S.backBtn} onClick={() => setPickedHistoryId(null)}>
              ← Back to history
            </button>
          )}

          {tab === 'lucky' && luckyInitialLoading && (
            <div style={S.empty}>
              <div style={S.emptyTitle}>Loading Lucky Raider...</div>
              <div style={S.emptySub}>Checking today's tickets and draw history.</div>
            </div>
          )}

          {tab === 'lucky' && !luckyInitialLoading && luckyError && !t && (
            <div style={S.empty}>
              <div style={S.emptyTitle}>Could not load Lucky Raider</div>
              <div style={S.emptySub}>{luckyError}</div>
            </div>
          )}

          {tab === 'lucky' && !luckyInitialLoading && !luckyError && !t && (
            <div style={S.empty}>
              <div style={S.emptyTitle}>No Lucky Raider running</div>
              <div style={S.emptySub}>There is no standalone daily lucky raid draw right now.</div>
            </div>
          )}

          {tab === 'lucky' && t && (
            <>
              {renderRewardWalletControl({ lucky: true })}
              <LuckyRaiderPanel
                t={t}
                schedule={luckyMe?.reward_schedule || t.reward_schedule || t.reward_config}
                currentTownHallLevel={currentTownHallLevel}
              />
            </>
          )}

          {tab !== 'lucky' && t && (
            <>
              <div style={S.tCard}>
                <div style={S.tName}>{t.name}</div>
                {t.description && <div style={S.tDesc}>{t.description}</div>}
                <div style={S.tagRow}>
                  <span style={S.dexTag}>{dexLabel(t, dex)}</span>
                  {isMegaTournament(t) && <span style={S.megaTag}>MEGA</span>}
                  {t.battle_mode === 'ranked_raids' && <span style={S.rankedTag}>RANKED RAIDS</span>}
                  {t.mode === 'dex_vs_dex' && <span style={S.teamTag}>DEX VS DEX</span>}
                  <span style={S.tag}>Sort: {sortLabel(t)}</span>
                  {isDailyPoolTournament(t) && <span style={S.prizeTag}>{fmt(t.daily_pool_points || 1000)} pts/day at {dailyPoolAwardTime(t)} UTC</span>}
                  {t.mode === 'dex_vs_dex' && <span style={S.tag}>Winner: {t.team_score_label || 'Volume'}</span>}
                  {t.mode === 'dex_vs_dex' && <span style={S.tag}>Player payout: {t.team_member_reward_label || 'Volume'}</span>}
                  {isHistory
                    ? <span style={S.endedTag}>ENDED</span>
                    : <span style={paused ? S.phaseTagPaused : preregistration ? S.phaseTagBlue : live ? S.phaseTagGreen : S.tag}>{phase || t.status}</span>
                  }
                  {Number(t.gold_boost) !== 1 && <span style={S.boostTag}>×{t.gold_boost} GOLD</span>}
                  {Number(t.seeker_gold_boost || 1) !== 1 && <span style={S.boostTag}>Seeker ×{t.seeker_gold_boost} GOLD</span>}
                  {Number(t.trophy_boost) !== 1 && <span style={S.boostTag}>×{t.trophy_boost} TROPHY</span>}
                  <span style={S.tag}>{t.freeze_trophies === false ? 'Main trophies live' : 'Main trophies frozen'}</span>
                  {activePrizeRewards.map((label) => <span key={label} style={S.prizeTag}>{label}</span>)}
                  {!activePrizeRewards.length && Number(t.prize_pool_usd || 0) > 0 && <span style={S.prizeTag}>Prize {fmtPrize(t.prize_pool_usd)}</span>}
                  {!prizeProgress && t.prize_next_tier && (
                    <span style={S.tag}>
                      Next {nextPrizeRewards[0] || fmtPrize(t.prize_next_tier.pool_usd)} @ {fmtUsd(t.prize_next_tier.volume_usd)} vol
                    </span>
                  )}
                  {t.rewards_in_cop && <span style={S.prizeTag}>CLASH rewards</span>}
                  {preregistration && t.start_at && <span style={S.tag}>Starts {fmtDate(t.start_at)}</span>}
                  {preregistration && t.registration_opens_at && <span style={S.tag}>Reg opens {fmtDate(t.registration_opens_at)}</span>}
                  {preregistration && t.registration_closes_at && <span style={S.tag}>Reg closes {fmtDate(t.registration_closes_at)}</span>}
                  {t.end_at && <span style={S.tag}>{isHistory ? 'Ended' : 'Ends'} {fmtDate(t.end_at)}</span>}
                </div>
              </div>

              {paused && (
                <div style={S.pausedBanner} role="status">
                  <strong style={S.pausedTitle}>Tournament paused</strong>
                  <span style={S.pausedText}>
                    Scoring and new registrations are temporarily stopped. Current standings remain visible.
                  </span>
                  {t.pause_reason && <span style={S.pausedReason}>{t.pause_reason}</span>}
                </div>
              )}

              {rankedRaid?.enabled && (
                <RankedRaidSummary
                  state={rankedRaid}
                  tournament={t}
                  joined={joined}
                />
              )}

              {joined && renderRewardWalletControl()}

              {prizeProgress && (
                <div style={S.prizeProgress}>
                  <div style={S.prizeProgressTop}>
                    <span style={S.prizeProgressTitle}>Next pool {prizeProgress.nextRewards?.[0] || fmtPrize(prizeProgress.nextPoolUsd)}</span>
                    <span style={S.prizeProgressNeed}>{fmtUsd(prizeProgress.remainingVolume)} vol left</span>
                  </div>
                  <div style={S.prizeProgressTrack}>
                    <div style={{ ...S.prizeProgressFill, width: `${prizeProgress.pct}%` }} />
                  </div>
                  <div style={S.prizeProgressMeta}>
                    <span>{fmtUsd(prizeProgress.currentVolume)} current</span>
                    <span>{fmtUsd(prizeProgress.nextVolume)} target</span>
                  </div>
                </div>
              )}

              {activeRewardSchedule?.schedule && (
                <RewardScheduleCard
                  schedule={activeRewardSchedule.schedule}
                  sectorName={activeRewardSchedule.sectorName}
                  currency={t.prize_currency || 'USD'}
                  currentTownHallLevel={currentTownHallLevel}
                />
              )}

              {isMegaTournament(t) && megaSectors.length > 0 && (
                <div style={S.sectorCard}>
                  <div style={S.sectorHeader}>
                    <span style={S.sectorTitle}>Mega sectors</span>
                    {myBoardRow?.mega_sector_name && <span style={S.sectorMine}>You: {myBoardRow.mega_sector_name}</span>}
                  </div>
                  <div style={S.sectorGrid}>
                    {megaSectors.filter((sector) => sector.id !== 'unqualified').map((sector) => {
                      const mine = myBoardRow?.mega_sector_id === sector.id;
                      return (
                        <div key={sector.id} style={mine ? S.sectorTileActive : S.sectorTile}>
                          <div style={S.sectorTileTop}>
                            <strong>{sector.name}</strong>
                            <span>{sector.summary?.players || 0} players</span>
                          </div>
                          <div style={S.sectorReq}>{sectorRequirementText(sector)}</div>
                          <div style={S.sectorReq}>{(sector.dex_labels || []).slice(0, 4).join(', ') || 'All DEXes'}</div>
                          <div style={S.sectorVolume}>{fmtUsdWhole(sector.summary?.total_volume_usd || 0)} sector vol</div>
                          {(Number(sector.min_daily_volume_usd || 0) > 0 || Number(sector.summary?.daily_volume_usd || 0) > 0) && (
                            <div style={S.sectorReq}>{fmtUsdWhole(sector.summary?.daily_volume_usd || 0)} today</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {myBoardRow?.dex_breakdown?.length > 0 && (
                    <div style={S.dexBreakdownLine}>Your DEX volume: {dexBreakdownSummary(myBoardRow)}</div>
                  )}
                </div>
              )}

              {!isHistory && !joined && (
                <>
                  {showJoinContactFields && !paused && (
                    <div style={S.rewardBox}>
                      <div style={S.rewardLabel}>{needsCopRewardWallet ? 'CLASH Solana reward address' : 'Tournament registration'}</div>
                      {needsCopRewardWallet && (
                        <input
                          style={{ ...S.rewardInput, marginTop: 8 }}
                          value={rewardWalletEvm}
                          onChange={(e) => setRewardWalletEvm(e.target.value)}
                          placeholder="Solana wallet address"
                          autoCapitalize="none"
                          spellCheck={false}
                        />
                      )}
                      <input
                        style={needsCopRewardWallet ? S.rewardInput : { ...S.rewardInput, marginTop: 8 }}
                        value={rewardTwitterHandle}
                        onChange={(e) => setRewardTwitterHandle(e.target.value)}
                        placeholder={requiresTwitterHandle ? 'Twitter/X handle (required)' : 'Twitter/X handle (optional)'}
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                    </div>
                  )}
                  <button style={{ ...S.joinBtn, opacity: canJoin ? 1 : 0.6 }} onClick={handleJoin} disabled={busy || !canJoin}>
                    {busy || tournamentLoading ? (preregistration ? 'REGISTERING...' : 'JOINING...') : (paused ? 'TOURNAMENT PAUSED' : !canJoin ? (joinBlockedByTownHall ? `TH ${joinTownHallRequirement?.required || t.min_town_hall_level} REQUIRED` : 'REGISTRATION CLOSED') : preregistration ? 'PRE-REGISTER' : 'JOIN TOURNAMENT')}
                  </button>
                  {joinBlockedByTownHall && (
                    <TownHallRequirementBlock
                      required={joinTownHallRequirement?.required || t.min_town_hall_level || 0}
                      current={joinTownHallRequirement?.current || currentTownHallLevel}
                      blocked
                    />
                  )}
                </>
              )}

              {isHistory && myStats && (
                <div style={S.myCard}>
                  <div style={S.myCardHeader}>
                    <span style={S.myCardLabel}>Your final standing</span>
                    {myRank && <span style={S.myCardRank}>#{myRank}</span>}
                  </div>
                  <div style={S.statRow}>
                    {myBoardRow?.mega_sector_name && <Stat label="Sector" value={myBoardRow.mega_sector_name} />}
                    {myBoardRow?.top_dex_label && <Stat label="Top DEX" value={myBoardRow.top_dex_label} />}
                    {isPointsSort(t.sort_by) && (
                      <Stat label="Score" value={`${fmtPoints(myStats.score)} pts`} />
                    )}
                    <Stat label="Trophies" value={fmt(myStats.trophies)} />
                    <Stat label="Trades" value={myStats.trades_count} />
                    <Stat label="Volume" value={fmtUsdWhole(myStats.volume_usd)} />
                    <Stat
                      label="PnL"
                      value={fmtUsd(myStats.pnl_usd)}
                      color={(myStats.pnl_usd || 0) >= 0 ? 'var(--terminal-long)' : 'var(--terminal-short-strong)'}
                    />
                  </div>
                </div>
              )}

              {isHistory && !myStats && (
                <div style={S.didNotJoin}>You didn't join this tournament.</div>
              )}

              {joined && preregistration && (
                <div style={S.myCard}>
                  <div style={S.myCardHeader}>
                    <span style={S.myCardLabel}>You are registered</span>
                    {myRank && <span style={S.myCardRank}>#{myRank}</span>}
                  </div>
                  <div style={S.freezeNote}>
                    Scoring starts automatically when the tournament begins. Your normal trophies and rewards are unchanged until then.
                  </div>
                  <button style={S.leaveBtn} onClick={handleLeave} disabled={busy}>
                    {busy ? 'Cancelling...' : 'Cancel registration'}
                  </button>
                </div>
              )}

              {joined && (live || paused) && myStats && (
                <div style={S.myCard}>
                  <div style={S.myCardHeader}>
                    <span style={S.myCardLabel}>Your standing</span>
                    {myRank && <span style={S.myCardRank}>#{myRank}</span>}
                  </div>
                  <div style={S.statRow}>
                    {myBoardRow?.mega_sector_name && <Stat label="Sector" value={myBoardRow.mega_sector_name} />}
                    {myBoardRow?.top_dex_label && <Stat label="Top DEX" value={myBoardRow.top_dex_label} />}
                    {isPointsSort(t.sort_by) && (
                      <Stat label="Score" value={`${fmtPoints(myStats.score)} pts`} />
                    )}
                    <Stat label="Trophies" value={fmt(myStats.trophies)} />
                    <Stat label="Trades" value={myStats.trades_count} />
                    <Stat label="Volume" value={fmtUsdWhole(myStats.volume_usd)} />
                    <Stat
                      label="PnL"
                      value={fmtUsd(myStats.pnl_usd)}
                      color={(myStats.pnl_usd || 0) >= 0 ? 'var(--terminal-long)' : 'var(--terminal-short-strong)'}
                    />
                  </div>
                  <div style={S.freezeNote}>
                    {paused ? (
                      <>Scoring is paused. Battles and trades made during this pause will not be added to the tournament.</>
                    ) : isDailyPoolTournament(t) ? (
                      <>Score is awarded from the daily pool after each UTC day closes. Current battle, volume, and PnL activity is tracked live.</>
                    ) : t.freeze_trophies === false ? (
                      <>Main trophies keep updating while joined. Battle wins/losses also count toward this tournament.</>
                    ) : (
                      <>Main trophies are <strong>frozen</strong> while joined. Battle wins/losses count only toward this tournament.</>
                    )} Quests &amp; gold credit normally.
                  </div>
                  <button style={S.leaveBtn} onClick={handleLeave} disabled={busy}>
                    {busy ? 'Leaving…' : 'Leave tournament'}
                  </button>
                </div>
              )}

              {isDailyPoolTournament(t) && (
                <DailyPointsCard
                  t={t}
                  days={dailyDays}
                  selectedDay={selectedDailyDay}
                  selectedDayId={pickedDailyDay}
                  onPickDay={setPickedDailyDay}
                  myPlayerId={dailyMyPlayerId}
                  expanded={dailyOpen}
                  onToggle={() => setDailyOpen(open => !open)}
                />
              )}

              <div style={S.lbHeader}>Leaderboard</div>
              {isMegaTournament(t) && megaSectors.length > 0 && (
                <div style={S.lbGroupList}>
                  {megaSectors.map((sector) => (
                    <div key={sector.id} style={S.lbGroupHeader}>
                      <span>{sector.name}</span>
                      <small>{fmtUsdWhole(sector.summary?.total_volume_usd || 0)} vol · {sector.summary?.players || 0} players</small>
                    </div>
                  ))}
                </div>
              )}
              {t.mode === 'dex_vs_dex' && board?.teams?.teams?.length > 0 && (
                <div style={S.teamBoard}>
                  {board.teams.teams.map((team) => (
                    <div key={team.dex} style={team.winner ? S.teamWinner : S.teamCard}>
                      <div style={S.teamName}>#{team.rank} {team.label}</div>
                      <div style={S.teamMeta}>
                        {fmtTeamMetric(board.teams.score_by, team.score)} | {team.players} players
                      </div>
                      {Number(team.prize_pool_usd || 0) > 0 && (
                        <div style={S.teamPrize}>{fmtPrize(team.prize_pool_usd)} pool</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={S.lbList}>
                {!board && <div style={S.empty}>Loading…</div>}
                {board && board.leaderboard.length === 0 && (
                  <div style={S.empty}>No players yet — be the first to join</div>
                )}
                {board && board.leaderboard.map((r) => {
                  const isMe = r.player_id === playerId;
                  const medalColor = r.rank === 1 ? '#FFD700' : r.rank === 2 ? '#C0C0C0' : r.rank === 3 ? '#CD7F32' : null;
                  const sortKey = board.sort_by;
                  const featuredDisplay = featuredMetric(sortKey, r);
                  const prizeAmount = Number(r.prize_amount || 0);
                  const rankRewards = rankRewardSummary(r.prize_rewards || [], r.prize_currency || t.prize_currency || 'USD');
                  const topDex = leaderboardDexBadgeLabel(t, r);
                  const showPnl = leaderboardUsesPnl(t, sortKey);
                  return (
                    <div
                      key={r.player_id}
                      style={{
                        ...S.row,
                        background: isMe ? 'var(--terminal-border)' : 'var(--terminal-surface-subtle)',
                        border: isMe ? '3px solid var(--terminal-warning)' : '3px solid var(--terminal-border)',
                      }}
                    >
                      <div
                        style={{
                          ...S.rank,
                          background: medalColor || 'var(--terminal-text-muted)',
                          color: medalColor ? '#000' : 'var(--terminal-surface)',
                        }}
                      >
                        {r.rank}
                      </div>
                      <div style={S.info}>
                        <span style={{ ...S.name, color: isMe ? 'var(--terminal-warning)' : 'var(--terminal-text)' }}>
                          {r.name || (r.wallet || '').slice(0, 6) + '…'}{isMe ? ' (you)' : ''}
                          {topDex && <em style={S.topDexBadge}>{topDex}</em>}
                        </span>
                        <span style={S.subRow}>
                          {r.team_label && <>{r.team_label} | </>}
                          {isMegaTournament(t) && r.mega_sector_name && <>{r.mega_sector_name} · </>}
                          {fmt(r.trophies)} 🏆 · {fmtUsd(r.volume_usd)} vol
                          {showPnl && (
                            <> · {fmtUsd(r.pnl_usd)} PnL</>
                          )}
                          {rankRewards.length > 0 && <> · <strong style={S.prizeText}>{rankRewards.join(' + ')}</strong></>}
                          {!rankRewards.length && prizeAmount > 0 && <> · <strong style={S.prizeText}>{fmtPrize(prizeAmount)} prize</strong></>}
                        </span>
                      </div>
                      <span style={{ ...S.featured, color: featuredDisplay.color }}>{featuredDisplay.value}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function DailyPointsCard({ t, days, selectedDay, selectedDayId, onPickDay, myPlayerId, expanded, onToggle }) {
  const day = selectedDay || days?.[0] || null;
  const players = day?.players || [];
  const processed = !!day?.processed;
  const pointsKey = processed ? 'awarded_points' : 'estimated_points';
  const rankKey = processed ? 'rank' : 'estimate_rank';
  const mine = myPlayerId ? players.find(row => row.player_id === myPlayerId) : null;
  const runPool = Number(day?.run?.details?.pool || day?.run?.details?.pool_state?.points || 0);
  const estimatePool = Number(day?.estimate?.pool || 0);
  const pool = (processed && runPool > 0 ? runPool : estimatePool) || Number(t?.daily_pool_points || 1000) || 1000;
  const activeDayId = selectedDayId || day?.day_utc;
  const minePoints = mine ? Number(mine[pointsKey] || 0) : 0;
  const mineRank = mine ? Number(mine[rankKey] || mine.rank || 0) : 0;
  const shownPlayers = players;
  const windowLabel = dailyWindowLabel(day);

  return (
    <div style={S.dailyCard}>
      <div style={S.dailyHeader}>
        <div style={S.dailyHeaderMain}>
          <div>
            <div style={S.dailyTitle}>Daily points</div>
            <div style={S.dailySub}>{fmt(pool)} pool, closes {dailyPoolAwardTime(t)} UTC</div>
          </div>
          <div style={S.dailyCompactMine}>
            <span style={S.dailyCompactLabel}>You</span>
            <strong style={S.dailyCompactValue}>{fmtPoints(minePoints)} pts</strong>
          </div>
        </div>
        <button
          type="button"
          style={processed ? S.dailyToggleDone : S.dailyToggleLive}
          onClick={onToggle}
          aria-expanded={!!expanded}
        >
          <span>{expanded ? 'Hide' : (processed ? 'Awarded' : 'Estimate')}</span>
          <span
            aria-hidden="true"
            style={{
              ...S.dailyCaret,
              transform: expanded ? 'rotate(225deg)' : 'rotate(45deg)',
              marginTop: expanded ? 2 : -2,
            }}
          />
        </button>
      </div>

      {expanded && (
        <>
          {days?.length > 0 && (
            <div className="clash-scroll-hidden" style={S.dailyChips}>
              {days.map(dayRow => (
                <button
                  key={dayRow.day_utc}
                  style={dayRow.day_utc === activeDayId ? S.dailyChipActive : S.dailyChip}
                  onClick={() => onPickDay(dayRow.day_utc)}
                >
                  {dailyRoundLabel(dayRow)}
                </button>
              ))}
            </div>
          )}

          {windowLabel && <div style={S.dailyWindow}>{windowLabel}</div>}

          {!day && (
            <div style={S.dailyEmpty}>No daily activity yet.</div>
          )}

          {day && (
            <>
              <div style={S.dailyMine}>
                <div style={S.dailyMineMain}>
                  <span style={S.dailyMineLabel}>Your round</span>
                  <strong style={S.dailyMineValue}>{fmtPoints(minePoints)} pts</strong>
                </div>
                <span style={S.dailyMineRank}>{mineRank ? `#${mineRank}` : '-'}</span>
              </div>

              <div className="tournament-modal__daily-grid" style={S.dailyGrid}>
                <div style={S.dailyMiniStat}>
                  <strong style={S.dailyMiniValue}>{fmtUsd(day.totals?.volume_usd)}</strong>
                  <span style={S.dailyMiniLabel}>Volume</span>
                </div>
                <div style={S.dailyMiniStat}>
                  <strong style={S.dailyMiniValue}>{fmt(day.totals?.trophies)}</strong>
                  <span style={S.dailyMiniLabel}>Trophies</span>
                </div>
                <div style={S.dailyMiniStat}>
                  <strong style={S.dailyMiniValue}>{fmt(day.totals?.trades_count)}</strong>
                  <span style={S.dailyMiniLabel}>Trades</span>
                </div>
                <div style={S.dailyMiniStat}>
                  <strong style={S.dailyMiniValue}>{fmt(day.totals?.players)}</strong>
                  <span style={S.dailyMiniLabel}>Players</span>
                </div>
              </div>

              <div style={S.dailyList}>
                {shownPlayers.map((row) => {
                  const isMe = row.player_id === myPlayerId;
                  const rank = Number(row[rankKey] || row.rank || 0);
                  const points = Number(row[pointsKey] || 0);
                  const showPnl = leaderboardUsesPnl(t, t?.sort_by);
                  return (
                    <div
                      key={row.player_id}
                      style={{
                        ...S.dailyPlayerRow,
                        background: isMe ? 'var(--terminal-warning-soft)' : 'var(--terminal-surface)',
                        borderColor: isMe ? 'var(--terminal-warning)' : 'var(--terminal-border)',
                      }}
                    >
                      <span style={S.dailyPlayerRank}>{rank || '-'}</span>
                      <div style={S.dailyPlayerInfo}>
                        <span style={S.dailyPlayerName}>{compactPlayerName(row)}{isMe ? ' (you)' : ''}</span>
                        <span style={S.dailyPlayerMeta}>
                          {fmt(row.trophies)} trophies | {fmtUsd(row.volume_usd)} vol{showPnl ? ` | ${fmtUsd(row.pnl_usd)} PnL` : ''} | {fmt(row.gold)} gold
                        </span>
                      </div>
                      <span style={S.dailyPlayerPoints}>{fmtPoints(points)}</span>
                    </div>
                  );
                })}
                {players.length === 0 && <div style={S.dailyEmpty}>No players yet.</div>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={S.stat}>
      <div style={{ ...S.statValue, color: color || 'var(--terminal-warning)' }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

export default memo(TournamentPanel);

const S = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 250, pointerEvents: 'auto' },
  modal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    // Fixed height (clamped to viewport on small screens) keeps the modal
    // from "popping" up/down when tab content changes size — empty states
    // and a 50-row leaderboard now share the same outer footprint.
    width: 480, maxWidth: 'calc(100dvw - 32px)',
    height: 'min(88dvh, 620px)',
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', borderRadius: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column',
    zIndex: 251, pointerEvents: 'auto', overflow: 'hidden',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', background: 'var(--terminal-border)', borderBottom: '1px solid var(--terminal-border-strong)',
  },
  tabRow: {
    display: 'flex', gap: 0, padding: '8px 12px 0',
    borderBottom: '1px solid var(--terminal-surface-subtle)', background: 'var(--terminal-surface)',
  },
  tab: {
    flex: 1, padding: '8px 12px', background: 'transparent',
    border: 'none', borderBottom: '1px solid transparent',
    color: 'var(--terminal-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tabActive: {
    flex: 1, padding: '8px 12px', background: 'transparent',
    border: 'none', borderBottom: '2px solid var(--terminal-orange)',
    color: 'var(--terminal-brand-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  histRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', borderRadius: 12, marginBottom: 5,
    background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)',
    cursor: 'pointer', textAlign: 'left', width: '100%',
    fontFamily: 'inherit',
  },
  histName: { fontSize: 13, fontWeight: 700, color: 'var(--terminal-text)' },
  histSub: { fontSize: 10, fontWeight: 700, color: 'var(--terminal-text-muted)', marginTop: 2 },
  histFeatured: { fontSize: 14, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  endedTag: {
    fontSize: 10, fontWeight: 600, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-text-muted)', color: 'var(--terminal-on-accent)', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  didNotJoin: {
    fontSize: 12, color: 'var(--terminal-text-muted)', textAlign: 'center', padding: '10px',
    background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', borderRadius: 12,
    fontWeight: 700,
  },
  backBtn: uiButton('secondary', { minHeight: 34, padding: '6px 12px', fontSize: 12, alignSelf: 'flex-start', marginBottom: 4 }),
  headerIcon: {
    width: 22, height: 22, objectFit: 'contain',
    filter: 'invert(60%) sepia(90%) saturate(500%) hue-rotate(10deg)',
  },
  headerTitle: { fontSize: 18, fontWeight: 700, color: 'var(--terminal-text)' },
  closeBtn: uiIconButton('danger', 30),
  body: {
    flex: 1, minHeight: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
    overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
  },
  empty: { textAlign: 'center', padding: 28, color: 'var(--terminal-text-muted)', fontWeight: 700, fontSize: 13 },
  emptySmall: { textAlign: 'center', padding: 14, color: 'var(--terminal-text-muted)', fontWeight: 600, fontSize: 12 },
  emptyIcon: { fontSize: 44, marginBottom: 6 },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: 'var(--terminal-text)', marginBottom: 4 },
  emptySub: { fontSize: 12, color: 'var(--terminal-text-muted)', lineHeight: 1.5 },

  luckyHero: {
    background: 'linear-gradient(135deg, var(--terminal-warning-soft) 0%, var(--terminal-surface) 100%)',
    border: '1px solid var(--terminal-warning)',
    borderRadius: 14,
    padding: 12,
    display: 'flex',
    gap: 10,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  luckyKicker: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--terminal-warning)',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  luckyTitle: { fontSize: 18, fontWeight: 700, color: 'var(--terminal-text)', marginTop: 2 },
  luckySub: { fontSize: 12, fontWeight: 700, color: 'var(--terminal-text-secondary)', lineHeight: 1.35, marginTop: 3 },
  luckyPrize: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--terminal-long)',
    background: 'var(--terminal-long-soft)',
    border: '1px solid var(--terminal-long)',
    borderRadius: 10,
    padding: '6px 8px',
    textAlign: 'right',
    maxWidth: 128,
  },
  luckyGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  luckyRuleBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    background: 'var(--terminal-surface-subtle)',
    border: '1px solid var(--terminal-border)',
    borderRadius: 14,
    padding: 10,
    color: 'var(--terminal-text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.35,
  },
  luckySectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--terminal-text)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  luckyList: { display: 'flex', flexDirection: 'column', gap: 6 },
  luckyEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-border)',
    borderRadius: 12,
    padding: '8px 9px',
  },
  luckyRank: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'var(--terminal-warning)',
    color: 'var(--terminal-on-accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  luckyEntryName: { fontSize: 13, fontWeight: 700, color: 'var(--terminal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  luckyEntryMeta: { fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-muted)', marginTop: 2 },
  luckyEntrySubMeta: { fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-secondary)', marginTop: 2, opacity: 0.85 },
  luckyTickets: { fontSize: 12, fontWeight: 700, color: 'var(--terminal-warning)', whiteSpace: 'nowrap' },
  luckyHistoryRow: {
    background: 'var(--terminal-surface-subtle)',
    border: '1px solid var(--terminal-border)',
    borderRadius: 12,
    padding: 9,
  },
  luckyHistoryDay: { fontSize: 12, fontWeight: 700, color: 'var(--terminal-text)' },
  luckyHistoryMeta: { fontSize: 11, fontWeight: 600, color: 'var(--terminal-text-secondary)', lineHeight: 1.45, marginTop: 3 },
  luckyHistoryWinners: { color: 'var(--terminal-long)', marginTop: 3 },

  tCard: {
    background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', borderRadius: 14, padding: 12,
  },
  tName: { fontSize: 16, fontWeight: 700, color: 'var(--terminal-text)', marginBottom: 4 },
  tDesc: { fontSize: 12, color: 'var(--terminal-text-secondary)', lineHeight: 1.4, marginBottom: 8 },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  dexTag: {
    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-info-soft)', border: '1px solid var(--terminal-info-border)', color: 'var(--terminal-info)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  teamTag: {
    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-short-soft)', border: '1px solid var(--terminal-short)', color: 'var(--terminal-short-strong)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  megaTag: {
    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-brand-soft)', border: '1px solid var(--terminal-orange)', color: 'var(--terminal-brand-text)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  rankedTag: {
    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-info-soft)', border: '1px solid #3b82f6', color: 'var(--terminal-info)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  tag: {
    fontSize: 10, fontWeight: 600, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text-secondary)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  phaseTagBlue: {
    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-info-soft)', border: '1px solid #60a5fa', color: 'var(--terminal-info)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  phaseTagGreen: {
    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-long-soft)', border: '1px solid var(--terminal-long)', color: 'var(--terminal-long)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  phaseTagPaused: {
    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)', color: '#92400e',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  pausedBanner: {
    display: 'flex', flexDirection: 'column', gap: 3,
    padding: '9px 10px', borderRadius: 8,
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)',
  },
  pausedTitle: {
    color: '#78350f', fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
  },
  pausedText: {
    color: 'var(--terminal-text-secondary)', fontSize: 11, fontWeight: 700, lineHeight: 1.35,
  },
  pausedReason: {
    color: '#92400e', fontSize: 10, fontWeight: 600, lineHeight: 1.3,
  },
  rankedSummary: {
    display: 'flex', flexDirection: 'column', gap: 9,
    padding: '10px 11px', borderRadius: 8,
    background: 'var(--terminal-info-soft)', border: '1px solid var(--terminal-info-border)',
  },
  rankedSummaryHead: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
  },
  rankedSummaryTitle: {
    color: 'var(--terminal-info)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
  },
  rankedSummarySub: {
    color: 'var(--terminal-text-secondary)', fontSize: 10, fontWeight: 700, lineHeight: 1.35, marginTop: 2,
  },
  rankedSummaryLive: {
    flexShrink: 0, padding: '3px 6px', borderRadius: 5,
    background: 'var(--terminal-long-soft)', border: '1px solid var(--terminal-long)',
    color: 'var(--terminal-long)', fontSize: 10, fontWeight: 700,
  },
  rankedSummaryLocked: {
    flexShrink: 0, padding: '3px 6px', borderRadius: 5,
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)',
    color: '#92400e', fontSize: 10, fontWeight: 700,
  },
  rankedSummaryGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    borderTop: '1px solid var(--terminal-info-border)', borderBottom: '1px solid var(--terminal-info-border)',
  },
  rankedSummaryStat: {
    minWidth: 0, padding: '7px 3px', textAlign: 'center',
  },
  rankedSummaryValue: {
    display: 'block', color: 'var(--terminal-text)', fontSize: 13, fontWeight: 700,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  rankedSummaryLabel: {
    display: 'block', color: 'var(--terminal-text-muted)', fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', marginTop: 2,
  },
  rankedSummaryMeta: {
    display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 10px',
    color: 'var(--terminal-text-secondary)', fontSize: 10, fontWeight: 600,
  },
  rankedSummaryJoin: {
    color: 'var(--terminal-text-secondary)', fontSize: 10, fontWeight: 600, lineHeight: 1.4,
  },
  boostTag: {
    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-warning)', border: '1px solid var(--terminal-warning)', color: 'var(--terminal-on-accent)',
    textTransform: 'uppercase', letterSpacing: 0.4,
    textShadow: 'none',
  },
  prizeTag: {
    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
    background: 'var(--terminal-long-soft)', border: '1px solid var(--terminal-long)', color: 'var(--terminal-long)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  prizeProgress: {
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)', borderRadius: 14,
    padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6,
  },
  prizeProgressTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, minWidth: 0,
  },
  prizeProgressTitle: {
    fontSize: 11, fontWeight: 700, color: 'var(--terminal-text)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  prizeProgressNeed: {
    fontSize: 11, fontWeight: 700, color: 'var(--terminal-long)',
    whiteSpace: 'nowrap',
  },
  prizeProgressTrack: {
    height: 9, overflow: 'hidden', borderRadius: 999,
    background: 'var(--terminal-border)', border: '1px solid var(--terminal-border-strong)',
  },
  prizeProgressFill: {
    height: '100%', borderRadius: 999,
    background: 'linear-gradient(90deg, var(--terminal-long) 0%, var(--terminal-warning) 100%)',
  },
  prizeProgressMeta: {
    display: 'flex', justifyContent: 'space-between', gap: 8,
    fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-secondary)',
  },
  rewardScheduleCard: {
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', borderRadius: 14,
    padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
  },
  rewardScheduleHeader: {
    display: 'flex', justifyContent: 'space-between', gap: 8,
    fontSize: 12, fontWeight: 700, color: 'var(--terminal-text)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  rewardScheduleLine: {
    fontSize: 11, fontWeight: 700, color: 'var(--terminal-text)',
    background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', borderRadius: 8,
    padding: '5px 7px',
  },
  rewardScheduleLucky: {
    fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-secondary)',
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)', borderRadius: 8,
    padding: '6px 7px', display: 'flex', flexDirection: 'column', gap: 3,
  },
  sectorCard: {
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', borderRadius: 14,
    padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
  },
  sectorHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectorTitle: { fontSize: 12, fontWeight: 700, color: 'var(--terminal-text)', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectorMine: { fontSize: 11, fontWeight: 700, color: 'var(--terminal-long)', background: 'var(--terminal-long-soft)', border: '1px solid var(--terminal-long)', borderRadius: 8, padding: '3px 7px' },
  sectorGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 },
  sectorTile: { background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', borderRadius: 10, padding: 8 },
  sectorTileActive: { background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)', borderRadius: 10, padding: 8 },
  sectorTileTop: { display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--terminal-text)' },
  sectorReq: { fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-secondary)', marginTop: 3 },
  sectorVolume: { fontSize: 10, fontWeight: 700, color: 'var(--terminal-long)', marginTop: 4 },
  dexBreakdownLine: { fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-secondary)' },
  teamBoard: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 },
  teamCard: {
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', borderRadius: 10, padding: 8,
  },
  teamWinner: {
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)', borderRadius: 10, padding: 8,
  },
  teamName: { fontSize: 11, fontWeight: 700, color: 'var(--terminal-text)' },
  teamMeta: { fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-secondary)', marginTop: 2 },
  teamPrize: { fontSize: 10, fontWeight: 700, color: 'var(--terminal-long)', marginTop: 3 },
  lbGroupList: { display: 'flex', flexDirection: 'column', gap: 5 },
  lbGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  lbGroupHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)', borderRadius: 9,
    padding: '6px 8px', fontSize: 11, fontWeight: 700, color: 'var(--terminal-text)',
  },

  rewardBox: {
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)', borderRadius: 14, padding: 10,
  },
  rewardHeaderRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  rewardLabel: { fontSize: 11, fontWeight: 700, color: 'var(--terminal-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  rewardHelp: { fontSize: 11, fontWeight: 700, color: 'var(--terminal-text-secondary)', lineHeight: 1.35, marginBottom: 7 },
  rewardHint: { fontSize: 11, fontWeight: 600, color: 'var(--terminal-warning)', textAlign: 'center', marginTop: 6 },
  townHallReq: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--terminal-long)',
    borderRadius: 12,
    padding: '8px 10px',
    background: 'var(--terminal-long-soft)',
    color: 'var(--terminal-long-strong)',
    fontWeight: 700,
    lineHeight: 1.25,
  },
  townHallReqCompact: {
    padding: '6px 7px',
    borderWidth: 1,
    borderRadius: 8,
  },
  townHallReqOk: {
    background: 'var(--terminal-long-soft)',
    borderColor: 'var(--terminal-long)',
    color: 'var(--terminal-long-strong)',
  },
  townHallReqBlocked: {
    background: 'var(--terminal-short-soft)',
    borderColor: 'var(--terminal-short)',
    color: 'var(--terminal-short-strong)',
  },
  townHallReqTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  townHallReqTitle: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  townHallReqBadgeOk: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 999,
    background: 'var(--terminal-long)',
    color: 'var(--terminal-on-accent)',
    whiteSpace: 'nowrap',
  },
  townHallReqBadgeBlocked: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 999,
    background: 'var(--terminal-short)',
    color: 'var(--terminal-on-accent)',
    whiteSpace: 'nowrap',
  },
  townHallReqText: { fontSize: 12, fontWeight: 700 },
  townHallReqSub: { fontSize: 10, fontWeight: 600, opacity: 0.82 },
  rewardCurrent: {
    fontSize: 13, fontWeight: 700, color: 'var(--terminal-text)',
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', borderRadius: 9,
    padding: '5px 8px', overflowWrap: 'anywhere',
  },
  rewardInput: {
    width: '100%', boxSizing: 'border-box', border: '1px solid var(--terminal-border)', borderRadius: 10,
    background: 'var(--terminal-surface)', color: 'var(--terminal-text)', fontSize: 12, fontWeight: 600,
    padding: '8px 10px', outline: 'none',
  },
  rewardActionRow: {
    display: 'flex', gap: 8, marginTop: 8,
  },
  rewardChangeBtn: uiButton('secondary', { minHeight: 34, padding: '7px 10px', fontSize: 11, textTransform: 'uppercase' }),
  rewardCancelBtn: {
    ...uiButton('secondary', { flex: 1, minHeight: 36, padding: '8px 12px', fontSize: 12 }),
    textTransform: 'uppercase',
  },
  rewardSaveBtn: {
    ...uiButton('primary', { flex: 1, minHeight: 36, padding: '8px 12px', fontSize: 12 }),
    letterSpacing: 0.5, textTransform: 'uppercase',
  },

  joinBtn: {
    ...uiButton('primary', { width: '100%', minHeight: 44, padding: '12px 16px', fontSize: 14 }),
    letterSpacing: 0.4,
  },

  myCard: {
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)', borderRadius: 14, padding: 12,
  },
  myCardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8,
  },
  myCardLabel: { fontSize: 11, fontWeight: 600, color: 'var(--terminal-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 },
  myCardRank: { fontSize: 22, fontWeight: 700, color: 'var(--terminal-warning)' },
  statRow: { display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 },
  stat: {
    flex: '1 1 56px', minWidth: 56, textAlign: 'center', background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-border)', borderRadius: 8, padding: '6px 4px',
  },
  statValue: { fontSize: 14, fontWeight: 700, lineHeight: 1.2 },
  statLabel: { fontSize: 10, color: 'var(--terminal-text-muted)', textTransform: 'uppercase', marginTop: 2, fontWeight: 700, letterSpacing: 0.4 },
  freezeNote: {
    fontSize: 11, color: 'var(--terminal-text-secondary)', lineHeight: 1.4, padding: '6px 4px',
    background: 'var(--terminal-surface)', borderRadius: 8, marginBottom: 8,
  },
  leaveBtn: uiButton('danger', { width: '100%', minHeight: 34, padding: '6px', fontSize: 11 }),

  dailyCard: {
    background: 'var(--terminal-surface-subtle)', border: '1px solid var(--terminal-border)', borderRadius: 14, padding: 10,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  dailyHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  },
  dailyHeaderMain: {
    minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 auto',
  },
  dailyTitle: {
    fontSize: 13, fontWeight: 700, color: 'var(--terminal-text)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  dailySub: { fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-secondary)', marginTop: 1 },
  dailyCompactMine: {
    display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0,
    padding: '4px 7px', borderRadius: 8,
    background: 'var(--terminal-warning-soft)', border: '1px solid rgba(124, 90, 58, 0.18)',
    whiteSpace: 'nowrap',
  },
  dailyCompactLabel: {
    fontSize: 10, fontWeight: 700, color: 'var(--terminal-text-secondary)', textTransform: 'uppercase',
  },
  dailyCompactValue: {
    fontSize: 12, fontWeight: 700, color: 'var(--terminal-long)',
  },
  dailyToggleLive: {
    fontSize: 10, fontWeight: 700, padding: '4px 7px', borderRadius: 7,
    background: 'var(--terminal-info-soft)', border: '1px solid #60a5fa', color: 'var(--terminal-info)',
    textTransform: 'uppercase', letterSpacing: 0.4, cursor: 'pointer',
    fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5,
  },
  dailyToggleDone: {
    fontSize: 10, fontWeight: 700, padding: '4px 7px', borderRadius: 7,
    background: 'var(--terminal-long-soft)', border: '1px solid var(--terminal-long)', color: 'var(--terminal-long)',
    textTransform: 'uppercase', letterSpacing: 0.4, cursor: 'pointer',
    fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5,
  },
  dailyCaret: {
    width: 6, height: 6, borderRight: '1px solid currentColor', borderBottom: '1px solid currentColor',
    flex: '0 0 auto',
  },
  dailyChips: {
    display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2,
  },
  dailyChip: {
    flex: '0 0 auto', padding: '5px 8px', borderRadius: 999,
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text-secondary)',
    fontSize: 10, fontWeight: 700, cursor: 'pointer',
  },
  dailyChipActive: {
    flex: '0 0 auto', padding: '5px 8px', borderRadius: 999,
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)', color: 'var(--terminal-text)',
    fontSize: 10, fontWeight: 700, cursor: 'pointer',
  },
  dailyWindow: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--terminal-text-secondary)',
    background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-border)',
    borderRadius: 9,
    padding: '5px 7px',
    lineHeight: 1.15,
  },
  dailyMine: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning)', borderRadius: 12,
    padding: '7px 9px',
  },
  dailyMineMain: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  dailyMineLabel: {
    fontSize: 10, fontWeight: 700, color: 'var(--terminal-text-secondary)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  dailyMineValue: {
    fontSize: 16, fontWeight: 700, color: 'var(--terminal-long)',
    fontVariantNumeric: 'tabular-nums',
  },
  dailyMineRank: { fontSize: 20, fontWeight: 700, color: 'var(--terminal-warning)' },
  dailyGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 5 },
  dailyMiniStat: {
    minWidth: 0, background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', borderRadius: 9,
    padding: '5px 3px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1,
  },
  dailyMiniValue: {
    fontSize: 10, fontWeight: 700, color: 'var(--terminal-text)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  dailyMiniLabel: {
    fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.35,
  },
  dailyList: { display: 'flex', flexDirection: 'column', gap: 5 },
  dailyPlayerRow: {
    display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) max-content',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--terminal-border)',
    borderRadius: 10,
    padding: '5px 7px',
  },
  dailyPlayerRank: {
    width: 24, height: 24, borderRadius: '50%', background: 'var(--terminal-text-muted)', color: 'var(--terminal-on-accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700,
  },
  dailyPlayerInfo: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  dailyPlayerName: {
    fontSize: 12, fontWeight: 700, color: 'var(--terminal-text)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  dailyPlayerMeta: {
    fontSize: 10, fontWeight: 600, color: 'var(--terminal-text-muted)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  dailyPlayerPoints: {
    fontSize: 12, fontWeight: 700, color: 'var(--terminal-long)',
    fontVariantNumeric: 'tabular-nums',
  },
  dailyEmpty: {
    textAlign: 'center', padding: 8, color: 'var(--terminal-text-muted)', fontSize: 11, fontWeight: 600,
    background: 'var(--terminal-surface)', border: '1px solid var(--terminal-border)', borderRadius: 9,
  },

  lbHeader: { fontSize: 13, fontWeight: 700, color: 'var(--terminal-text)', textTransform: 'uppercase', letterSpacing: 0.6, padding: '4px 2px 0' },
  lbList: { display: 'flex', flexDirection: 'column', gap: 5 },
  row: {
    display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr) max-content',
    alignItems: 'center', columnGap: 7, padding: '6px 8px',
    borderRadius: 12, boxSizing: 'border-box', width: '100%',
  },
  rank: {
    width: 26, height: 26, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, flexShrink: 0, justifySelf: 'center',
  },
  info: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  topDexBadge: {
    display: 'inline-block', marginLeft: 6, verticalAlign: 'middle',
    fontSize: 10, fontStyle: 'normal', fontWeight: 700, color: 'var(--terminal-info)',
    background: 'var(--terminal-info-soft)', border: '1px solid var(--terminal-info-border)', borderRadius: 6,
    padding: '1px 5px', textTransform: 'uppercase',
  },
  subRow: {
    display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--terminal-text-muted)',
    lineHeight: 1.22, overflowWrap: 'anywhere',
  },
  prizeText: { color: 'var(--terminal-long)', fontWeight: 700, whiteSpace: 'nowrap' },
  featured: {
    fontSize: 13, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1, justifySelf: 'end', textAlign: 'right', whiteSpace: 'nowrap',
  },
};
