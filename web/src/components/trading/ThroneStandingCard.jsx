import { useEffect, useState } from 'react';
import { fetchThroneJson } from '../../lib/throneClient';

const fmt = value => (Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString() : '-');
const SIDE_COLOR = { white: '#f3f4f6', black: '#111827' };

/** Read-only Throne arena standing (side, points, volume, season) for the trading address. */
export default function ThroneStandingCard({ address, token }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    if (!/^0x[0-9a-fA-F]{40}$/u.test(String(address || ''))) { setState({ loading: false, data: null, error: '' }); return undefined; }
    const controller = new AbortController();
    setState(previous => ({ ...previous, loading: true }));
    fetchThroneJson(`/api/futures/throne/standing?address=${encodeURIComponent(address)}`, { token, signal: controller.signal })
      .then(data => setState({ loading: false, data, error: '' }))
      .catch(reason => { if (reason?.name !== 'AbortError') setState({ loading: false, data: null, error: reason.message }); });
    return () => controller.abort();
  }, [address, token]);
  if (!address) return null;
  const quest = state.data?.quest || {}, season = state.data?.season || {};
  const side = String(quest.side || state.data?.side?.side || '').toLowerCase();
  return <div className="throne-standing" aria-label="Throne standing" style={{ border: '1px solid var(--terminal-border)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
      <strong>Throne board</strong>
      <span style={{ fontSize: 12, color: 'var(--terminal-text-muted)' }}>
        {season.state ? `Season ${season.season ?? ''} · week ${season.week ?? '-'}/${season.weeks ?? '-'} · ${season.state}` : ''}
      </span>
    </div>
    {state.loading && !state.data && <span style={{ fontSize: 12 }}>Loading standing…</span>}
    {state.error && <span role="alert" style={{ fontSize: 12 }}>{state.error}</span>}
    {state.data && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, fontSize: 13 }}>
      <div><div style={{ color: 'var(--terminal-text-muted)', fontSize: 11 }}>SIDE</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, border: '1px solid var(--terminal-border)', background: SIDE_COLOR[side] || 'transparent' }} />
          {side ? side[0].toUpperCase() + side.slice(1) : 'Not chosen'}</span></div>
      <div><div style={{ color: 'var(--terminal-text-muted)', fontSize: 11 }}>POINTS (WEEK)</div>{fmt(quest.pointsWeek)}</div>
      <div><div style={{ color: 'var(--terminal-text-muted)', fontSize: 11 }}>POINTS (SEASON)</div>{fmt(quest.points)}</div>
      <div><div style={{ color: 'var(--terminal-text-muted)', fontSize: 11 }}>VOLUME (WEEK)</div>${fmt(quest.tradedWeek)}</div>
      <div><div style={{ color: 'var(--terminal-text-muted)', fontSize: 11 }}>RANK</div>{quest.rank ?? '-'}{quest.piece ? ` · ${quest.piece}` : ''}</div>
    </div>}
    <a href="https://throne.network" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--terminal-orange)' }}>Open Throne board</a>
  </div>;
}
