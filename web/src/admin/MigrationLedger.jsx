import { useEffect, useState } from 'react';
import { adminFetch } from './api';
import { formatUnits, formatUtc } from '../migration/model';
import { targetSymbol } from '../migration/target-asset';
import { migrationStateText } from '../migration/strings';

/** Wallet-verified migration history, not inferred game-account ownership. */
export default function MigrationLedger() {
  const [wallet, setWallet] = useState(''), [filter, setFilter] = useState('');
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let active = true;
    setLoading(true); setError(''); setData(null);
    adminFetch('/migration/admin/ledger?' + new URLSearchParams({ page, wallet: filter }), { signal: controller.signal })
      .then(next => { if (active) setData(next); })
      .catch(() => { if (active) setError('Ledger unavailable. Refresh or check your admin session; no transactions were changed.'); })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [filter, page, revision]);
  return <section className="card" aria-busy={loading}>
    <h3>Migration ledger</h3>
    <p>Every request is recorded by its verified Solana wallet. Quotes and submitted transactions are not counted as received funds. Confirmed fees are gross SOL collected, before network costs.</p>
    <form onSubmit={event => { event.preventDefault(); setFilter(wallet.trim()); setPage(1); setRevision(value => value + 1); }}>
      <label>Filter by Solana wallet<input value={wallet} onChange={event => setWallet(event.target.value)} placeholder="All wallets" spellCheck="false" autoComplete="off"/></label>
      <button className="btn" disabled={loading}>Apply filter</button>{' '}
      <button type="button" className="btn" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh ledger</button>
    </form>
    {loading && <p role="status">Loading ledger…</p>}{error && <p role="alert">{error}</p>}
    {data && <>
      <dl className="migration-ledger-summary">
        <div><dt>Wallets / requests</dt><dd>{data.summary.wallets} / {data.summary.requests}</dd></div>
        <div><dt>Confirmed CLASH received</dt><dd>{formatUnits(data.summary.confirmedInputUnits, 6)}</dd></div>
        <div><dt>Confirmed SOL fees collected</dt><dd>{formatUnits(data.summary.confirmedFeeLamports, 9)}</dd></div>
        <div><dt>Confirmed deposits / paid requests</dt><dd>{data.summary.confirmedDeposits} / {data.summary.paidRequests}</dd></div>
        {data.summary.payouts.map(asset => <div key={asset.targetToken + ':' + asset.decimals}><dt>Paid {targetSymbol(asset.targetToken)}</dt><dd>{formatUnits(asset.units, asset.decimals)}<small style={{ display: 'block', overflowWrap: 'anywhere' }}>{asset.targetToken}</small></dd></div>)}
      </dl>
      <div className="table-wrap"><table><thead><tr><th>Request / time</th><th>Verified sender / recipient</th><th>Amounts</th><th>State / confirmation</th><th>Transactions</th></tr></thead>
        <tbody>{data.requests.map(row => <tr key={row.id}>
          <td style={{ overflowWrap: 'anywhere', minWidth: 180 }}>{row.id}<br/>{formatUtc(row.createdAt)}</td>
          <td style={{ overflowWrap: 'anywhere', minWidth: 180 }}><strong>Solana</strong><br/>{row.wallet}<br/><strong>Robinhood</strong><br/>{row.destination}</td>
          <td style={{ minWidth: 160 }}>{formatUnits(row.inputUnits, 6)} CLASH<br/>→ {formatUnits(row.outputUnits, row.targetDecimals)} {targetSymbol(row.targetToken)}<br/>Fee: {formatUnits(row.feeLamports, 9)} SOL</td>
          <td style={{ minWidth: 200 }}>{migrationStateText(row.status)}<br/>Deposit: {row.depositedAt ? formatUtc(row.depositedAt) : 'Not confirmed'}<br/>Payout: {row.paidAt ? formatUtc(row.paidAt) : 'Not confirmed'}{row.errorCode && <p>{row.errorCode}</p>}</td>
          <td style={{ overflowWrap: 'anywhere', minWidth: 180 }}>{row.depositHash && <p>Deposit: <a href={'https://solscan.io/tx/' + encodeURIComponent(row.depositHash)} target="_blank" rel="noopener noreferrer">{row.depositHash}</a></p>}{row.payoutHash && <p>Payout: <code>{row.payoutHash}</code></p>}</td>
        </tr>)}</tbody></table></div>
      {!data.requests.length && <p>No requests match this filter.</p>}
      <p>Page {data.page} of {data.pages}. Totals include all matching pages.</p>
      <button className="btn" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous page</button>{' '}
      <button className="btn" disabled={loading || page >= data.pages} onClick={() => setPage(value => value + 1)}>Next page</button>
    </>}
  </section>;
}
