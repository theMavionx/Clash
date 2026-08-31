// LOCAL ONLY. Real vault UI, browser encryption and HTTP routes; fake in-memory players.
// All wallet keys are randomly generated throwaway fixtures. Never fund these wallets.
// No exchange SDK, production DB, environment secrets, RPC, or trading endpoint is loaded.
// Run: node tests/credential-vault-preview.mjs [--port=5193] or add --check for HTTP smoke.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const requireServer = createRequire(new URL('../../server/package.json', import.meta.url));
const express = requireServer('express'), Database = requireServer('better-sqlite3');
const { privateKeyToAccount } = requireServer('viem/accounts');
const { createTradingCredentialVault, createTradingCredentialSessionService, tradingCredentialId } = requireServer('./trading_credential_vault');
const { createTradingCredentialRouter, clearTradingCredentialSessionCookie, readTradingCredentialSessionCookie } = requireServer('./trading_credential_routes');
const { createTradingCredentialUnlockRouter } = requireServer('./trading_credential_unlock');
const catalog = requireServer('./trading_credential_catalog');
const check = process.argv.includes('--check');
const requestedPort = Number(process.argv.find(arg => arg.startsWith('--port='))?.slice(7) || 5193);
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) throw new Error('Use --port=1..65535');
const fixtureIds = ['fixture_A', 'fixture_B'];
const fixtureKeys = Object.fromEntries(fixtureIds.map(id => [id, `0x${crypto.randomBytes(32).toString('hex')}`]));
const fixtureSigners = Object.fromEntries(fixtureIds.map(id => [id, privateKeyToAccount(fixtureKeys[id])]));
const fixturePlayers = Object.fromEntries(fixtureIds.map((id, index) => [id, {
  id, player_id: id, name: `Fixture ${index ? 'B' : 'A'}`, token: `fixture-token-${id}-${crypto.randomUUID()}`,
  wallet: fixtureSigners[id].address.toLowerCase(), dex: 'hibachi',
}]));
const db = new Database(':memory:');
db.pragma('foreign_keys=ON');
db.exec('CREATE TABLE players(id TEXT PRIMARY KEY,token TEXT,wallet TEXT,name TEXT,is_bot INTEGER DEFAULT 0,is_guest INTEGER DEFAULT 0,banned_at TEXT)');
for (const player of Object.values(fixturePlayers)) db.prepare('INSERT INTO players(id,token,wallet,name) VALUES(?,?,?,?)').run(player.id, player.token, player.wallet, player.name);
const keyring = { activeKeyId: 'local-preview', keys: { 'local-preview': crypto.randomBytes(32).toString('hex') } };
const vault = createTradingCredentialVault({ db, catalog, keyring });
const sessions = createTradingCredentialSessionService({ db });
const authenticate = (req, res, next) => {
  const player = db.prepare('SELECT * FROM players WHERE token=? AND banned_at IS NULL').get(String(req.headers['x-token'] || ''));
  if (!player) return res.status(401).json({ error: 'Fixture player required' });
  req.player = player; next();
};
const options = { db, catalog, vault, sessions, authenticate, secureCookies: false, allowLocalOrigins: true };
const unlockRouter = createTradingCredentialUnlockRouter({ ...options, sessionService: sessions });
const app = express();
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['127.0.0.1', 'localhost'].includes(String(req.headers.host || '').split(':')[0])) return res.status(403).end();
  next();
});
app.post('/fixture/login', express.json({ limit: '4kb' }), (req, res) => {
  const player = fixturePlayers[req.body?.playerId];
  if (!player) return res.status(400).json({ error: 'Choose fixture_A or fixture_B' });
  if (req.body?.switchPlayer) {
    const oldCookie = readTradingCredentialSessionCookie(req, { secure: false });
    sessions.revoke(oldCookie);
    clearTradingCredentialSessionCookie(res, { secure: false });
  }
  // Deliberately never issues a vault capability. The real challenge UI must unlock.
  res.json({ player });
});
app.get('/fixture/summary', (_req, res) => {
  const records = db.prepare('SELECT player_id,credential_id,storage_key,revision,deleted,key_id,encrypted_secret FROM trading_credential_vault ORDER BY player_id,storage_key').all();
  const audit = db.prepare('SELECT player_id,action,COUNT(*) AS count FROM trading_credential_audit GROUP BY player_id,action').all();
  res.json({ memoryOnly: true, players: fixtureIds.map(id => ({ id, owners: sessions.owners(id).length })),
    records: records.map(row => ({ playerId: row.player_id, storageKey: row.storage_key, revision: row.revision,
      deleted: !!row.deleted, encrypted: !row.deleted && String(row.encrypted_secret).startsWith('gcm1:'), keyId: row.key_id })), audit });
});
app.use('/api/players/trading-credentials', unlockRouter);
app.use('/api/players/trading-credentials', createTradingCredentialRouter({ ...options,
  getIdentity: player => ({ playerId: player.id, loginWallet: player.wallet, wallets: sessions.owners(player.id) }),
  onSessionLogout: req => unlockRouter.revokePlayerChallenges(req.player.id),
}));
app.use('/api', (_req, res) => res.status(404).json({ error: 'No exchange or production API exists in this fixture' }));

const mockId = '/__credential-vault-context.jsx', entryId = '/__credential-vault-entry.jsx';
const mocks = `
import {useSyncExternalStore} from 'react';
import {privateKeyToAccount} from 'viem/accounts';
const keys=${JSON.stringify(fixtureKeys)};
const listeners=new Set(); let player=null;
export function usePlayer(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>player,()=>player)}
export const useFixturePlayer=usePlayer;
const wallets=Object.fromEntries(Object.entries(keys).map(([id,key])=>{
  const account=privateKeyToAccount(key);
  return [id,{address:account.address,walletClient:{account,signMessage:async args=>{
    if(!args.message.startsWith('Clash trading credential vault\\n')||!args.message.includes('Player: '+id+'\\n'))throw new Error('Fixture signer only signs its exact vault challenge');
    window.dispatchEvent(new CustomEvent('fixture:proof',{detail:{playerId:id}}));
    return account.signMessage({message:args.message});
  }}}];
}));
export function useEvmWallet(){const value=usePlayer();return wallets[value?.id]||{}}
export const useAptosWallet=()=>({});
export const useWallet=()=>({connected:false});
export const useOptionalPrivy=()=>({authenticated:false,enabled:false});
export async function selectFixturePlayer(id,switchPlayer=false){
  const response=await fetch('/fixture/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:id,switchPlayer})});
  if(!response.ok)throw new Error('Fixture login failed');
  const next=(await response.json()).player;
  window._playerToken=next.token;sessionStorage.setItem('clash_vault_preview_player',id);player=next;
  listeners.forEach(fn=>fn());return next;
}
`;
const entry = `
import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import CredentialVaultBoundary from '/src/components/CredentialVaultBoundary.jsx';
import {credentialVault,captureCredentialScope,assertCredentialScope,peekEncryptedCredential,writeEncryptedCredential,removeEncryptedCredential} from '/src/lib/encryptedCredentialStorage.js';
import {useFixturePlayer,selectFixturePlayer} from '${mockId}';
const realFetch=window.fetch.bind(window);
window.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url,location.origin);
  if(url.origin!==location.origin||!/^\\/(?:fixture\\/|api\\/players\\/trading-credentials)/.test(url.pathname))throw new Error('Fixture blocks non-vault/external fetch');
  return realFetch(input,options);
};
const key='clash_hibachi_credentials_v1',legacyKey='clash_grvt_credentials_v1';
const button={padding:'10px 14px',border:0,borderRadius:8,cursor:'pointer',background:'#f58230',color:'white',fontWeight:700};
const card={background:'#142033',border:'1px solid #3d526d',borderRadius:14,padding:18,margin:'16px 0'};
function useVault(){return useSyncExternalStore(credentialVault.subscribe,credentialVault.getSnapshot,credentialVault.getSnapshot)}
async function dropLocalDummyCache(playerId){
  const name='clash_player_credential_v1:'+playerId+':'+key;
  localStorage.removeItem('clash_encrypted_credential_mirror_v1:'+name);
  await new Promise((resolve,reject)=>{
    const request=indexedDB.open('clash_browser_credentials_v1',1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result;if(!db.objectStoreNames.contains('values')){db.close();resolve();return}
      const tx=db.transaction('values','readwrite');tx.objectStore('values').delete(name);
      tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};
    };
  });
  location.reload();
}
function TradingFixture(){
  const player=useFixturePlayer(),state=useVault();const [message,setMessage]=useState('');
  const current=peekEncryptedCredential(key);
  const act=async task=>{setMessage('Working…');try{await task();setMessage('Done')}catch(error){setMessage(error.message)}};
  return <section style={card} aria-label="Dummy trading panel"><h2>Dummy Hibachi connector</h2>
    <p id="fixture-credential">{current?'Dummy key available for '+player.name:'No dummy key for '+player.name}</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button style={button} disabled={!state.ready} onClick={()=>act(async()=>{const scope=captureCredentialScope();await writeEncryptedCredential(key,{apiKey:'LOCAL_DUMMY_'+player.id,accountId:'fixture-only',note:'No real trading credential'}, {scope});assertCredentialScope(scope)})}>Save dummy key</button>
      <button style={button} disabled={!state.ready} onClick={()=>act(()=>removeEncryptedCredential(key,{scope:captureCredentialScope()}))}>Forget dummy key</button>
      <button style={button} disabled={!state.unlocked||!current||state.pending>0} onClick={()=>act(()=>dropLocalDummyCache(player.id))}>Restore from server after cache drop</button>
    </div><p role="status">{message}</p><p style={{fontSize:12,color:'#aabbd0'}}>Only the current fixture player's encrypted dummy cache is removed by the restore test. Server records, owner bindings and other players are preserved.</p>
  </section>;
}
function App(){
  const player=useFixturePlayer(),state=useVault();const [summary,setSummary]=useState(null),[proofs,setProofs]=useState(0),[error,setError]=useState('');
  useEffect(()=>{const listener=()=>setProofs(n=>n+1);window.addEventListener('fixture:proof',listener);return()=>window.removeEventListener('fixture:proof',listener)},[]);
  const inspect=async()=>setSummary(await(await fetch('/fixture/summary')).json());
  const switchPlayer=async id=>{setError('');try{
    await fetch('/api/players/trading-credentials/session/logout',{method:'POST',headers:{'Content-Type':'application/json','x-token':player.token},body:'{}'});
    credentialVault.lock({revoke:false});await selectFixturePlayer(id,true);setSummary(null);
  }catch(e){setError(e.message)}};
  const seedLegacy=async()=>{localStorage.setItem(legacyKey,JSON.stringify({apiKey:'LOCAL_DUMMY_LEGACY_GRVT',subAccountId:'fixture-legacy'}));await credentialVault.refresh()};
  return <main style={{maxWidth:1000,margin:'auto',padding:'24px 24px 70px'}}>
    <p style={{color:'#ffcd87',fontWeight:700}}>LOCAL TEST ONLY · no exchange requests · no funds · memory-only database</p>
    <h1>Encrypted trading-key verification</h1><p>Actual Clash vault UI + browser adapter + HTTP authentication and AES-GCM storage.</p>
    <section style={card}><h2 id="fixture-player">{player.name}</h2><p style={{wordBreak:'break-all',fontSize:12}}>{player.wallet}</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={button} onClick={()=>switchPlayer('fixture_A')}>Switch to A</button><button style={button} onClick={()=>switchPlayer('fixture_B')}>Switch to B</button>
      <button style={button} onClick={()=>location.reload()}>Reload page</button><button style={button} onClick={()=>seedLegacy().catch(e=>setError(e.message))}>Seed older unscoped GRVT key</button><button style={button} onClick={inspect}>Inspect safe server metadata</button></div>
      <p id="fixture-vault-state">Phase: {state.phase} · unlocked: {String(state.unlocked)} · keys: {state.count} · pending: {state.pending}</p>
      <p>Signed fixture wallet proofs this page: {proofs} · vault cookie readable by JavaScript: {String(document.cookie.includes('clash_vault_dev='))}</p>
      {error&&<p role="alert">{error}</p>}
    </section>
    <CredentialVaultBoundary><TradingFixture/></CredentialVaultBoundary>
    {summary&&<section style={card}><h2>Safe server metadata</h2><pre id="fixture-server-metadata" style={{whiteSpace:'pre-wrap',fontSize:12}}>{JSON.stringify(summary,null,2)}</pre></section>}
    <section style={card}><h2>Suggested checks</h2><ol><li>Open Trading keys and verify the displayed fixture wallet.</li><li>Save the dummy key, then use the cache-drop restore test.</li><li>Switch to B: A's key must be absent. Verify B and save a distinct key.</li><li>Switch back to A and verify again: only A's key restores.</li><li>Forget a key, reload, and inspect its server tombstone.</li><li>Seed an older GRVT key: explicit import is required in Trading keys.</li></ol></section>
  </main>;
}
await selectFixturePlayer(sessionStorage.getItem('clash_vault_preview_player')||'fixture_A');
createRoot(document.getElementById('root')).render(<App/>);
`;
const aliases = new Set(['../hooks/useGodot', '../contexts/EvmWalletContext', '../contexts/AptosWalletContext', '../components/PrivyAuthProvider', '@solana/wallet-adapter-react']);
const fixturePlugin = {
  name: 'credential-vault-local-fixture', enforce: 'pre',
  resolveId(id, importer) {
    if ([mockId, entryId].includes(id)) return id;
    if (aliases.has(id) && /(?:CredentialVaultBoundary|useCredentialVaultUnlock)\.[jt]sx?$/.test(importer || '')) return mockId;
  },
  load(id) { if (id === mockId) return mocks; if (id === entryId) return entry; },
  configureServer(server) {
    server.middlewares.use(app);
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] !== '/') return next();
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws://127.0.0.1:*; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'");
      res.end(await server.transformIndexHtml('/', `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clash credential vault — LOCAL FIXTURE</title><style>body{margin:0;background:#091321;color:#eff5ff;font-family:Arial,sans-serif}button:disabled{opacity:.45;cursor:default}h1{font-size:28px}h2{font-size:19px}p,li{line-height:1.5}</style></head><body><div id="root"></div><script type="module" src="${entryId}"></script></body></html>`));
    });
  },
};
const server = await createServer({ root: webRoot, configFile: false, plugins: [fixturePlugin, react()],
  cacheDir: 'node_modules/.vite-credential-vault-preview',
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-dev-runtime', 'viem/accounts'] },
  server: { host: '127.0.0.1', port: requestedPort, strictPort: true },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
async function close() { await server.close(); db.close(); }
if (check) {
  try {
    const post = (path, token, body, cookie = '') => fetch(origin + path, { method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: origin, ...(token ? { 'x-token': token } : {}), ...(cookie ? { Cookie: cookie } : {}),
    }, body: JSON.stringify(body) });
    assert.equal((await fetch(origin)).status, 200);
    assert.equal((await fetch(origin + entryId)).status, 200);
    assert.equal((await fetch(origin + mockId)).status, 200);
    const boundarySource = await (await fetch(origin + '/src/components/CredentialVaultBoundary.jsx')).text();
    const unlockSource = await (await fetch(origin + '/src/hooks/useCredentialVaultUnlock.js')).text();
    assert.ok(boundarySource.includes(mockId), 'Boundary uses the fixture player context');
    assert.ok(unlockSource.includes(mockId), 'Unlock hook uses only fixture wallet contexts');
    const player = fixturePlayers.fixture_A, base = '/api/players/trading-credentials';
    const manifest = await (await fetch(origin + base, { headers: { 'x-token': player.token } })).json();
    assert.equal(manifest.unlocked, false);
    const challenge = await (await post(base + '/challenge', player.token, { wallet: player.wallet })).json();
    const signed = await fixtureSigners.fixture_A.signMessage({ message: challenge.message });
    const unlocked = await post(base + '/unlock', player.token, { challengeId: challenge.challengeId, signature: signed });
    assert.equal(unlocked.status, 200);
    const cookie = unlocked.headers.get('set-cookie').split(';')[0];
    const storageKey = 'clash_hibachi_credentials_v1', id = tradingCredentialId(storageKey);
    const response = await fetch(origin + base + '/' + id, { method: 'PUT', headers: {
      'Content-Type': 'application/json', Origin: origin, 'x-token': player.token, Cookie: cookie,
    }, body: JSON.stringify({ storageKey, value: { apiKey: 'LOCAL_DUMMY_CHECK' }, expectedRevision: 0, operationId: crypto.randomUUID() }) });
    assert.equal(response.status, 200);
    assert.equal((await post(base + '/restore', fixturePlayers.fixture_B.token, {}, cookie)).status, 403);
    const restored = await (await post(base + '/restore', player.token, {}, cookie)).json();
    assert.equal(restored.records[0].value.apiKey, 'LOCAL_DUMMY_CHECK');
    assert.equal(db.prepare('SELECT encrypted_secret FROM trading_credential_vault').get().encrypted_secret.includes('LOCAL_DUMMY_CHECK'), false);
    console.log('PASS local HTTP fixture: real wallet proof, HttpOnly cookie, encrypted save/restore, cross-player denial, Vite entry');
  } finally { await close(); }
} else {
  console.log(`LOCAL credential vault preview: ${origin}`);
  console.log('Fixture A/B only. Click Trading keys → Verify; no automatic vault unlock. Ctrl+C closes and destroys memory DB.');
  process.once('SIGINT', () => { void close().then(() => process.exit(0)); });
  process.once('SIGTERM', () => { void close().then(() => process.exit(0)); });
}
