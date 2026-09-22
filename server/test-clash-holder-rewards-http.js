"use strict";

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-holder-http-'));
const dbPath = path.join(dir, 'clash.db');
process.env.CLASH_MAIN_DB = dbPath;
process.env.NODE_ENV = 'test';
const db = require('./db');
const { router, clashHolderRewardsService } = require('./routes');

(async () => {
  const { privateKeyToAccount } = await import('viem/accounts');
  const account = privateKeyToAccount(`0x${crypto.randomBytes(32).toString('hex')}`);
  const player = db.registerPlayer(`holder_http_${crypto.randomBytes(3).toString('hex')}`);
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/clash-holder/rewards`;
  const call = async (route, token, body) => {
    const response = await fetch(`${base}${route}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(token ? { 'x-token': token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await call('/status')).status, 401);
    assert.equal((await call('/status', player.token)).data.linked, false);
    const issuedAt = new Date().toISOString();
    const message = ['Clash wallet auth', 'Action: wallet-auth', `Wallet: ${account.address.toLowerCase()}`,
      'DEX: robinhood', `Issued At: ${issuedAt}`].join('\n');
    const signature = await account.signMessage({ message });
    const bad = await call('/link-wallet', player.token, { wallet: account.address,
      auth_proof: { action: 'wallet-auth', chain_type: 'evm', dex: 'robinhood', issued_at: issuedAt,
        message, signature: `0x${'00'.repeat(65)}` } });
    assert.equal(bad.status, 401, 'invalid wallet signature cannot link');
    assert.equal((await call('/status', player.token)).data.linked, false);

    assert.ok(db.db.prepare("SELECT name FROM sqlite_master WHERE name = 'clash_holder_wallets'").get());

    // No live RPC in this local HTTP test. Linking is still durable when a
    // transient read fails; the scheduler will retry independently.
    const originalRead = clashHolderRewardsService.recordObservation;
    clashHolderRewardsService.recordObservation = async () => { throw new Error('test upstream unavailable'); };
    const linked = await call('/link-wallet', player.token, { wallet: account.address,
      auth_proof: { action: 'wallet-auth', chain_type: 'evm', dex: 'robinhood', issued_at: issuedAt,
        message, signature } });
    clashHolderRewardsService.recordObservation = originalRead;
    if (linked.status !== 200) {
      try { clashHolderRewardsService.status({ playerId: player.id }); }
      catch (error) { console.error('Local holder status diagnostic:', error.stack); }
      console.error('Local link response:', linked);
    }
    assert.equal(linked.status, 200);
    assert.equal(linked.data.reward.wallet, account.address.toLowerCase());
    assert.ok(linked.data.sample_warning);

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    db.db.prepare(`INSERT INTO clash_holder_daily_rewards
      (player_id, wallet, reward_day_utc, minimum_usd_micros, sample_count, reward_gold, status)
      VALUES (?, ?, ?, 50000000, 12, 1000, 'ready')`)
      .run(player.id, account.address.toLowerCase(), yesterday);
    const goldBefore = db.db.prepare('SELECT gold FROM players WHERE id = ?').get(player.id).gold;
    const claim = await call('/claim', player.token, {});
    if (claim.status !== 200) {
      try { clashHolderRewardsService.claim({ playerId: player.id }); }
      catch (error) { console.error('Local claim diagnostic:', error.stack); }
      console.error('Local claim response:', claim);
    }
    assert.equal(claim.status, 200);
    assert.equal(claim.data.claimed_gold, 1000);
    assert.equal(claim.data.resources.gold, goldBefore + 1000);
    assert.equal((await call('/claim', player.token, {})).status, 409);
    assert.equal(db.db.prepare('SELECT gold FROM players WHERE id = ?').get(player.id).gold, goldBefore + 1000);
    console.log('CLASH holder HTTP PASS: authenticated status, signed wallet ownership, invalid-proof rejection and exactly-once claim');
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(dir);
  }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
