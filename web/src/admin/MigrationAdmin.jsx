import { useEffect, useState } from 'react';
import { adminFetch } from './api';
import '../migration/admin.css';
import { migrationErrorText, migrationStateText } from '../migration/strings';
import { expiryMs } from '../migration/model';

const fields = [
  ['targetToken', 'Robinhood CLASH contract (chain 4663)', 'text'], ['ratio', 'CLASH received per source CLASH', 'text'],
  ['feeUsd', 'Service fee (USD)', 'number'], ['batchUsd', 'Normal sale batch (USD)', 'number'],
  ['idleSeconds', 'Residual sale delay (seconds)', 'number'], ['residualUsd', 'Residual batch maximum (USD)', 'number'],
  ['slippageBps', 'Initial slippage (basis points)', 'number'], ['maxSlippageBps', 'Maximum slippage (≤ 1000 basis points)', 'number'],
];
function configPayload(config) {
  return Object.fromEntries(['enabled', ...fields.map(([name]) => name)].map(name => [name,
    name === 'enabled' ? !!config[name] : ['idleSeconds', 'slippageBps', 'maxSlippageBps'].includes(name) ? Number(config[name]) : String(config[name] ?? '')]));
}
function utcTime(value) { const date = new Date(expiryMs(value)); return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace('.000Z', ' UTC') : '—'; }
export default function MigrationAdmin() {
  const [data, setData] = useState(null), [config, setConfig] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [kind, setKind] = useState('solana'), [secret, setSecret] = useState(''), [snapshotConfirm, setSnapshotConfirm] = useState(false);
  async function load() {
    const next = await adminFetch('/migration/admin'); setData(next); setConfig(next.config);
  }
  useEffect(() => { load().catch(() => setNotice('Unable to load migration status. Check your admin session.')); }, []);
  async function run(path, body, method = 'POST') {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await adminFetch('/migration/admin' + path, { body, method }); setNotice('Saved. Readiness and settlement status refreshed.'); await load(); }
    catch (error) { setNotice(migrationErrorText(error.data?.error)); }
    finally { setBusy(false); }
  }
  return <div className="admin-grid migration-admin" aria-busy={busy}>
    <section className="card"><h2>CLASH migration</h2><p>Solana → Robinhood mainnet · Chain 4663 · Existing token supply: 1,000,000,000 CLASH</p><p><a href="/migration" target="_blank" rel="noopener noreferrer">Open public migration page</a></p><div role="status" aria-live="polite">{notice}</div>
      <button className="btn" disabled={busy} onClick={() => load().catch(() => setNotice('Refresh failed.'))}>Refresh status</button>
      {data && <><p><strong>{data.config?.enabled ? 'Enabled' : 'Paused'} · {data.readiness?.ready ? 'Ready' : 'Not ready'}</strong></p><ul>{(data.readiness?.reasons || []).map((reason, i) => <li key={i}>{typeof reason === 'string' ? reason : reason.code || 'Readiness check failed'}</li>)}</ul><p>Robinhood treasury requires CLASH inventory and ETH gas. SOL collected on Solana cannot directly pay Robinhood gas.</p><button className="btn danger" disabled={busy || !data.config?.enabled} onClick={() => run('/config', { enabled: false }, 'PUT')}>Pause new migrations</button></>}
    </section>
    {config && <section className="card"><h3>Configuration</h3><p>Updates apply to new quotes only. Existing requests retain their recipient, token and conversion ratio.</p><form onSubmit={e => { e.preventDefault(); if (window.confirm('Apply migration configuration? Enabling permits real deposits, payouts and automated sales once all readiness checks pass.')) run('/config', configPayload(config), 'PUT'); }}>
      <div className="form-grid">{fields.map(([name, label, type]) => <label key={name}>{label}<input type={type} required value={config[name] ?? ''} disabled={busy} min={type === 'number' ? 0 : undefined} max={name.includes('Slippage') || name === 'slippageBps' ? 1000 : undefined} step="any" onChange={e => setConfig({ ...config, [name]: ['idleSeconds', 'slippageBps', 'maxSlippageBps'].includes(name) ? Number(e.target.value) : e.target.value })}/></label>)}</div>
      <label><input type="checkbox" checked={!!config.enabled} disabled={busy} onChange={e => setConfig({ ...config, enabled: e.target.checked })}/> Enable migrations and automated settlement when ready</label><p>Sales settle into SOL. Slippage starts at 5% by default and is capped at 10%. Unknown transaction outcomes are reconciled, not blindly retried.</p><button className="btn primary" disabled={busy}>Save configuration</button>
    </form></section>}
    <section className="card"><h3>Treasury credentials</h3><p>Dedicated migration wallets only. Private keys are write-only; never enter a seed phrase. Existing admin authentication is used.</p><dl><dt>Solana treasury</dt><dd style={{ overflowWrap: 'anywhere' }}>{data?.wallets?.solana?.address || data?.wallets?.solana || 'Not configured'}</dd><dt>Robinhood treasury</dt><dd style={{ overflowWrap: 'anywhere' }}>{data?.wallets?.evm?.address || data?.wallets?.evm || 'Not configured'}</dd></dl>
      <p>Robinhood Alchemy API key: {data?.wallets?.robinhoodRpc ? 'Configured' : 'Not configured'}. Enable Robinhood Chain mainnet in your paid Alchemy app. Enter the raw API key, not an RPC URL. Public-node fallback is not used.</p>
      <form autoComplete="off" onSubmit={e => { e.preventDefault(); if (!secret.trim()) return; if (!window.confirm('Save this credential? Active settlements may prevent wallet rotation.')) return; const value = secret.trim(); setSecret(''); run('/keys', { kind, secret: value }); }}><label>Credential<select value={kind} disabled={busy} onChange={e => { setKind(e.target.value); setSecret(''); }}><option value="solana">Solana private key</option><option value="evm">Robinhood EVM private key</option><option value="jupiter">Jupiter API key</option><option value="robinhoodRpc">Robinhood Alchemy API key</option></select></label><label>New secret<input type="password" autoComplete="new-password" value={secret} disabled={busy} onChange={e => setSecret(e.target.value)} required spellCheck="false"/></label><button className="btn" disabled={busy || !secret.trim()}>Store encrypted credential</button></form>
    </section>
    <section className="card"><h3>Eligibility snapshot</h3>{data?.snapshot ? <p>Finalized slot {data.snapshot.slot} · {data.snapshot.wallets} wallets · {utcTime(data.snapshot.createdAt)}</p> : <p>No snapshot captured. Capture uses current finalized on-chain balances, not a historical date.</p>}<p>The snapshot is immutable once migration requests exist. Later purchases never increase a wallet’s allocation.</p><label><input type="checkbox" checked={snapshotConfirm} disabled={busy || (!!data?.snapshot && !data?.canReplaceSnapshot)} onChange={e => setSnapshotConfirm(e.target.checked)}/> I confirm this current finalized snapshot defines eligible wallets.</label><button className="btn" disabled={busy || !snapshotConfirm || (!!data?.snapshot && !data?.canReplaceSnapshot)} onClick={() => { setSnapshotConfirm(false); run('/snapshot', { confirm: true }); }}>Capture snapshot</button></section>
    <section className="card"><h3>Settlement</h3><p>Reconcile existing transactions and run one safe worker pass. This may send real payouts or sales when enabled.</p><button className="btn" disabled={busy} onClick={() => { if (window.confirm('Run a settlement pass? This can send real transactions.')) run('/tick', {}); }}>Run reconciliation</button></section>
    {['requests', 'sales', 'audit'].map(name => <section className="card" key={name}><h3>{name === 'requests' ? 'Migration requests' : name === 'sales' ? 'Solana sales' : 'Audit events'}</h3>{!data?.[name]?.length ? <p>No records.</p> : <div className="table-wrap"><table><thead><tr><th>ID</th><th>Status / event</th><th>Time</th><th>Reference</th></tr></thead><tbody>{data[name].map((row, i) => <tr key={row.id || i}><td>{row.id || '—'}</td><td>{row.status ? migrationStateText(row.status) : row.event || row.action}</td><td>{utcTime(row.createdAt || row.created_at || row.at)}</td><td style={{ overflowWrap: 'anywhere', maxWidth: 380 }}>{row.payoutHash || row.depositHash || row.hash || row.wallet || row.errorCode || '—'}</td></tr>)}</tbody></table></div>}</section>)}
  </div>;
}
