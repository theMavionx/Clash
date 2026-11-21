import { useState } from 'react';
import { STRIKE_APP_URL } from '../../lib/strikeClient';

const money = value => `$${Number(value || 0).toFixed(2)}`;

/** Strike account tab: balances, Ethereum deposit / withdrawal, pending-action recovery. */
export default function StrikeAccountCard({ strike, styles = {}, onAlert = () => {} }) {
  const { account, loading, transferStep, pendingAction, inviteStatus } = strike;
  const [mode, setMode] = useState('deposit');
  const [asset, setAsset] = useState('USDC');
  const [amount, setAmount] = useState('');
  const minimum = Number(inviteStatus?.min_transfer_usd || 5);
  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--terminal-border)',
    background: 'var(--terminal-surface)', color: 'var(--terminal-text)', fontSize: 14 };
  const tab = selected => ({ ...(styles.btnSmall || {}), flex: 1, fontWeight: selected ? 700 : 400,
    borderColor: selected ? '#26fab0' : undefined, color: selected ? '#26fab0' : undefined });

  const submit = async () => {
    const value = Number(amount);
    if (!(value > 0)) { onAlert('Enter an amount.'); return; }
    if (mode === 'withdraw' && value < minimum) { onAlert(`The minimum Strike withdrawal is $${minimum}.`); return; }
    const result = mode === 'deposit' ? await strike.depositToStrike(amount, asset) : await strike.withdrawFromStrike(amount, asset);
    if (result?.error) onAlert(result.error);
    else { onAlert(result?.info || 'Done.'); setAmount(''); }
  };

  return <div style={{ ...(styles.fullCard || {}), display: 'grid', gap: 14 }}>
    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
      <img src="/strike-logo.png" alt="" width="22" height="22" style={{ borderRadius: 11 }} />Strike account
    </h3>
    <div>Wallet: {account?.address ? `${account.address.slice(0, 6)}…${account.address.slice(-4)}` : 'Checking…'} · builder clashofperps</div>
    <div>Equity: {money(account?.equity)}</div>
    <div>Available: {money(account?.free_collateral)}</div>
    <div>Wallet balance: {money(account?.wallet_balance)}</div>
    {pendingAction && <div role="alert">A Strike action is awaiting confirmation ({pendingAction.status || 'unknown'}{pendingAction.reason ? `: ${pendingAction.reason}` : ''}). New requests are blocked until its outcome is confirmed.{' '}
      <button style={styles.btnSmall} onClick={() => strike.reconcilePending().catch(reason => onAlert(reason.message))}>Check outcome</button>{' '}
      <button style={styles.btnSmall} onClick={async () => {
        if (!window.confirm('Check your Strike positions and open orders first. Dismissing does not resend or cancel anything; it only unblocks new actions. Dismiss?')) return;
        try { const r = await strike.dismissPendingAction(); if (r?.dismissed) onAlert('Pending Strike action dismissed. Positions and orders were refreshed; review them before trading.'); } catch (reason) { onAlert(reason.message); }
      }}>I checked my positions, dismiss</button></div>}

    <div style={{ display: 'grid', gap: 10, padding: 12, border: '1px solid var(--terminal-border)', borderRadius: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={tab(mode === 'deposit')} onClick={() => setMode('deposit')}>Deposit</button>
        <button type="button" style={tab(mode === 'withdraw')} onClick={() => setMode('withdraw')}>Withdraw</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {['USDC', 'ETH'].map(symbol => <button key={symbol} type="button" style={tab(asset === symbol)} onClick={() => setAsset(symbol)}>{symbol}</button>)}
      </div>
      <input style={input} inputMode="decimal" placeholder={mode === 'deposit' ? `Amount in ${asset}` : 'Amount in USD'} value={amount}
        onChange={event => setAmount(event.target.value.replace(/[^0-9.]/gu, ''))} aria-label={mode === 'deposit' ? `Deposit amount in ${asset}` : 'Withdrawal amount in USD'} />
      <button type="button" style={{ ...(styles.btnSmall || {}), padding: 10, fontWeight: 700 }} disabled={loading} onClick={submit}>
        {loading && transferStep ? transferStep : mode === 'deposit' ? `Deposit ${asset} from wallet` : `Withdraw as ${asset}`}
      </button>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
        {mode === 'deposit'
          ? `Sent from your linked wallet on Ethereum mainnet (gas in ETH). Minimum $${minimum}. Strike credits it after the required confirmations.`
          : `Paid to your linked wallet on Ethereum. Minimum $${minimum}, Strike charges a flat $1 fee. You sign the withdrawal in your wallet.`}
      </p>
    </div>

    <p style={{ margin: 0 }}>Gold, tasks and tournaments use verified fills of orders placed here. You can also manage funds on{' '}
      <a href={STRIKE_APP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--terminal-orange)' }}>app.strikefinance.org</a>.</p>
    <button style={styles.btnSmall} disabled={loading} onClick={async () => { try { await strike.disconnect(); } catch (reason) { onAlert(reason.message); } }}>Disconnect Strike key</button>
  </div>;
}
