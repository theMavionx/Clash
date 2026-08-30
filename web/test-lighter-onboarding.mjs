import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { connectLighterAccount, lighterCredentialMatches } from './src/lib/lighterOnboarding.js';
import { removeEncryptedCredentialNamespace } from './src/lib/encryptedCredentialStorage.js';

const wallet = '0x' + '12'.repeat(20);
const secret = '0x' + '34'.repeat(40);
function fixture(options = {}) {
  const pending = new Map(), saved = new Map(), retired = [];
  const calls = [];
  let current = true, signed = 0, clock = 1000;
  const challenge = index => ({
    owner: wallet, deployment: 'lighter', accountIndex: index, apiKeyIndex: 4, publicKey: '0x' + '56'.repeat(40),
    challengeId: 'challenge-' + index, message: 'Register key', expiresAt: 7000, transactionExpiresAt: 7000, nonce: 0,
    credentials: { accountIndex: index, apiKeyIndex: 4, apiPrivateKey: secret },
  });
  const input = {
    deployment: 'lighter', playerId: 'player-a', wallet, now: () => clock,
    assertCurrent: () => { if (!current) throw new Error('Wallet changed'); },
    signMessage: async () => { signed++; if (options.reject) throw Object.assign(new Error('User rejected'), {code:4001}); return '0xsignature'; },
    onStatus: status => calls.push('status:' + status),
    storage: {
      loadPending: async index => pending.get(index),
      savePending: async value => { calls.push('savePending'); if (!options.dropStorage) pending.set(value.accountIndex, structuredClone(value)); },
      clearPending: async index => pending.delete(index),
      retirePending: async value => retired.push(structuredClone(value)),
      loadCredentials: async index => index == null ? saved.values().next().value : saved.get(index),
      saveCredentials: async value => { calls.push('saveCredentials'); if (!options.dropFinal) saved.set(value.accountIndex, structuredClone(value)); },
    },
    api: async (path, body) => {
      calls.push(path);
      if (path.startsWith('/accounts?')) return { owner: options.wrongOwner ? '0x' + '99'.repeat(20) : wallet,
        deployment: 'lighter', accounts: options.accounts ?? [{accountIndex:42,kind:'main'}] };
      if (path === '/api-key/prepare') return challenge(body.accountIndex);
      if (path === '/api-key/submit') {
        if (options.expired) throw Object.assign(new Error('Expired'), {code:'LIGHTER_SETUP_EXPIRED'});
        if (options.timeout) throw new Error('Network timeout');
        const index = Number(body.challengeId.split('-')[1]);
        if (options.changeAtSubmit) current = false;
        return {ok:true,...challenge(index)};
      }
      if (path === '/api-key/recover') return options.recovery || {ok:false};
      if (path === '/credentials/check') return {ok:true};
      throw new Error('Unexpected path: ' + path);
    },
  };
  return { input, pending, saved, retired, calls, challenge, signed:()=>signed, change:()=>{current=false;}, setClock:value=>{clock=value;} };
}

test('no manual input: persists pending before signing/sending and saves confirmed credentials', async () => {
  const f = fixture();
  const result = await connectLighterAccount(f.input);
  assert.equal(result.credentials.apiPrivateKey, secret);
  assert.equal(result.credentials.onboardingPlayerId, 'player-a');
  assert.equal(f.signed(), 1);
  assert.equal(f.pending.size, 0);
  assert.equal(f.saved.size, 1);
  assert.ok(f.calls.indexOf('savePending') < f.calls.indexOf('status:signature'));
  assert.ok(f.calls.lastIndexOf('savePending') < f.calls.indexOf('/api-key/submit'));
});
test('multiple accounts require selection and do not generate a key', async () => {
  const f = fixture({accounts:[{accountIndex:42},{accountIndex:55}]});
  assert.equal((await connectLighterAccount(f.input)).requiresAccountSelection, true);
  assert.equal(f.signed(), 0);
  assert.ok(!f.calls.includes('/api-key/prepare'));
  f.input.accountIndex = 55;
  assert.equal((await connectLighterAccount(f.input)).credentials.accountIndex, 55);
});
test('empty account list and unowned selection cannot prepare/sign', async () => {
  for (const opts of [{accounts:[]}, {wrongOwner:true}]) {
    const f = fixture(opts);
    await assert.rejects(connectLighterAccount(f.input));
    assert.equal(f.signed(),0);
  }
  const f = fixture();
  await assert.rejects(connectLighterAccount({...f.input,accountIndex:999}), /owned/);
});
test('wallet rejection never submits, retained pending can retry without generating another key', async () => {
  const f = fixture({reject:true});
  await assert.rejects(connectLighterAccount(f.input), /User rejected/);
  assert.ok(!f.calls.includes('/api-key/submit'));
  assert.equal(f.pending.size,1);
  f.input.signMessage = async () => '0xretry';
  await connectLighterAccount(f.input);
  assert.equal(f.calls.filter(p=>p==='/api-key/prepare').length,1);
});
test('storage failure or silently discarded write prevents wallet signing', async () => {
  const f = fixture({dropStorage:true});
  await assert.rejects(connectLighterAccount(f.input), /storage/i);
  assert.equal(f.signed(),0);
  assert.ok(!f.calls.includes('/api-key/submit'));
});
test('login/wallet switch while signing stops before submitting', async () => {
  const f = fixture();
  f.input.signMessage = async () => { f.change(); return '0xsignature'; };
  await assert.rejects(connectLighterAccount(f.input), /Wallet changed/);
  assert.ok(!f.calls.includes('/api-key/submit'));
});
test('network timeout retains same signed key for reconcile-only retry', async () => {
  const options = {timeout:true}, f=fixture(options);
  await assert.rejects(connectLighterAccount(f.input), /timeout/);
  assert.equal(f.pending.get(42).signature,'0xsignature');
  options.timeout=false;
  await connectLighterAccount(f.input);
  assert.equal(f.signed(),1);
  assert.equal(f.calls.filter(p=>p==='/api-key/prepare').length,1);
});
test('server restart recovers a confirmed key without re-signing or recreating it', async () => {
  const f=fixture({expired:true,recovery:{ok:true}});
  const result=await connectLighterAccount(f.input);
  assert.equal(result.credentials.accountIndex,42);
  assert.ok(f.calls.includes('/api-key/recover'));
  assert.equal(f.pending.size,0);
});
test('absent key is not success and signed pending survives ambiguous expiry', async () => {
  const f=fixture({expired:true});
  await assert.rejects(connectLighterAccount(f.input), /not confirmed/);
  assert.equal(f.pending.size,1);
  assert.equal(f.saved.size,0);
  await assert.rejects(connectLighterAccount(f.input), /not confirmed/);
  assert.equal(f.signed(),1);
});
test('native expired registration needs fresh nonce/expiry checks and durable archive before renewal', async () => {
  const options={expired:true,recovery:{ok:false,nonce:0,checkedAt:90000}}, f=fixture(options);
  await assert.rejects(connectLighterAccount(f.input));
  f.setClock(90000);
  await assert.rejects(connectLighterAccount(f.input), /registration expired/);
  assert.equal(f.pending.size,0);
  assert.equal(f.retired.length,1);
  assert.equal(f.retired[0].credentials.apiPrivateKey,secret);
});
test('different-account concurrent attempts keep independent pending keys', async () => {
  const f=fixture({accounts:[{accountIndex:42},{accountIndex:55}],timeout:true});
  const results=await Promise.allSettled([42,55].map(accountIndex=>connectLighterAccount({...f.input,accountIndex})));
  assert.ok(results.every(r=>r.status==='rejected'));
  assert.equal(f.pending.size,2);
  assert.equal(f.pending.get(42).challengeId,'challenge-42');
  assert.equal(f.pending.get(55).challengeId,'challenge-55');
});
test('legacy and generated credentials reuse existing key without preparation', async () => {
  for (const metadata of [{}, {onboardingOwner:wallet,onboardingPlayerId:'player-a',onboardingDeployment:'lighter'}]) {
    const f=fixture();
    f.saved.set(42,{accountIndex:42,apiKeyIndex:9,apiPrivateKey:secret,...metadata});
    assert.equal((await connectLighterAccount(f.input)).credentials.apiKeyIndex,9);
    assert.ok(!f.calls.includes('/api-key/prepare'));
    assert.equal(f.signed(),0);
  }
});
test('new credentials never carry between player, owner or deployment', () => {
  const value={onboardingOwner:wallet,onboardingPlayerId:'player-a',onboardingDeployment:'lighter'};
  const scope={wallet,playerId:'player-a',deployment:'lighter'};
  assert.equal(lighterCredentialMatches(value,scope),true);
  for(const diff of [{wallet:'0x'+'ab'.repeat(20)},{playerId:'other'},{deployment:'rhlighter'}]) {
    assert.equal(lighterCredentialMatches(value,{...scope,...diff}),false);
  }
});
test('final storage failure retains pending recovery key', async () => {
  const f=fixture({dropFinal:true});
  await assert.rejects(connectLighterAccount(f.input),/Could not save/);
  assert.equal(f.pending.size,1);
});
test('late submit response after wallet change cannot replace saved credentials', async () => {
  const f=fixture({changeAtSubmit:true});
  await assert.rejects(connectLighterAccount(f.input),/Wallet changed/);
  assert.equal(f.saved.size,0);
  assert.equal(f.pending.size,1);
});
test('malformed challenge fails before saving/signing', async () => {
  const f=fixture(), api=f.input.api;
  f.input.api=async(path,body)=>path==='/api-key/prepare'? {...f.challenge(42),apiKeyIndex:1}:api(path,body);
  await assert.rejects(connectLighterAccount(f.input),/invalid connection/);
  assert.equal(f.signed(),0);
});
test('UI defaults to wallet flow and profile does not prompt for a Lighter private key', () => {
  const panel=fs.readFileSync(new URL('./src/components/FuturesPanel.jsx',import.meta.url),'utf8');
  const profile=fs.readFileSync(new URL('./src/components/ProfileModal.jsx',import.meta.url),'utf8');
  const hook=fs.readFileSync(new URL('./src/hooks/useLighter.js',import.meta.url),'utf8');
  assert.match(panel,/showLighterCredentialForm = lighterCredentialFormOpen/);
  assert.match(panel,/Advanced: use an existing API key/);
  assert.match(panel,/<LighterOneTapConnect/);
  assert.doesNotMatch(profile,/window\.prompt\(\`\$\{venue\} API private key/);
  assert.match(hook,/approveIntegrator\(verified, assertCurrent\)/);
  assert.match(hook,/acceptClashReferral\(verified, assertCurrent\)/);
  assert.match(hook,/refreshLatestRef\.current\?\.\(\)/);
  assert.match(hook,/value\.accountIndex\}:\$\{value\.challengeId/);
});

test('explicit clear removes all identity-scoped recovery copies, not master key or other wallets', async () => {
  const previous=globalThis.window;
  const prefix='clash_lighter_credentials_v1:one-tap:player-a:0x123:';
  const mirror='clash_encrypted_credential_mirror_v1:';
  const values=new Map([[mirror+prefix+'pending:42:c1','ciphertext'],[mirror+prefix+'account:42:key:4','ciphertext'],
    [mirror+'clash_lighter_credentials_v1:one-tap:other:0x456:pending:42','keep'],['clash_encrypted_credential_master_v2','keep']]);
  globalThis.window={localStorage:{get length(){return values.size;},key:index=>[...values.keys()][index],removeItem:key=>values.delete(key)}};
  try {
    await assert.rejects(removeEncryptedCredentialNamespace('clash:'),/specific/);
    await removeEncryptedCredentialNamespace(prefix);
    assert.equal(values.size,2);
    assert.ok(values.has('clash_encrypted_credential_master_v2'));
  } finally {globalThis.window=previous;}
});
