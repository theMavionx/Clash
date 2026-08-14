import assert from 'node:assert/strict';
import fs from 'node:fs';

const hook = fs.readFileSync(new URL('./src/hooks/useLighter.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('./src/lib/lighterClient.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const context = fs.readFileSync(new URL('./src/contexts/DexContext.jsx', import.meta.url), 'utf8');
const quests = fs.readFileSync(new URL('./src/components/QuestsTab.jsx', import.meta.url), 'utf8');
const walletSelection = fs.readFileSync(new URL('./src/auth/walletSelection.js', import.meta.url), 'utf8');
const authFlow = fs.readFileSync(new URL('./src/auth/useAuthFlow.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./src/App.jsx', import.meta.url), 'utf8');
const tournamentUtils = fs.readFileSync(new URL('./src/admin/tournamentUtils.js', import.meta.url), 'utf8');
const registerPanel = fs.readFileSync(new URL('./src/components/RegisterPanel.jsx', import.meta.url), 'utf8');

assert.match(client, /RH_LIGHTER_BROWSER_API/);
assert.match(client, /https:\/\/api\.rh\.lighter\.xyz/);
assert.match(hook, /dexId:\s*'rhlighter'/);
assert.match(hook, /routePrefix:\s*'rh-lighter'/);
assert.match(hook, /storageKey:\s*'clash_rh_lighter_credentials_v1'/);
assert.match(hook, /referralRequired:\s*true/);
assert.match(hook, /VITE_RH_LIGHTER_REFERRAL_CODE/);
assert.match(hook, /'CLASSHOFPERPS'/);
assert.match(hook, /venueConfig\?\.integratorReady === true/);
assert.match(panel, /dex === 'rhlighter'/);
assert.match(panel, /Robinhood Lighter/);
assert.match(context, /rhlighter:\s*\{/);
assert.match(context, /if \(DEX_CONFIG\[j\.dex\]\)/);
assert.match(quests, /x-rh-lighter-account-index/);
assert.match(quests, /x-rh-lighter-auth-token/);
assert.match(walletSelection, /'lighter', 'rhlighter'/);
assert.match(authFlow, /authDex === 'rhlighter' \? 'rhlighter'/);
assert.match(app, /dex === 'rhlighter'/);
assert.match(tournamentUtils, /rhlighter:\s*'Robinhood Lighter'/);
assert.match(registerPanel, /cfg\.id === 'lighter' \|\| cfg\.id === 'rhlighter' \? 'SELF-CUSTODY · EVM'/);
assert.match(registerPanel, /applies CLASSHOFPERPS/);
assert.doesNotMatch(hook, /clash_rh_lighter_credentials_v1[\s\S]{0,500}'CLASHOFPERPS'/);

console.log('Robinhood Lighter browser integration source contract passed');
