'use strict';
const assert = require('node:assert/strict');
const express = require('express');
const { attachQfexRoutes } = require('./qfex-routes');

async function run() {
  const calls = [];
  const adapter = {
    credentials(input) {
      if (!input.publicKey || !input.secretKey) throw Object.assign(new Error('QFEX keys required'),{status:400,code:'QFEX_ERROR'});
      return input;
    },
    configStatus:()=>({dex:'qfex',builder_configured:false}),
    getMarkets:async()=>[{symbol:'BTC-USD'}],
    getAccountSnapshot:async()=>({account:{account_id:'verified'},positions:[],orders:[]}),
    placeOrder:async(creds,input,context)=>{calls.push({creds,input,context});return {success:true,action_id:input.actionId};},
    importTradesForPlayer:async(playerId)=>({player_id:playerId,imported:1}),
    getActionStatus:async(_creds,id)=>{
      if(id==='missing')throw Object.assign(new Error('QFEX action not found'),{status:404,code:'QFEX_ACTION_NOT_FOUND',account_id:'verified-account'});
      throw new Error('transport exposed secret-key-fixture');
    },
  };
  const router = express.Router();
  const auth = (req,res,next)=>{
    if(req.headers['x-token']!=='fixture-token')return res.status(401).json({error:'Unauthorized'});
    req.playerId='trusted-player'; req.dex=req.headers['x-dex']; next();
  };
  attachQfexRoutes(router,auth,adapter);
  const app=express();app.use(express.json());app.use('/api/futures',router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const url=`http://127.0.0.1:${server.address().port}/api/futures/qfex`;
  const headers={'x-token':'fixture-token','x-dex':'qfex','x-qfex-public-key':'public-fixture','x-qfex-secret-key':'secret-key-fixture','content-type':'application/json'};
  try {
    assert.equal((await fetch(url+'/config')).status,401);
    assert.equal((await fetch(url+'/config',{headers:{...headers,'x-dex':'etoro'}})).status,409);
    const publicData=await fetch(url+'/markets',{headers:{'x-token':'fixture-token','x-dex':'qfex'}});
    assert.equal(publicData.status,200);assert.equal(publicData.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(url+'/account-snapshot',{headers:{'x-token':'fixture-token','x-dex':'qfex'}})).status,400);
    const result=await fetch(url+'/orders',{method:'POST',headers,body:JSON.stringify({actionId:'uuid-fixture',playerId:'forged-player',symbol:'BTC-USD'})});
    assert.equal(result.status,200);assert.equal(calls[0].context.playerId,'trusted-player');
    assert.equal(calls[0].input.actionId,'uuid-fixture');
    const imported=await fetch(url+'/import-trades',{method:'POST',headers,body:'{"playerId":"forged-player"}'});
    assert.equal((await imported.json()).player_id,'trusted-player');
    const error=await fetch(url+'/actions/id',{headers});
    assert.equal(error.status,502);assert.ok(!(await error.text()).includes('secret-key-fixture'));
    const missing=await fetch(url+'/actions/missing',{headers});
    assert.equal(missing.status,404);
    assert.equal((await missing.json()).account_id,'verified-account');
    console.log('QFEX HTTP authentication, venue guard, scope, no-store and redaction PASS');
  }finally{await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
