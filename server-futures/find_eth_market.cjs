const path = require('path');
const fs = require('fs');
const SDK_BASE = path.join(__dirname, '..', 'web', 'node_modules', '@gmx-io', 'sdk', 'build', 'cjs', 'src');
const VIEM = path.join(__dirname, '..', 'web', 'node_modules', 'viem');
const { GmxSdk } = require(path.join(SDK_BASE, 'clients', 'v1', 'index.js'));
const { createPublicClient, createWalletClient, http } = require(VIEM);
const { arbitrum } = require(path.join(VIEM, 'chains'));
const { privateKeyToAccount } = require(path.join(VIEM, 'accounts'));

const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const PK = (env.match(/TEST_PRIVKEY=(\S+)/) || [])[1];
const acct = privateKeyToAccount(PK);

(async () => {
  for (const rpc of ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com', 'https://arbitrum-one.publicnode.com', 'https://1rpc.io/arb']) {
    console.log(`\n=== ${rpc} ===`);
    try {
      const pc = createPublicClient({ chain: arbitrum, transport: http(rpc) });
      const wc = createWalletClient({ account: acct, chain: arbitrum, transport: http(rpc) });
      // Don't pass publicClient — let SDK build with proper batch config.
      const sdk = new GmxSdk({ chainId: 42161, rpcUrl: rpc, oracleUrl: 'https://arbitrum-api.gmxinfra.io', subsquidUrl: 'x', walletClient: wc, account: acct.address });
      const t0 = Date.now();
      const info = await sdk.markets.getMarketsInfo();
      const all = Object.values(info.marketsInfoData || {});
      console.log(`  ${Date.now()-t0}ms | total markets:${all.length}`);
      // Sample first non-spot market — show top-level shape and which token
      // fields look like.
      const sample = all.find(m => !m.isSpotOnly);
      if (sample) {
        console.log('  sample keys:', Object.keys(sample).filter(k => /token|market|name|long|short|index/i.test(k)).join(', '));
        console.log('  sample.name:', sample.name);
        console.log('  sample.indexToken:', sample.indexToken && { symbol: sample.indexToken.symbol, address: sample.indexToken.address?.slice(0,10) });
        console.log('  sample.longToken:', sample.longToken && { symbol: sample.longToken.symbol, address: sample.longToken.address?.slice(0,10) });
        console.log('  sample.shortToken:', sample.shortToken && { symbol: sample.shortToken.symbol, address: sample.shortToken.address?.slice(0,10) });
      }
      // Try alternate filters
      const symbolsSeen = new Set(all.map(m => m.indexToken?.symbol).filter(Boolean));
      console.log('  unique indexToken symbols:', [...symbolsSeen].slice(0, 20).join(', '));
      const allEthish = all.filter(m => /ETH|WETH/i.test(m.name || '') || /ETH/i.test(m.indexToken?.symbol || ''));
      console.log('  ETH-ish markets:', allEthish.length);
      allEthish.slice(0, 5).forEach(m => console.log(`    name=${m.name} | idx=${m.indexToken?.symbol} | long=${m.longToken?.symbol} | short=${m.shortToken?.symbol}`));
      break;
    } catch (e) {
      console.log('  FAIL:', e.message?.slice(0, 80));
    }
  }
})();
