import { useCallback, useEffect, useState } from 'react';
import {
  claimClashHolderGold, createHolderWalletAuthProof, getClashHolderStatus,
  linkClashHolderWallet, refreshClashHolderStatus,
} from '../lib/clashHolderRewards';
import './ClashHolderGoldTab.css';

const fmt = value => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—';

export default function ClashHolderGoldTab({ evmWallet, evmAddress, onConnect, sessionToken,
  onClaimReadyChange, onResourcesChanged }) {
  const [reward, setReward] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!sessionToken) return;
    if (!quiet) setLoading(true);
    try { setReward(await getClashHolderStatus(sessionToken)); }
    catch (e) { if (!quiet) setError(e?.message || 'Could not load holder rewards'); }
    finally { if (!quiet) setLoading(false); }
  }, [sessionToken]);

  useEffect(() => {
    let active = true;
    if (sessionToken) getClashHolderStatus(sessionToken).then(result => {
      if (active) { setReward(result); setLoading(false); }
    }).catch(e => { if (active) { setError(e?.message || 'Could not load holder rewards'); setLoading(false); } });
    const timer = setInterval(() => { if (active && sessionToken) load(true); }, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [load, sessionToken]);

  useEffect(() => { onClaimReadyChange?.(Number(reward?.claimable_now || 0) > 0); }, [onClaimReadyChange, reward?.claimable_now]);

  const linkWallet = async () => {
    if (!evmAddress) { onConnect?.(); return; }
    if (!sessionToken) { setError('Game session is not ready.'); return; }
    setBusy('link'); setError(''); setNotice('');
    try {
      const client = evmWallet?.getWalletClient?.(4663) || evmWallet?.walletClient;
      const proof = await createHolderWalletAuthProof(evmAddress, client);
      const result = await linkClashHolderWallet(sessionToken, evmAddress, proof);
      setReward(result.reward);
      setNotice(result.sample_warning || 'Wallet verified. Your CLASH holding is sampled automatically.');
    } catch (e) { setError(e?.message || 'Could not verify this wallet'); }
    finally { setBusy(''); }
  };

  const refresh = async () => {
    setBusy('refresh'); setError(''); setNotice('');
    try {
      const result = await refreshClashHolderStatus(sessionToken);
      setReward(result.reward);
      setNotice('Robinhood balance checked. The lowest daily holding determines the reward.');
    } catch (e) { setError(e?.message || 'Could not refresh the holding'); }
    finally { setBusy(''); }
  };

  const claim = async () => {
    setBusy('claim'); setError(''); setNotice('');
    try {
      const result = await claimClashHolderGold(sessionToken);
      setReward(result.reward);
      if (result.resources) {
        window.onGodotMessage?.({ action: 'resources', data: result.resources });
        try { window.godotBridge?.(JSON.stringify({ action: 'set_resources', data: result.resources })); }
        catch { /* Browser-only sessions have no Godot bridge. */ }
        onResourcesChanged?.(result.resources, Number(result.claimed_gold || 0));
      }
      setNotice(`${fmt(result.claimed_gold)} Gold claimed.${Number(result.reward?.pending_gold || 0) ? ' The rest remains banked until you have storage space.' : ''}`);
    } catch (e) { setError(e?.message || 'Could not claim Gold'); }
    finally { setBusy(''); }
  };

  const pending = Number(reward?.pending_gold || 0);
  const claimable = Number(reward?.claimable_now || 0);
  const today = reward?.today;
  const sameWallet = !!(evmAddress && reward?.wallet?.toLowerCase() === evmAddress.toLowerCase());
  return <section className="clash-holder" aria-label="CLASH holder daily Gold">
    <div className="clash-holder__hero">
      <div className="clash-holder__brand"><img src="/clashofperps.PNG" alt=""/><span>ROBINHOOD · CLASH</span></div>
      <h2>Hold CLASH. Claim Gold.</h2>
      <p>Keep CLASH in your verified Robinhood wallet. Each completed UTC day unlocks a Gold reward based on your lowest sampled holding.</p>
      <div className="clash-holder__reset"><span>Daily reset</span><strong>00:00 UTC</strong></div>
    </div>

    <div className="clash-holder__tiers" aria-label="Daily CLASH holder Gold tiers">
      {[[50,1000],[100,5000],[500,10000]].map(([usd,gold]) => <div key={usd} className="clash-holder__tier">
        <span>${fmt(usd)}+ held</span><strong>{fmt(gold)}</strong><small>Gold / day</small>
      </div>)}
    </div>

    {error && <div className="clash-holder__alert" role="alert">{error}</div>}
    {notice && <div className="clash-holder__notice" role="status">{notice}</div>}
    {loading ? <div className="clash-holder__state">Checking your rewards…</div> : <>
      <div className="clash-holder__wallet">
        <div><span>Reward wallet</span><strong>{reward?.linked ? short(reward.wallet) : 'Not linked yet'}</strong>
          <small>{reward?.linked ? (sameWallet ? 'Connected and verified' : 'Verified for this Clash account') : 'A one-time wallet signature proves ownership. No token approval or transfer.'}</small>
        </div>
        <button type="button" className="clash-holder__secondary" disabled={!!busy} onClick={linkWallet}>
          {!evmAddress ? 'Connect wallet' : reward?.linked && sameWallet ? 'Reverify' : 'Verify wallet'}
        </button>
      </div>

      <div className="clash-holder__summary">
        <div><span>Today’s lowest observed value</span><strong>{today ? `$${fmt(today.minimum_usd)}` : 'Waiting for first check'}</strong>
          <small>{today ? `${today.sample_count} check${today.sample_count === 1 ? '' : 's'} today · up to ${fmt(today.projected_gold)} Gold if coverage completes` : 'Link a wallet to start daily checks'}</small>
        </div>
        <button type="button" className="clash-holder__refresh" onClick={refresh} disabled={!!busy || !reward?.linked}>
          {busy === 'refresh' ? 'Checking…' : 'Check balance'}
        </button>
      </div>

      <div className="clash-holder__claim">
        <span>Ready to claim</span><strong>{fmt(pending)} <small>Gold</small></strong>
        <p>{pending > claimable ? `${fmt(claimable)} fits in your Gold storage now; the remainder stays banked.` :
          pending ? 'Earned from completed UTC days.' : 'Your first reward becomes available after an eligible UTC day ends.'}</p>
        <button type="button" disabled={!!busy || claimable <= 0} onClick={claim}>{busy === 'claim' ? 'Claiming…' : 'Claim Gold'}</button>
      </div>
      {!!reward?.recent?.length && <div className="clash-holder__history"><h3>Recent days</h3>
        {reward.recent.map(day => <div key={day.reward_day_utc}><span>{day.reward_day_utc}</span><strong>${fmt(day.minimum_usd_micros / 1e6)}</strong><span>{fmt(day.reward_gold)} Gold</span><small>{day.status === 'claimed' ? 'Claimed' : day.status === 'ready' ? 'Ready' : day.status === 'insufficient' ? 'Few checks' : 'Below tier'}</small></div>)}
      </div>}
    </>}
    <p className="clash-holder__fineprint">Robinhood CLASH only. The server checks on-chain balance and CLASH/USD price about every 30 minutes. The lowest observed USD value over a sufficiently covered UTC day sets its tier; changing or briefly borrowing tokens does not increase an already lower daily value. Gold is an in-game resource, not cash.</p>
  </section>;
}
