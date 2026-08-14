import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = fs.readFileSync(new URL('./src/lib/decibel.js', import.meta.url), 'utf8');
const hook = fs.readFileSync(new URL('./src/hooks/useDecibel.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../server-futures/routes.js', import.meta.url), 'utf8');

assert.match(config, /VITE_DECIBEL_REFERRAL_CODE[\s\S]*\|\| 'NQSW0V'/);
assert.match(config, /https:\/\/app\.decibel\.trade\/r\/\$\{encodeURIComponent\(REFERRAL_CODE\)\}/);

assert.match(hook, /const ensureDecibelReferral = useCallback/);
assert.match(hook, /hasReferrer: referralStatus\?\.has_referrer \?\? null/);
assert.match(hook, /linkOurReferrer: linkDecibelReferral/);

const marketBlock = hook.slice(hook.indexOf('const placeMarketOrder'), hook.indexOf('const placeLimitOrder'));
const limitBlock = hook.slice(hook.indexOf('const placeLimitOrder'), hook.indexOf('const closePosition'));
const closeBlock = hook.slice(hook.indexOf('const closePosition'), hook.indexOf('const cancelOrder'));
assert.match(marketBlock, /await requireReferralForOpening\(\)/);
assert.match(limitBlock, /await requireReferralForOpening\(\)/);
assert.doesNotMatch(closeBlock, /requireReferralForOpening/);

assert.match(routes, /router\.get\('\/decibel\/referral'/);
assert.match(routes, /router\.post\('\/decibel\/referral\/redeem'/);
assert.match(routes, /if \(req\.body\?\.isReduceOnly !== true\) \{\s*await decibel\.requireDecibelReferral\(verified\.owner\);/);

assert.match(panel, /const hasDecibelRiskToManage = dex === 'decibel'/);
assert.match(panel, /hasReferrer !== true && hasDecibelRiskToManage/);
assert.match(panel, /Decibel referral is required for new trades/);
assert.match(panel, /display: \(dex === 'nado' \|\| dex === 'decibel'\) \? 'none'/);

console.log('DECIBEL_REFERRAL_UI_TEST_PASS');
