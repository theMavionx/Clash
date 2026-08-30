// Offline SDK compatibility check. Only api_key_prepare is dispatched.
// Native send_tx/check_client are deliberately unavailable in this harness.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { createLighterOnboarding } = require('./lighter-onboarding');
const python = process.env.LIGHTER_TEST_PYTHON;
test('official lighter-sdk creates a valid nonce-zero ChangePubKey without an L1 private key or send', {skip: !python}, async () => {
  const owner = '0x' + '12'.repeat(20);
  let nativeCalls = 0;
  const service = createLighterOnboarding({
    getProfile:()=>({dexId:'lighter',api:'https://mainnet.zklighter.elliot.ai',chainId:304}),
    request:async url => {
      if(url.includes('/account?'))return {accounts:[{index:42,l1_address:owner}]};
      if(url.includes('/apikeys?'))return {api_keys:[]};
      if(url.includes('/nextNonce?'))return {nonce:0};
      throw new Error('Unexpected network operation');
    },
    runSigner:async(action,payload)=>{
      assert.equal(action,'api_key_prepare');
      assert.equal(payload.nonce,0);
      nativeCalls++;
      const result=spawnSync(python,[path.join(__dirname,'lighter_signer.py')],{
        input:JSON.stringify({action,...payload}),encoding:'utf8',timeout:30000,windowsHide:true,
      });
      assert.equal(result.status,0,'Native preparation must succeed without network writes');
      return JSON.parse(result.stdout);
    },
  });
  const prepared=await service.prepare({playerId:'offline-native-test',wallet:owner,accountIndex:42});
  assert.equal(nativeCalls,1);
  assert.equal(prepared.apiKeyIndex,4);
  assert.equal(prepared.nonce,0);
  assert.match(prepared.credentials.apiPrivateKey,/^0x[0-9a-f]{80}$/iu);
  assert.match(prepared.publicKey,/^0x[0-9a-f]{80}$/iu);
  assert.match(prepared.message,/Register Lighter Account/);
  assert.match(prepared.message,/api key index: 0x0000000000000004/);
  assert.ok(prepared.transactionExpiresAt>Date.now());
});
