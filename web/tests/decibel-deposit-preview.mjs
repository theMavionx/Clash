// Local-only mounted FuturesPanel fixture. No exchange/wallet/network calls.
// Run: node tests/decibel-deposit-preview.mjs (browser), or --check (SSR).
// Scenarios: /?balance=0 (default), /?balance=100, /?pending=1, /?position=1.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../', import.meta.url));
const mockId = '/__decibel-deposit-mocks.jsx';
const entryId = '/__decibel-deposit-entry.jsx';
const check = process.argv.includes('--check');
const contextImports = new Set([
  '../contexts/DexContext', '../contexts/AptosWalletContext',
  '../contexts/FuturesModeContext', '../contexts/EvmWalletContext',
  '@solana/wallet-adapter-react', '@solana/wallet-adapter-react-ui',
  './PrivyAuthProvider', '../lib/updateCoordinator', '../lib/clientLogger',
  '../lib/exchangeBalanceTelemetry',
]);
const mockComponents = new Set([
  'TradingViewWidget', 'OrderBook', 'TradeHistory', 'FundingHistory',
  'QuestsTab', 'TradeIdeaModal', 'EvmWalletModal', 'TokenIcon',
  'GoldRewardToast', 'FuturesModeSelect', 'BasicTradeFlow', 'ShareTradeModal',
]);
const hookNames = [
  'Pacifica', 'Avantis', 'Domfi', 'Etoro', 'Decibel', 'Gmx', 'Monad',
  'Phoenix', 'Hyperliquid', 'Risex', 'Nado', 'Ondo', 'Leverup', 'Aster',
  'Hibachi', 'Hotstuff', 'Grvt', 'Katana', 'Gmtrade', 'Flash',
  'Lighter', 'RhLighter', 'Bulk', 'Ostium',
];
const mocks = `
import React from 'react';
const params = new URLSearchParams(location.search);
const balance = Number(params.get('balance') || 0);
const noop = () => {};
const record = (name) => async (...args) => {
  document.getElementById('fixture-actions').textContent += name + ':' + JSON.stringify(args) + '\\n';
  return { ok: true };
};
const trading = {
  walletAddr: '0x' + '1'.repeat(64),
  account: { perp_equity_balance: balance, usdc_cross_withdrawable_balance: balance, free_margin: balance },
  positions: params.has('position') ? [{symbol:'BTC', side:'bid', amount:'0.001', entry_price:'80000', leverage:10, margin:8}] : [],
  orders: [],
  prices: [
    {symbol:'BTC',mark:'80000',mid:'80000',oracle:'80000'},
    {symbol:'ETH',mark:'3000',mid:'3000',oracle:'3000'},
  ],
  markets: [
    {symbol:'BTC',max_leverage:50,lot_size:'0.00001',tick_size:'0.1'},
    {symbol:'ETH',max_leverage:50,lot_size:'0.001',tick_size:'0.01'},
  ],
  walletUsdc:107.75, walletUsdcStatus:'ready',
  dataReady:true, accountReady:!params.has('pending'), connected:true,
  isReady:true, setupVerified:true, hasReferrer:true, subaccountAddr:'0x'+'2'.repeat(64),
  gasSponsored:true, loading:false, error:null, activationStep:null,
  leverageSettings:{BTC:10,ETH:10}, marginModes:{},
  clearError:noop, clearGoldEarned:noop,
  setLeverage:record('leverage'), placeMarketOrder:record('market'),
  placeLimitOrder:record('limit'), depositToPacifica:record('deposit'),
  closePosition:record('close'), cancelOrder:record('cancel'), setTpsl:record('tpsl'),
  fetchTradeHistory:async()=>[], fetchFundingHistory:async()=>[],
};
let initialTab = 'Trade';
export const getInitialTab = () => initialTab;
export const configureFixture = (tab, patch = {}) => {
  initialTab = tab;
  Object.assign(trading, patch);
};
${hookNames.map(name => 'export const use' + name + ' = () => trading;').join('\n')}
export const useSend = () => ({setFuturesOpen:noop});
export const useLayout = () => ({isMobile:false});
export const useWallet = () => ({select:noop,connect:noop,wallets:[]});
export const useWalletModal = () => ({setVisible:noop});
export const useDex = () => ({dex:'decibel'});
export const DEX_CONFIG = {decibel:{label:'Decibel',name:'Decibel',color:'#e47d35',logo:'/decibel.png'}};
export const useAptosWallet = () => ({});
export const useFuturesMode = () => ({mode:'pro',needsSelection:false});
export const useFarcaster = () => ({isInFrame:false});
export const useOptionalPrivy = () => ({enabled:false,ready:true,authenticated:false});
export const useEvmWallet = () => ({setExternalProvider:noop});
export const useElfaSignals = () => ({});
export const setClientActivity = noop;
export const reportClientEvent = noop;
export const reportExchangeBalanceSnapshots = noop;
export const TradingViewWidget = ({symbol}) => <div style={{height:'100%',minHeight:120,padding:12}}>Chart preview: {symbol} (mock feed)</div>;
export const OrderBook = () => <div>Order book (mock feed)</div>;
export const TradeHistory = () => <div>No trade history (mock account)</div>;
export const FundingHistory = () => <div>No funding history (mock account)</div>;
export const QuestsTab = () => <div>Quests (mock account)</div>;
export const TokenIcon = () => null;
export const TradeIdeaModal = () => null;
export const EvmWalletModal = () => null;
export const GoldRewardToast = () => null;
export const FuturesModeSelect = () => null;
export const BasicTradeFlow = () => null;
export const ShareTradeModal = () => null;
`;
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import FuturesPanel from '/src/components/FuturesPanel.jsx';
import '/src/components/FuturesTerminal.css';
createRoot(document.getElementById('root')).render(<FuturesPanel />);
`;
const fixture = {
  name:'decibel-optional-deposit-fixture',
  enforce:'pre',
  resolveId(id) { if (id === mockId || id === entryId) return id; },
  load(id) { if(id === mockId) return mocks; if(id === entryId) return entry; },
  transform(code,id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/components/FuturesPanel.jsx')) return;
    const transformed = code.replace(/import (.+?) from '([^']+)';/g, (line, names, source) => {
      if ((source.startsWith('../hooks/') && source !== '../hooks/useFuturesTheme')
        || contextImports.has(source)) return `import ${names} from '${mockId}';`;
      if (mockComponents.has(names)) return `import { ${names} } from '${mockId}';`;
      return line;
    });
    // SSR cannot click tabs. Start each render on a chosen tab, keeping all
    // production gates, rendering branches and controls unchanged.
    return check
      ? `import {getInitialTab} from '${mockId}';\n` + transformed.replace(
        "const [activeTab, setActiveTab] = useState('Trade');",
        'const [activeTab, setActiveTab] = useState(getInitialTab);')
      : transformed;
  },
  configureServer(server) {
    server.middlewares.use(async (req,res,next) => {
      if (req.url?.split('?')[0] !== '/') return next();
      const html = await server.transformIndexHtml('/', `<!doctype html>
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Decibel optional deposit — LOCAL MOCK</title>
        <style>body{margin:0;background:#152131;color:white;font-family:Arial,sans-serif}
        #fixture-actions{position:fixed;bottom:0;left:0;font-size:12px;white-space:pre-wrap;z-index:20000}
        </style></head><body>
        <div id="root"></div><output id="fixture-actions">LOCAL MOCK — no real transactions\n</output>
        <script type="module" src="${entryId}"></script></body></html>`);
      res.setHeader('Content-Type','text/html');
      res.end(html);
    });
  },
};
const server = await createServer({
  root, configFile:false, plugins:[fixture,react()],
  server:{host:'127.0.0.1',port:5188,strictPort:true,middlewareMode:check},
});
if (check) {
  // An isolated SSR environment: no browser session, exchange credentials,
  // blockchain client or network-capable wallet hooks.
  globalThis.location = {search:''};
  globalThis.window = {innerWidth:1280,innerHeight:900,matchMedia:()=>({matches:window.innerWidth <= 767})};
  globalThis.document = {documentElement:{dataset:{}}};
  try {
    const {default:FuturesPanel} = await server.ssrLoadModule('/src/components/FuturesPanel.jsx');
    const {configureFixture} = await server.ssrLoadModule(mockId);
    for (const width of [1280,390]) {
      window.innerWidth = width;
      for (const [tab, expected] of [
      ['Trade','Browse without a deposit'],
      ['Positions','No Positions'],
      ['Orders','No Orders'],
      ['History','No trade history'],
      ['Funding','No funding history'],
      ['Account','Deposit USDC'],
      ['Quests','Quests (mock account)'],
      ]) {
        configureFixture(tab);
        const html = renderToStaticMarkup(createElement(FuturesPanel));
        assert.ok(html.includes(expected), tab + ' is available without funding');
        assert.ok(!html.includes('Deposit USDC to start'), 'No mandatory funding gate');
        console.log('PASS zero-balance render: ' + tab + ' at ' + width);
      }
    }
    configureFixture('Trade', {accountReady:false});
    let html = renderToStaticMarkup(createElement(FuturesPanel));
    assert.ok(!html.includes('Browse without a deposit'), 'Do not show a zero-balance CTA during account loading');
    console.log('PASS loading account: no premature zero-balance hint');
    configureFixture('Trade', {accountReady:true,account:{perp_equity_balance:100,usdc_cross_withdrawable_balance:100}});
    html = renderToStaticMarkup(createElement(FuturesPanel));
    assert.ok(html.includes('Chart preview: BTC'), 'Funded trading workspace remains available');
    assert.ok(!html.includes('Browse without a deposit'), 'No empty-account hint for a funded account');
    console.log('PASS funded account render');
    configureFixture('Positions', {
      account:{perp_equity_balance:8,usdc_cross_withdrawable_balance:0},
      positions:[{symbol:'BTC',side:'bid',amount:'0.001',entry_price:'80000',leverage:10,margin:8}],
    });
    html = renderToStaticMarkup(createElement(FuturesPanel));
    assert.ok(html.includes('>Close<') && html.includes('>TP/SL<'), 'Risk management remains available with no free collateral');
    console.log('PASS zero-free-collateral position controls');
  } finally {
    await server.close();
  }
} else {
  await server.listen();
  server.printUrls();
}
