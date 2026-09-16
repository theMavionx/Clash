'use strict';
// Isolated synthetic failure benchmark; loopback only, no real credentials.
const http = require('node:http');
const {once} = require('node:events');
const {performance} = require('node:perf_hooks');
async function main() {
  const sockets = new Set();
  const server = http.createServer((_req,res)=>setTimeout(()=>{res.setHeader('content-type','application/json');res.end('{"orders":[]}');},30));
  server.on('upgrade',(_req,socket)=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  process.env.HIBACHI_API_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.HIBACHI_WS_ENABLED = 'true';
  process.env.HIBACHI_PROXY_FILE = '';
  process.env.HIBACHI_PROXIES = '';
  let hibachi;
  if (process.argv.includes('--baseline')) {
    const Module = require('node:module');
    const path = require('node:path');
    const baseline = new Module(require.resolve('./hibachi'));
    baseline.filename = require.resolve('./hibachi');
    baseline.paths = Module._nodeModulePaths(__dirname);
    const source = require('node:child_process').execFileSync('git',['show','HEAD:server-futures/hibachi.js'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
    baseline._compile(source,baseline.filename); hibachi = baseline.exports;
  } else hibachi = require('./hibachi');
  const started=performance.now();
  const orders=await hibachi.getOrders({apiKey:'synthetic-read-only',accountId:7,privateKey:'synthetic-never-used'});
  console.log(JSON.stringify({mode:process.argv.includes('--baseline')?'HEAD baseline':'working tree',elapsedMs:Math.round(performance.now()-started),orders:orders.length,scenario:'WS handshake never answers; REST responds after 30ms'}));
  for (const socket of sockets) socket.destroy();
  server.close();
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
