import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEX_CONFIG } from '../contexts/DexContext';
import attackIcon from '../assets/resources/file_000000006858720a8f860ee8da33335a.png';
import tournamentIcon from '../assets/resources/tournament-icon.png';
import './RankedAttackSelector.css';

const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TWITTER_HANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;

function formatCountdown(value) {
  const raw = String(value || '').trim().replace(' ', 'T');
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const target = Date.parse(normalized);
  if (!Number.isFinite(target)) return '';
  const remaining = Math.max(0, target - Date.now());
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatCompactUsd(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount.toFixed(Math.abs(amount) < 10 ? 2 : 0)}`;
}

function TournamentCard({
  tournament,
  activeDex,
  busyId,
  canAfford,
  attackCost,
  registration,
  onRegistrationChange,
  onJoin,
  onAttack,
}) {
  const isLive = tournament.phase === 'live';
  const isPreregistration = tournament.phase === 'preregistration';
  const me = tournament.me;
  const busy = busyId === tournament.id;
  const shield = me?.shield_until ? formatCountdown(me.shield_until) : '';
  const registrationCountdown = formatCountdown(
    tournament.registration_closes_at || tournament.start_at,
  );
  const canAttack = tournament.joined && tournament.can_attack && canAfford;
  const dexConfig = DEX_CONFIG[activeDex] || {};

  return (
    <section className="ranked-attack-mode ranked">
      <div className="ranked-attack-visual ranked">
        <img className="ranked-attack-hero tournament" src={tournamentIcon} alt="" />
        {dexConfig.logo && (
          <span className="ranked-attack-dex-mark" title={dexConfig.label}>
            <img src={dexConfig.logo} alt="" />
          </span>
        )}
        <span className={`ranked-attack-status ${isLive ? 'live' : 'prereg'}`}>
          {isLive ? 'Live' : 'Registration'}
        </span>
      </div>

      <div className="ranked-attack-content">
        <div className="ranked-attack-heading">
          <span>{isLive ? 'Tournament raid' : 'Pre-registration'}</span>
          <h3>{tournament.name}</h3>
          <p>
            Trade on {tournament.dex_label || dexConfig.label || activeDex?.toUpperCase()}
            {' '}and defend your island in one shared tournament.
          </p>
        </div>

        <div className="ranked-attack-metrics">
          <div>
            <span>Raid trophies</span>
            <strong>{me ? Number(me.trophies || 0) : '-'}</strong>
          </div>
          <div>
            <span>Attacks</span>
            <strong>
              {me
                ? `${me.attacks_used}/${me.daily_attack_limit}`
                : `0/${tournament.ranked_daily_attack_limit}`}
            </strong>
          </div>
          <div>
            <span>Defenses</span>
            <strong>
              {me
                ? `${me.defenses_used}/${me.max_defenses_per_day || 'unlimited'}`
                : '-'}
            </strong>
          </div>
        </div>

        {me && (
          <div className="ranked-attack-trading-strip">
            <span><b>{formatCompactUsd(me.volume_usd)}</b> volume</span>
            <span><b>{formatCompactUsd(me.pnl_usd)}</b> PnL</span>
            <span><b>{Number(me.gold || 0)}</b> gold</span>
          </div>
        )}

        <div className="ranked-attack-rules">
          <span>Attack <b>+{Number(me?.win_trophies || 30)}</b></span>
          <span>Defense <b>-{Number(me?.defense_loss_trophies || tournament.ranked_defense_loss_trophies || 3)}</b></span>
          <span>Shield <b>{Number(tournament.ranked_shield_hours || 0) > 0 ? `${tournament.ranked_shield_hours}h` : 'off'}</b></span>
          <span>
            Altar <b>{tournament.ranked_altar_bonus_enabled
              ? (Number(tournament.ranked_altar_bonus_cap || 0) > 0 ? `max +${tournament.ranked_altar_bonus_cap}` : 'on')
              : 'off'}</b>
          </span>
        </div>

        {shield && <div className="ranked-attack-notice">Tournament shield: {shield}</div>}

        {!tournament.joined && (tournament.registration_require_twitter || tournament.rewards_in_cop) && (
          <div className="ranked-attack-registration">
            {tournament.registration_require_twitter && (
              <label>
                <span>Twitter / X</span>
                <input
                  type="text"
                  value={registration.twitter_handle || ''}
                  placeholder="@handle"
                  autoComplete="off"
                  onChange={(event) => onRegistrationChange(tournament.id, { twitter_handle: event.target.value })}
                />
              </label>
            )}
            {tournament.rewards_in_cop && (
              <label>
                <span>CLASH reward wallet</span>
                <input
                  type="text"
                  value={registration.reward_wallet_solana || ''}
                  placeholder="Solana wallet"
                  autoComplete="off"
                  onChange={(event) => onRegistrationChange(tournament.id, { reward_wallet_solana: event.target.value })}
                />
              </label>
            )}
          </div>
        )}

        {!tournament.joined && (
          <button
            type="button"
            className="ranked-attack-primary"
            disabled={busy || !tournament.can_join}
            onClick={() => onJoin(tournament)}
          >
            {busy ? 'Joining...' : isPreregistration ? 'Register' : 'Join tournament'}
          </button>
        )}
        {tournament.joined && isLive && (
          <button
            type="button"
            className="ranked-attack-primary"
            disabled={busy || !canAttack}
            onClick={() => onAttack(tournament)}
          >
            {!canAfford
              ? `Need ${attackCost} gold`
              : tournament.can_attack
                ? `Find tournament opponent (${me.attacks_remaining} left)`
                : 'Daily attacks used'}
          </button>
        )}
        {tournament.joined && !isLive && (
          <button type="button" className="ranked-attack-primary" disabled>
            Starts in {formatCountdown(tournament.start_at)}
          </button>
        )}

        {isPreregistration && registrationCountdown && (
          <div className="ranked-attack-deadline">
            Registration closes in {registrationCountdown}
          </div>
        )}
      </div>
    </section>
  );
}

export default function RankedAttackSelector({
  tournaments = [],
  token,
  activeDex,
  attackCost = 300,
  canAfford = true,
  loading = false,
  error = '',
  onClose,
  onCasual,
  onRanked,
  onRefresh,
}) {
  const [busyId, setBusyId] = useState(null);
  const [joinError, setJoinError] = useState('');
  const [registrationByTournament, setRegistrationByTournament] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const ordered = useMemo(
    () => [...tournaments].sort(
      (a, b) => Number(b.joined) - Number(a.joined)
        || Number(b.phase === 'live') - Number(a.phase === 'live')
        || Number(a.id) - Number(b.id),
    ),
    [tournaments],
  );
  const selectedTournament = ordered.find((item) => Number(item.id) === Number(selectedId))
    || ordered[0]
    || null;
  const dexConfig = DEX_CONFIG[activeDex] || {};

  async function joinTournament(tournament) {
    if (!token || busyId) return;
    const registration = registrationByTournament[tournament.id] || {};
    const twitterHandle = String(registration.twitter_handle || '').trim();
    const rewardWallet = String(registration.reward_wallet_solana || '').trim();
    if (tournament.registration_require_twitter && !TWITTER_HANDLE_RE.test(twitterHandle)) {
      setJoinError('Enter a valid Twitter/X handle to register.');
      return;
    }
    if (tournament.rewards_in_cop && !SOLANA_WALLET_RE.test(rewardWallet)) {
      setJoinError('Enter a valid Solana wallet for CLASH rewards.');
      return;
    }
    setBusyId(tournament.id);
    setJoinError('');
    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-token': token },
        body: JSON.stringify({
          ...(twitterHandle ? { twitter_handle: twitterHandle } : {}),
          ...(rewardWallet ? { reward_wallet_solana: rewardWallet } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setJoinError(body.error || 'Could not join the tournament.');
        return;
      }
      await onRefresh?.();
    } catch (joinFailure) {
      setJoinError(joinFailure?.message || 'Could not join the tournament.');
    } finally {
      setBusyId(null);
    }
  }

  function updateRegistration(tournamentId, patch) {
    setRegistrationByTournament((current) => ({
      ...current,
      [tournamentId]: {
        ...(current[tournamentId] || {}),
        ...patch,
      },
    }));
  }

  if (typeof document === 'undefined') return null;

  return createPortal((
    <div
      className="ranked-attack-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ranked-attack-title"
      onClick={onClose}
    >
      <div className="ranked-attack-panel" onClick={(event) => event.stopPropagation()}>
        <header>
          <div className="ranked-attack-title-lockup">
            {dexConfig.logo && <img src={dexConfig.logo} alt="" />}
            <div>
              <span>{dexConfig.label || activeDex?.toUpperCase() || 'Active exchange'}</span>
              <h2 id="ranked-attack-title">Choose battle</h2>
            </div>
          </div>
          <button type="button" className="ranked-attack-close" aria-label="Close" onClick={onClose}>x</button>
        </header>

        {ordered.length > 1 && (
          <label className="ranked-attack-tournament-picker">
            <span>Tournament</span>
            <select value={selectedTournament?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>
              {ordered.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}

        <div className="ranked-attack-modes">
          <section className="ranked-attack-mode casual">
            <div className="ranked-attack-visual casual">
              <img className="ranked-attack-hero casual" src={attackIcon} alt="" />
              <span className="ranked-attack-status casual">Standard</span>
              <div className="ranked-attack-heading ranked-attack-casual-heading">
                <span>Regular matchmaking</span>
                <h3>Casual battle</h3>
                <p>Raid for account trophies with standard matchmaking and shield rules.</p>
              </div>
            </div>
            <div className="ranked-attack-content casual">
              <button
                type="button"
                className="ranked-attack-casual-button"
                disabled={!canAfford}
                onClick={onCasual}
              >
                <span>Find a match</span>
                <b>{attackCost} gold</b>
              </button>
            </div>
          </section>

          {loading && (
            <div className="ranked-attack-loading">
              <span />
              Loading {dexConfig.label || activeDex?.toUpperCase()} tournament...
            </div>
          )}
          {!loading && selectedTournament && (
            <TournamentCard
              tournament={selectedTournament}
              activeDex={activeDex}
              busyId={busyId}
              canAfford={canAfford}
              attackCost={attackCost}
              registration={registrationByTournament[selectedTournament.id] || {}}
              onRegistrationChange={updateRegistration}
              onJoin={joinTournament}
              onAttack={onRanked}
            />
          )}
          {!loading && !selectedTournament && (
            <section className="ranked-attack-mode ranked unavailable">
              <div className="ranked-attack-visual ranked">
                <img className="ranked-attack-hero tournament" src={tournamentIcon} alt="" />
              </div>
              <div className="ranked-attack-content">
                <div className="ranked-attack-heading">
                  <span>Tournament raid</span>
                  <h3>No active tournament</h3>
                  <p>Ranked raids will appear here when a tournament is running for this exchange.</p>
                </div>
              </div>
            </section>
          )}
        </div>

        {(error || joinError) && <div className="ranked-attack-error">{joinError || error}</div>}
      </div>
    </div>
  ), document.body);
}
