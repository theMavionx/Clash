/** Deterministic timer clock; React's immediate scheduling remains native. */
export function installClock(f) {
  const timeout = window.setTimeout.bind(window), cancel = window.clearTimeout.bind(window);
  const cancelInterval = window.clearInterval.bind(window);
  let now = 0, id = -1;
  const timers = new Map();
  const add = (fn, ms, interval) => { const key = id--; timers.set(key, { fn, at: now + ms, interval }); return key; };
  window.setTimeout = (fn, ms = 0, ...args) => ms < 1000 ? timeout(fn, ms, ...args) : add(() => fn(...args), ms, 0);
  window.clearTimeout = key => { timers.delete(key); cancel(key); };
  window.setInterval = (fn, ms, ...args) => add(() => fn(...args), ms, ms);
  window.clearInterval = key => { timers.delete(key); cancelInterval(key); };
  f.flush = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => timeout(resolve, 0)); };
  f.advance = async ms => {
    const target = now + ms;
    while (true) {
      const item = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!item) break;
      const [key, timer] = item; now = timer.at;
      if (timer.interval) timer.at += timer.interval; else timers.delete(key);
      timer.fn(); await f.flush();
    }
    now = target; await f.flush();
  };
}

/** Exercise the mounted venue hooks, not source-text assertions or copied callbacks. */
export async function runRewardTests(f) {
  const output = document.getElementById('results'); output.textContent = '';
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const pass = message => { output.textContent += `PASS ${message}\n`; };
  const claims = () => f.calls.filter(call => call.path.endsWith('/trading/claim-gold'));
  const switchTo = async changes => { Object.assign(f.identity, changes); f.render(); await f.flush(); };
  const trade = () => f.hook.placeMarketOrder('BTC', 'bid', 20, '.5', 1, { size_base: '.2', notional_usd: 20 });
  const addFill = (id, gold = 10) => f.fills.push({ dex: f.identity.dex, id, gold });
  try {
    await f.flush();
    for (const dex of ['bulk', 'imperial']) {
      await switchTo({ dex, token: `token-${dex}`, playerId: `player-${dex}` });
      const initial = claims().length;
      await f.advance(1500);
      assert(claims().length === initial + 1, `${dex}: initial claim missing/duplicated`);
      pass(`${dex}: automatic initial claim (StrictMode)`);
      await trade(); await f.flush();
      await f.advance(2500);
      const before = f.bridges.length;
      assert(!f.hook.goldEarned, `${dex}: accepted unfilled order displayed gold`);
      addFill(`${dex}-delayed`, 17);
      await f.advance(22_500);
      assert(f.bridges.length === before + 1, `${dex}: delayed fill not claimed`);
      assert(f.hook.goldEarned?.amount === 17, `${dex}: wrong toast amount`);
      assert(f.bridges.at(-1).data.gold === 17, `${dex}: bridge was not released gold`);
      assert(f.syncs.at(-1)?.data.gold === 777 && f.syncs.at(-1)?.data.wood === 888, `${dex}: authoritative resources not refreshed`);
      await f.hook.claimGold(); await f.hook.claimGold(); await f.flush();
      assert(f.bridges.length === before + 1, `${dex}: mock ledger paid same fill twice`);
      pass(`${dex}: accepted order → delayed fill → one server payout → correct toast/bridge`);
      pass(`${dex}: positive payout refreshes authoritative server resources`);
      f.hook.clearGoldEarned(); f.cap = true; addFill(`${dex}-cap`, 20);
      const syncs = f.syncs.length;
      const capped = await f.hook.claimGold(); await f.flush(); f.cap = false;
      assert(capped.pending_gold === 20 && !f.hook.goldEarned && f.bridges.length === before + 1, `${dex}: cap/pending produced false payout`);
      assert(f.syncs.length === syncs, `${dex}: pending-only reward refreshed resources as a payout`);
      pass(`${dex}: pending entitlement does not produce a payout toast`);
      f.reject = true; const count = claims().length;
      const rejected = await trade(); await f.flush();
      assert(rejected.error, `${dex}: rejection lost`);
      await f.advance(2500);
      assert(claims().length === count, `${dex}: rejected order scheduled a claim`);
      pass(`${dex}: rejected trade preserves error and schedules no reward catch-up`);
      f.claimError = true; const failed = await f.hook.claimGold();
      assert(failed === null, `${dex}: claim error leaked into action`);
      addFill(`${dex}-recovery`, 11); await f.advance(30_000);
      assert(f.hook.goldEarned?.amount === 11, `${dex}: polling did not recover after error`);
      pass(`${dex}: periodic claim recovers after server failure`);
      f.hold = true; const requests = claims().length;
      const a = f.hook.claimGold(), b = f.hook.claimGold();
      assert(a === b && claims().length === requests + 1, `${dex}: overlapping claim requests`);
      f.hold = false; f.pending.splice(0).forEach(release => release()); await a;
      pass(`${dex}: concurrent callers share one in-flight claim`);
    }
    for (const changes of [{ playerId: 'new-player' }, { token: 'new-token' },
      { wallet: 'Vote111111111111111111111111111111111111111' }, { dex: 'bulk' }]) {
      addFill(`stale-${JSON.stringify(changes)}`, 31);
      const before = f.bridges.length; f.hold = true; const pending = f.hook.claimGold();
      await switchTo(changes); f.hold = false; f.pending.splice(0).forEach(release => release());
      await pending; await f.flush();
      assert(f.bridges.length === before && !f.hook.goldEarned, `stale payout after ${JSON.stringify(changes)}`);
      pass(`stale response isolated across ${Object.keys(changes)[0]} change`);
    }
    await switchTo({ dex: 'imperial' });
    addFill('session-disconnected', 50); f.hold = true;
    const pending = f.hook.claimGold(), before = f.bridges.length;
    await f.hook.disconnect(); await f.flush(); f.hold = false;
    f.pending.splice(0).forEach(release => release()); await pending; await f.flush();
    assert(f.bridges.length === before, 'Disconnected Imperial session published stale gold');
    pass('Imperial session disconnect invalidates pending payout');
    await switchTo({ dex: 'bulk' });
    addFill('stale-resource-snapshot', 7); f.holdResources = true;
    const snapshotCount = f.syncs.length, resourceClaim = f.hook.claimGold(); await f.flush();
    assert(f.pendingResources.length === 1, 'Resource refresh did not start');
    await switchTo({ token: 'another-token' }); f.holdResources = false;
    f.pendingResources.splice(0).forEach(release => release()); await resourceClaim; await f.flush();
    assert(f.syncs.length === snapshotCount, 'Stale resource snapshot overwrote new account');
    pass('authoritative resource refresh is isolated across login changes');
    const count = claims().length; f.unmount(); await f.advance(60_000);
    assert(claims().length === count, 'Unmount left reward timers running');
    pass('unmount clears initial, poll and catch-up timers');
    assert(!f.calls.some(call => /\/(bulk\/import-fills|imperial\/import-trades)$/.test(call.path)), 'Duplicate client importer request');
    pass('claim path does not duplicate server reconciliation imports');
    output.textContent += 'ALL TESTS PASSED\n';
    f.result = { ok: true, claims: claims().length, notifications: f.bridges.length };
  } catch (error) {
    output.textContent += `FAIL ${error.stack || error}\n`; f.result = { ok: false, error: error.message };
  }
}
