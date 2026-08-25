import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  isHibachiIpBlockedError,
  isHibachiRateLimitedError,
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

test('the trading panel checks Hibachi rate limits before geo restrictions', async () => {
  const source = await readFile(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
  const rateIndex = source.indexOf('isHibachiRateLimitedError(message)');
  const geoIndex = source.indexOf('isHibachiIpBlockedError(message)');
  assert.ok(rateIndex >= 0 && geoIndex > rateIndex);
  assert.doesNotMatch(source.slice(geoIndex - 180, geoIndex + 180), /cloudflare|access denied/iu);
});
