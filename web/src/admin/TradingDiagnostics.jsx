import { fmtTime, fmtUsd } from './tournamentUtils';

const count = value => Number(value || 0).toLocaleString('en-US');
const money = value => value == null ? 'Unknown' : fmtUsd(Number(value), 4);

function SignerCounts({ section, label }) {
  if (section?.status !== 'available') return <div>{label}: unavailable</div>;
  if (section.signer_evidence === 'not_recorded') return <div>{label}: signer evidence not recorded</div>;
  const rows = section.signer_breakdown || [];
  const total = mode => rows.filter(row => row.signer_mode === mode)
    .reduce((sum, row) => sum + Number(row.trades ?? row.orders ?? 0), 0);
  return <div>{label}: one-tap {count(total('one_tap'))} · owner {count(total('owner'))} · unknown {count(total('unknown'))}</div>;
}

function BuilderStatus({ row }) {
  const bulk = row.dex === 'bulk';
  return <>
    <div>Builder {bulk ? (row.builder_enabled ? 'enabled in config' : 'disabled') : `${row.builder_code || 'Unknown'} · ${row.builder_status || 'unverified'}`}</div>
    {bulk && <div>Effective fee {row.effective_builder_fee_bps ?? 'Unknown'} bps · configured target {row.builder_fee_bps ?? 'Unknown'} bps</div>}
    {bulk && <div style={{ overflowWrap: 'anywhere' }}>Recipient: {row.address || 'Unknown'}</div>}
    <div>Recipient readiness: {row.builder_recipient_readiness || 'unverified'} (not established by account setup)</div>
    <div>Builder-attributed indexed fills: {row.trades == null ? 'Unknown' : count(row.trades)} · {money(row.volume_usd)} volume</div>
    <div>Revenue: {row.exact ? `${money(row.earned_usd)} exact` : 'exact total unknown'}
      {row.estimated_fee_usd != null && ` · ${money(row.estimated_fee_usd)} estimate from builder-attributed fills`}</div>
  </>;
}

function GoldStatus({ rewards, claims }) {
  return <>
    {rewards?.status === 'available'
      ? <><div>Gold ledger: {count(rewards.paid_gold)} paid · {count(rewards.pending_gold)} pending · {count(rewards.earned_gold)} earned</div>
        <div>{count(rewards.accounts)} reward accounts · pending = earned storage overflow only</div></>
      : <div>Gold ledger unavailable</div>}
    {claims?.status === 'available'
      ? <><div>Claim attempts: {count(claims.attempts)} · last {claims.last_claim_at ? fmtTime(claims.last_claim_at) : 'none recorded'}</div>
        {claims.recent?.length > 0 && <div>Latest result: {claims.recent[0].result} · {count(claims.recent[0].credited_trade_count)} credited fills · {count(claims.recent[0].total_gold_paid)} Gold paid</div>}</>
      : <div>Claim telemetry unavailable</div>}
    <div>No claim record does not mean no eligible trades. Unclaimed-trade Gold is not estimated here.</div>
  </>;
}

/** Protected earnings diagnostics: execution proof, signer evidence, builder state and Gold. */
export default function TradingDiagnostics({ row }) {
  const data = row.trading_diagnostics;
  if (!data) return null;
  const fills = data.executions;
  return <details className="earnings-note">
    <summary style={{ cursor: 'pointer' }}>Trading / builder / Gold diagnostics</summary>
    <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
      <div>Read-only snapshot · {fmtTime(data.observed_at)}</div>
      {fills?.status === 'available'
        ? <div>Clash-routed verified fills: {count(fills.trades)} · {money(fills.volume_usd)} volume</div>
        : <div>Verified fill index unavailable</div>}
      <SignerCounts section={fills} label="Executed fills" />
      <div>Stored order proofs: {data.submissions?.status === 'available' ? count(data.submissions.orders) : 'unavailable'} (not fills)</div>
      <SignerCounts section={data.submissions} label="Submitted orders" />
      <BuilderStatus row={row} />
      <GoldStatus rewards={data.rewards} claims={data.claims} />
      <div>Counts do not submit, repair, import or claim anything.</div>
    </div>
  </details>;
}
