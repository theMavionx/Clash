import { useEffect, useState } from 'react';
import { adminFetch } from './api';
import MigrationLedger from './MigrationLedger';
import '../migration/admin.css';
import { migrationErrorText, migrationStateText } from '../migration/strings';
import { formatUtc as utcTime, snapshotUtcIso } from '../migration/model';
import { deriveSolanaHexKey, previewSolanaHexAddress } from '../migration/solana-key-preview';
import { deriveSolanaMnemonic, previewSolanaMnemonic, solanaMnemonicPath } from '../migration/solana-mnemonic';

const fields = [
  ['targetToken', 'Robinhood payout token contract (chain 4663)', 'text'], ['ratio', 'Payout tokens per source CLASH (0.001 = 1000 CLASH for 1 token)', 'text'],
  ['feeUsd', 'Service fee (USD)', 'number'], ['batchUsd', 'Normal sale batch (USD)', 'number'],
  ['idleSeconds', 'Residual sale delay (seconds)', 'number'], ['residualUsd', 'Residual batch maximum (USD)', 'number'],
  ['slippageBps', 'Initial slippage (basis points)', 'number'], ['maxSlippageBps', 'Maximum slippage (≤ 1000 basis points)', 'number'],
];
function configPayload(config) {
  return Object.fromEntries(['enabled', ...fields.map(([name]) => name)].map(name => [name,
    name === 'enabled' ? !!config[name] : ['idleSeconds', 'slippageBps', 'maxSlippageBps'].includes(name) ? Number(config[name]) : String(config[name] ?? '')]));
}
export default function MigrationAdmin() {
  const [data, setData] = useState(null), [config, setConfig] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [kind, setKind] = useState('solana'), [secret, setSecret] = useState(''), [snapshotConfirm, setSnapshotConfirm] = useState(false);
  const [snapshotAt, setSnapshotAt] = useState('');
  const [accountIndex, setAccountIndex] = useState('0');
  const derivedMode = kind === 'solanaHex' || kind === 'solanaMnemonic';
  const [previewAddress, setPreviewAddress] = useState(''), [previewConfirmed, setPreviewConfirmed] = useState(false), [credentialNotice, setCredentialNotice] = useState('');
  function resetPreview() { setPreviewAddress(''); setPreviewConfirmed(false); setCredentialNotice(''); }
  function previewSolana() {
    resetPreview();
    try { setPreviewAddress(kind === 'solanaMnemonic' ? previewSolanaMnemonic(secret, accountIndex) : previewSolanaHexAddress(secret.trim())); }
    catch { setCredentialNotice(kind === 'solanaMnemonic' ? 'Enter 12 valid English BIP39 words (including checksum) and an account index from 0 to 9999. Nothing was saved.' : 'Enter a valid 32-byte hex key to preview its Solana address. Nothing was saved.'); }
  }
  function storeCredential(event) {
    event.preventDefault();
    if (busy || !secret.trim()) return;
    let value = secret.trim();
    if (derivedMode) {
      if (!previewAddress || !previewConfirmed) return;
      try {
        const derived = kind === 'solanaMnemonic' ? deriveSolanaMnemonic(value, accountIndex) : deriveSolanaHexKey(value);
        if (derived.address !== previewAddress) { resetPreview(); setCredentialNotice('The key changed. Preview and confirm the address again.'); return; }
        value = derived.secret;
      } catch { resetPreview(); setCredentialNotice('The key could not be derived. Nothing was saved.'); return; }
    }
    if (!window.confirm('Save this credential? Active settlements may prevent wallet rotation.')) return;
    setSecret(''); resetPreview();
    run('/keys', { kind: derivedMode ? 'solana' : kind, secret: value });
  }
  const selectedUtc = snapshotUtcIso(snapshotAt);
  const snapshotLocked = !data || data.canReplaceSnapshot === false;
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
      {data && <><p><strong>{data.config?.enabled ? 'Enabled' : 'Paused'} · {data.readiness?.ready ? 'Ready' : 'Not ready'}</strong></p><ul>{(data.readiness?.reasons || []).map((reason, i) => <li key={i}>{typeof reason === 'string' ? reason : reason.code || 'Readiness check failed'}</li>)}</ul><p>Robinhood treasury requires inventory of the configured payout token and ETH gas. SOL collected on Solana cannot directly pay Robinhood gas.</p><button className="btn danger" disabled={busy || !data.config?.enabled} onClick={() => run('/config', { enabled: false }, 'PUT')}>Pause new migrations</button></>}
    </section>
    {config && <section className="card"><h3>Configuration</h3><p>Updates apply to new quotes only. Existing requests retain their recipient, token and conversion ratio.</p><form onSubmit={e => { e.preventDefault(); if (window.confirm('Apply migration configuration? Enabling permits real deposits, payouts and automated sales once all readiness checks pass.')) run('/config', configPayload(config), 'PUT'); }}>
      <div className="form-grid">{fields.map(([name, label, type]) => <label key={name}>{label}<input type={type} required value={config[name] ?? ''} disabled={busy} min={type === 'number' ? 0 : undefined} max={name.includes('Slippage') || name === 'slippageBps' ? 1000 : undefined} step="any" onChange={e => setConfig({ ...config, [name]: ['idleSeconds', 'slippageBps', 'maxSlippageBps'].includes(name) ? Number(e.target.value) : e.target.value })}/></label>)}</div>
      <label><input type="checkbox" checked={!!config.enabled} disabled={busy} onChange={e => setConfig({ ...config, enabled: e.target.checked })}/> Enable migrations and automated settlement when ready</label><p>Sales settle into SOL. Every new sale requires at least $100 estimated input value, including residual batches. Simulation starts at the smaller of 0.5% and the configured initial slippage, and never exceeds the configured maximum (at most 10%). Unknown transaction outcomes are reconciled, not blindly retried.</p><button className="btn primary" disabled={busy}>Save configuration</button>
    </form></section>}
    <section className="card"><h3>Treasury credentials</h3><p>Dedicated migration wallets only. Credentials are write-only. Recovery phrases are processed locally only in the explicit 12-word mode; only the selected Solana private key is sent for encrypted storage. Never use your main wallet recovery phrase.</p><dl><dt>Solana treasury</dt><dd style={{ overflowWrap: 'anywhere' }}>{data?.wallets?.solana?.address || data?.wallets?.solana || 'Not configured'}</dd><dt>Robinhood treasury</dt><dd style={{ overflowWrap: 'anywhere' }}>{data?.wallets?.evm?.address || data?.wallets?.evm || 'Not configured'}</dd></dl>
      <p>Robinhood Alchemy API key: {data?.wallets?.robinhoodRpc ? 'Configured' : 'Not configured'}. Enable Robinhood Chain mainnet in your paid Alchemy app. Enter the raw API key, not an RPC URL. Public-node fallback is not used.</p>
      <form autoComplete="off" onSubmit={storeCredential}>
        <label>Credential<select value={kind} disabled={busy} onChange={e => { setKind(e.target.value); setSecret(''); setAccountIndex('0'); resetPreview(); }}>
          <option value="solana">Solana private key</option>
          <option value="solanaHex">Solana from 32-byte hex (explicit derivation)</option>
          <option value="solanaMnemonic">Solana from 12-word recovery phrase</option>
          <option value="evm">Robinhood EVM private key</option><option value="jupiter">Jupiter API key</option><option value="robinhoodRpc">Robinhood Alchemy API key</option>
        </select></label>
        {kind === 'solanaHex' && <p>This derives a Solana address from these bytes. It is not a conversion of your Ethereum account and may differ from MetaMask’s Solana address. This does not transfer existing funds or recover MetaMask’s Solana account. Compare the address below with your existing Solana address before saving.</p>}
        {kind === 'solanaMnemonic' && <>
          <p>12 English BIP39 words, without an extra BIP39 passphrase. Account 0 is the first account. Compare the full preview address with your wallet before saving; other derivation paths are not supported here.</p>
          <label>Solana account index<input type="number" min="0" max="9999" step="1" value={accountIndex} disabled={busy} onChange={e => { setAccountIndex(e.target.value); resetPreview(); }}/></label>
          <p>Derivation path: <code>{/^(0|[1-9][0-9]{0,3})$/.test(accountIndex) ? solanaMnemonicPath(accountIndex) : 'Select a valid account index'}</code></p>
        </>}
        <label>New secret<input type="password" autoComplete="new-password" autoCapitalize="none" value={secret} disabled={busy} onChange={e => { setSecret(e.target.value); resetPreview(); }} required spellCheck="false"/></label>
        {derivedMode && <><button type="button" className="btn" disabled={busy || !secret.trim()} onClick={previewSolana}>Preview Solana address</button>{previewAddress && <><p>Derived Solana address: <code style={{ overflowWrap: 'anywhere' }}>{previewAddress}</code></p><label><input type="checkbox" checked={previewConfirmed} disabled={busy} onChange={e => setPreviewConfirmed(e.target.checked)}/> I checked this Solana address and want to use it as the treasury.</label></>}</>}
        <div role="status" aria-live="polite">{credentialNotice}</div><button className="btn" disabled={busy || !secret.trim() || (derivedMode && (!previewAddress || !previewConfirmed))}>Store encrypted credential</button>
      </form>
    </section>
    <section className="card"><h3>Eligibility snapshot</h3>{data?.snapshot ? <><p>{data.snapshot.requestedAt != null ? 'Snapshot cutoff' : 'Captured at'}: {utcTime(data.snapshot.requestedAt ?? data.snapshot.createdAt)}</p><p>Finalized slot {data.snapshot.slot}{data.snapshot.blockTime != null ? ` · Block time ${utcTime(data.snapshot.blockTime)}` : ''}</p><p>{data.snapshot.wallets} {data.snapshot.mode === 'historical' ? 'wallets evaluated so far (not all holders)' : 'wallets captured'}</p></> : <p>No snapshot cutoff saved. Select a past UTC date and time to determine eligible balances.</p>}<p>The snapshot is immutable once migration requests exist. Later purchases never increase a wallet’s allocation.</p>
      <form onSubmit={event => { event.preventDefault(); const at = snapshotUtcIso(snapshotAt); if (busy || snapshotLocked || !snapshotConfirm || !at) return; setSnapshotConfirm(false); run('/snapshot', { confirm: true, at }); }}>
        <label>Snapshot cutoff (UTC)<input type="datetime-local" required step="60" max={new Date().toISOString().slice(0, 16)} value={snapshotAt} disabled={busy || snapshotLocked} aria-describedby="migration-snapshot-help migration-snapshot-preview" aria-invalid={!!snapshotAt && !selectedUtc} onChange={event => { setSnapshotAt(event.target.value); setSnapshotConfirm(false); }}/></label>
        <p id="migration-snapshot-help">Enter UTC, not your device’s local time. The cutoff must be in the past and finalized on Solana.</p>
        <p id="migration-snapshot-preview" aria-live="polite">{selectedUtc ? `Selected cutoff: ${utcTime(selectedUtc)}` : snapshotAt ? 'Choose a valid past UTC date and time. Future dates cannot be saved.' : 'Select a UTC cutoff to continue.'}</p>
        <label><input type="checkbox" checked={snapshotConfirm} disabled={busy || snapshotLocked || !selectedUtc} onChange={e => setSnapshotConfirm(e.target.checked)}/> I confirm the selected UTC cutoff defines eligible wallets.</label>
        <button className="btn" disabled={busy || snapshotLocked || !selectedUtc || !snapshotConfirm}>Save snapshot cutoff</button>
      </form>
    </section>
    <section className="card"><h3>Settlement</h3><p>Reconcile existing transactions and run one safe worker pass. This may send real payouts or sales when enabled.</p><button className="btn" disabled={busy} onClick={() => { if (window.confirm('Run a settlement pass? This can send real transactions.')) run('/tick', {}); }}>Run reconciliation</button></section>
    <MigrationLedger/>
    {['sales', 'audit'].map(name => <section className="card" key={name}><h3>{name === 'sales' ? 'Solana sales' : 'Audit events'}</h3>{!data?.[name]?.length ? <p>No records.</p> : <div className="table-wrap"><table><thead><tr><th>ID</th><th>Status / event</th><th>Time</th><th>Reference</th></tr></thead><tbody>{data[name].map((row, i) => <tr key={row.id || i}><td>{row.id || '—'}</td><td>{row.status ? migrationStateText(row.status) : row.event || row.action}</td><td>{utcTime(row.createdAt || row.created_at || row.at)}</td><td style={{ overflowWrap: 'anywhere', maxWidth: 380 }}>{row.hash || row.errorCode || '—'}</td></tr>)}</tbody></table></div>}</section>)}
  </div>;
}
