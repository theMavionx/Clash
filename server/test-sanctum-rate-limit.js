const assert = require('assert/strict');
const { createDualFixedWindowRateLimiter } = require('./sanctum_rate_limit');

let stamp = 1_000;
const limiter = createDualFixedWindowRateLimiter({
  windowMs: 60_000,
  playerMax: 2,
  ipMax: 3,
  now: () => stamp,
});

let upstreamCalls = 0;
function request(playerId, ip) {
  const result = limiter.check({ playerId, ip });
  if (result.ok) upstreamCalls += 1;
  return result;
}

assert.equal(request('player-a', '203.0.113.1').ok, true);
assert.equal(request('player-a', '203.0.113.1').ok, true);
const playerBlocked = request('player-a', '203.0.113.1');
assert.equal(playerBlocked.ok, false);
assert.equal(playerBlocked.retryAfterSec, 60);
assert.equal(upstreamCalls, 2, 'blocked player requests must not reach Sanctum upstream');

assert.equal(request('player-b', '203.0.113.2').ok, true);
assert.equal(request('player-c', '203.0.113.2').ok, true);
assert.equal(request('player-d', '203.0.113.2').ok, true);
const ipBlocked = request('player-e', '203.0.113.2');
assert.equal(ipBlocked.ok, false);
assert.equal(upstreamCalls, 5, 'blocked IP requests must not reach Sanctum upstream');

stamp += 60_001;
assert.equal(request('player-a', '203.0.113.1').ok, true, 'window reset must restore access');

console.log('Sanctum rate-limit tests passed: per-player and per-IP quotas block before upstream work.');
