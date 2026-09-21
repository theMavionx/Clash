import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import '../dashboard/dashboard.css';
import './migration.css';
import { t, migrationErrorText, migrationStateText } from './strings';
import { expiryMs, formatUnits, validRequest } from './model';

async function api(path, token, body) {
  const response = await fetch('/api/migration' + path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(migrationErrorText(data.error)); error.migrationSafe = true; error.status = response.status; throw error; }
  return data;
}

function Migration() {
  const [status, setStatus] = useState(null), [account, setAccount] = useState(null), [session, setSession] = useState(null);
  const [amount, setAmount] = useState(''), [destination, setDestination] = useState(''), [quote, setQuote] = useState(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [now, setNow] = useState(Date.now());
  const [pendingSubmission, setPendingSubmission] = useState(null);
  const generation = useRef(0), provider = useRef(null), locked = useRef(false);
  const clear = () => { generation.current++; setSession(null); setAccount(null); setQuote(null); setConfirmed(false); setAmount(''); setPendingSubmission(null); };
  function failure(error) { if (error.status === 401) { clear(); setNotice(t('sessionExpired')); } else setNotice(error.migrationSafe ? error.message : error.code === 4001 ? t('verifyFailed') : t('failed')); }
  async function refresh(token = session?.token) {
    const epoch = generation.current;
    const next = await api('/status');
    if (epoch !== generation.current) return;
    setStatus(next);
    if (token) {
      const info = await api('/account', token);
      if (epoch !== generation.current) return;
      setAccount(info);
      setQuote(previous => {
        const row = info.requests?.find(item => item.id === previous?.id);
        if (previous && row && row.status !== 'quoted') { setConfirmed(false); setPendingSubmission(null); return null; }
        const restored = info.activeQuote;
        if (restored && expiryMs(restored.expiresAt) > Date.now()) {
          if (previous?.id !== restored.id) setConfirmed(false);
          return restored;
        }
        return previous;
      });
    }
  }
  useEffect(() => {
    let alive = true;
    api('/status').then(data => { if (alive) setStatus(data); }).catch(() => { if (alive) setNotice(t('failed')); });
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(clock); };
  }, []);
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => { refresh(session.token).catch(failure); }, 12000);
    return () => clearInterval(interval);
  }, [session]); // Wallet verification stays in memory only.
  useEffect(() => { if (session?.expiresAt && expiryMs(session.expiresAt) <= now) { clear(); setNotice(t('sessionExpired')); } }, [session, now]);
  useEffect(() => {
    const wallet = provider.current; if (!wallet) return;
    const changed = () => { clear(); setNotice(t('changed')); };
    wallet.on?.('accountChanged', changed); wallet.on?.('disconnect', changed);
    return () => { wallet.removeListener?.('accountChanged', changed); wallet.removeListener?.('disconnect', changed); };
  }, [session]);
  async function action(fn) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setNotice('');
    try { await fn(); } catch (error) { failure(error); } finally { locked.current = false; setBusy(false); }
  }
  async function connect(kind) {
    await action(async () => {
      clear();
      const wallet = kind === 'Phantom' ? window.phantom?.solana : window.solflare;
      if (!wallet?.signMessage || !wallet?.signTransaction) { setNotice(t('walletMissing')); return; }
      provider.current = wallet;
      await wallet.connect();
      const address = wallet.publicKey?.toBase58(); if (!address) throw new Error();
      const epoch = generation.current;
      const challenge = await api('/challenge', null, { wallet: address });
      const signed = await wallet.signMessage(new TextEncoder().encode(challenge.message), 'utf8');
      const auth = await api('/verify', null, { id: challenge.id, signature: Buffer.from(signed.signature || signed).toString('base64') });
      if (epoch !== generation.current || wallet.publicKey?.toBase58() !== address) return;
      setSession(auth); await refresh(auth.token);
    });
  }
  async function review(event) {
    event.preventDefault();
    if (!validRequest(amount, destination, account, status.sourceDecimals)) { setNotice(t('invalid')); return; }
    await action(async () => {
      const epoch = generation.current;
      const result = await api('/quote', session.token, { amount, destination, idempotencyKey: crypto.randomUUID() });
      if (epoch === generation.current) { setQuote(result); setConfirmed(false); }
    });
  }
  async function submit() {
    if (!confirmed || !quote || pendingSubmission) return;
    if (!(expiryMs(quote.expiresAt) > Date.now())) { setNotice(t('expired')); return; }
    await action(async () => {
      const epoch = generation.current, active = session, pending = quote;
      if (provider.current?.publicKey?.toBase58() !== active.wallet) { clear(); return; }
      const tx = Transaction.from(Buffer.from(pending.transaction, 'base64'));
      const signed = await provider.current.signTransaction(tx);
      if (epoch !== generation.current || provider.current?.publicKey?.toBase58() !== active.wallet) return;
      if (!(expiryMs(pending.expiresAt) > Date.now())) { setNotice(t('expired')); return; }
      const payload = { id: pending.id, transaction: Buffer.from(signed.serialize({ requireAllSignatures: false })).toString('base64') };
      setPendingSubmission(payload); setConfirmed(false);
      try { await api('/submit', active.token, payload); }
      catch (error) {
        if (error.status === 401) throw error;
        setNotice(t('checking'));
        await refresh(active.token);
        return;
      }
      if (epoch !== generation.current) return;
      setQuote(null); setPendingSubmission(null); setConfirmed(false); setNotice(t('submitted')); await refresh(active.token);
    });
  }
  async function retrySubmission() {
    if (!pendingSubmission) return;
    await action(async () => {
      await api('/submit', session.token, pendingSubmission);
      setQuote(null); setPendingSubmission(null); setConfirmed(false); setNotice(t('submitted')); await refresh();
    });
  }
  async function cancelQuote() {
    await action(async () => {
      await api('/cancel', session.token, { id: quote.id });
      setQuote(null); setPendingSubmission(null); setConfirmed(false); await refresh();
    });
  }
  const available = status?.enabled && status?.ready;
  const expired = quote && !(expiryMs(quote.expiresAt) > now);
  return <div className="dashboard-app migration-app">
    <a className="skip-link" href="#migration-main">Skip to migration</a>
    <header className="dashboard-header"><div className="dashboard-shell dashboard-header__inner"><a className="brand" href="/">{t('home')}</a><a href="/dashboard">{t('stats')}</a></div></header>
    <main id="migration-main" className="migration-shell">
      <p className="migration-eyebrow">{t('subtitle')}</p><h1>{t('title')}</h1><p className="migration-muted">{t('intro')}</p>
      <section className="migration-card" aria-label="Migration availability">
        <strong>{!status ? t('loading') : available ? t('ready') : t('paused')}</strong>
        <dl className="migration-facts"><div><dt>{t('ratio')}</dt><dd>1 : {status?.ratio || '1'}</dd></div><div><dt>{t('fee')}</dt><dd>${status?.feeUsd || '2'} · SOL</dd></div><div><dt>{t('snapshot')}</dt><dd>{status?.snapshot?.slot || t('unavailable')}</dd></div></dl>
        <p className="migration-muted">{t('custody')}</p>
      </section>
      <div role="status" aria-live="polite" className="migration-notice">{notice}</div>
      <section className="migration-card" aria-label="Migration form" aria-busy={busy}>
        {!session ? <><h2>{t('connect')}</h2><div className="migration-actions">{['Phantom', 'Solflare'].map(kind => <button key={kind} disabled={busy} onClick={() => connect(kind)}>{kind}</button>)}</div></> : <>
          <div className="migration-heading"><h2>{t('wallet')}</h2><button disabled={busy} onClick={() => { clear(); provider.current?.disconnect?.(); }}>{t('disconnect')}</button></div><code>{session.wallet}</code>
          <dl className="migration-facts">{['eligible', 'remaining', 'balance'].map((key, i) => <div key={key}><dt>{t(key)}</dt><dd>{formatUnits(account?.[['eligibleUnits','remainingUnits','balanceUnits'][i]], status?.sourceDecimals)} CLASH</dd></div>)}</dl>
          {!quote ? <form onSubmit={review}><label>{t('amount')}<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required disabled={busy || !available}/></label><label>{t('destination')}<input spellCheck="false" autoComplete="off" placeholder="0x…" value={destination} onChange={e => setDestination(e.target.value.trim())} required disabled={busy || !available}/></label><button className="migration-primary" disabled={busy || !available || !account || !validRequest(amount, destination, account, status?.sourceDecimals)}>{busy ? t('busy') : t('review')}</button></form> : <div className="migration-review">
            <h2>{t('review')}</h2><dl>{[[t('amount'), formatUnits(quote.inputUnits, status.sourceDecimals) + ' CLASH'], [t('receive'), formatUnits(quote.outputUnits, quote.targetDecimals) + ' CLASH'], [t('destination'), quote.destination], [t('source'), quote.sourceMint], [t('target'), quote.targetToken], [t('solFee'), formatUnits(quote.feeLamports, 9) + ' SOL'], [t('expires'), new Date(expiryMs(quote.expiresAt)).toLocaleString()]].map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
            <p className="migration-muted">{t('gas')}</p><label className="migration-checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/>{t('confirm')}</label>
            {expired && <p role="alert">{t('expired')}</p>}{pendingSubmission && <p role="status">{t('checking')}</p>}<div className="migration-actions">{pendingSubmission ? <button disabled={busy || !available} onClick={retrySubmission}>{t('retrySubmission')}</button> : <button className="migration-primary" disabled={busy || !confirmed || expired || !available} onClick={submit}>{busy ? t('busy') : t('send')}</button>}<button disabled={busy || !!pendingSubmission} onClick={cancelQuote}>{t('cancel')}</button></div>
          </div>}
        </>}
      </section>
      {session && <section className="migration-card"><div className="migration-heading"><h2>{t('history')}</h2><button disabled={busy} onClick={() => action(() => refresh())}>{t('refresh')}</button></div>{!account?.requests?.length ? <p className="migration-muted">{t('empty')}</p> : account.requests.map(row => <article className="migration-request" key={row.id}><strong>{formatUnits(row.inputUnits, status?.sourceDecimals)} CLASH → {formatUnits(row.outputUnits, row.targetDecimals)} CLASH</strong><p>{migrationStateText(row.status)}</p><code>{row.destination}</code><small>{row.id}</small>{row.depositHash && <a target="_blank" rel="noopener noreferrer" href={'https://solscan.io/tx/' + encodeURIComponent(row.depositHash)}>{t('deposit')}</a>}{row.payoutHash && <p>{t('payout')}: <code>{row.payoutHash}</code></p>}{row.errorCode && <p>{migrationErrorText(row.errorCode)}</p>}</article>)}</section>}
    </main>
  </div>;
}
createRoot(document.getElementById('migration-root')).render(<Migration/>);
