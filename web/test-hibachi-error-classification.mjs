import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  HIBACHI_TRADING_PERMISSION_MESSAGE,
  isHibachiIpBlockedError,
  isHibachiRateLimitedError,
  isHibachiTradingPermissionError,
} from './src/lib/hibachiErrors.js';

test('Cloudflare Error 1015 is not presented as a geo restriction', () => {
  const error = {
    status: 429,
    code: 'HIBACHI_RATE_LIMITED',
    detail: 'Error 1015: You are being rate limited; cloudflare_error=true',
  };
  assert.equal(isHibachiRateLimitedError(error), true);
  assert.equal(isHibachiIpBlockedError(error), false);
});

test('only explicit Hibachi geo evidence produces the IP-region warning', () => {
  assert.equal(isHibachiIpBlockedError({ code: 'HIBACHI_IP_BLOCKED', status: 403 }), true);
  assert.equal(isHibachiIpBlockedError('Hibachi is not available from your IP address.'), true);
  assert.equal(isHibachiIpBlockedError({ status: 403, message: 'Cloudflare access denied' }), false);
  assert.equal(isHibachiIpBlockedError({ status: 401, message: 'Unauthorized' }), false);
});

test('missing Trading permission is actionable and distinct from invalid credentials', () => {
  const upstream = {
    status: 401,
    error: 'Hibachi /trade/order 401: Missing required permission: Trading',
  };
  assert.equal(isHibachiTradingPermissionError(upstream), true);
  assert.match(HIBACHI_TRADING_PERMISSION_MESSAGE, /Read-write > Trading/iu);
  assert.match(HIBACHI_TRADING_PERMISSION_MESSAGE, /Withdraws and Transfers are not required/iu);
  assert.equal(isHibachiIpBlockedError(upstream), false);
  assert.equal(isHibachiRateLimitedError(upstream), false);
});

test('the trading panel checks Hibachi rate limits before geo restrictions', async () => {
  const source = await readFile(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
  const rateIndex = source.indexOf('isHibachiRateLimitedError(message)');
  const geoIndex = source.indexOf('isHibachiIpBlockedError(message)');
  assert.ok(rateIndex >= 0 && geoIndex > rateIndex);
  assert.doesNotMatch(source.slice(geoIndex - 180, geoIndex + 180), /cloudflare|access denied/iu);
});

test('Hibachi setup requires an explicit Trading-permission confirmation', async () => {
  const source = await readFile(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
  assert.match(source, /Hibachi selects Read-only by default/iu);
  assert.match(source, /hibachiTradingPermissionConfirmed/iu);
  assert.match(source, /I enabled Read-write → Trading/iu);
});
