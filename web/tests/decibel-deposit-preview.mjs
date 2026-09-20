// Local-only mounted FuturesPanel fixture. No exchange/wallet/network calls.
// Run: node tests/decibel-deposit-preview.mjs (browser), or --check (SSR).
// Scenarios: /?balance=0 (default), /?balance=100, /?pending=1, /?position=1.
// Responsive terminal QA: add &terminal=1&theme=dark (or light).
// Use --terminal to mount real chart/book components with deterministic feed adapters.
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
const realWidgets = process.argv.includes('--terminal');
const palette = process.argv.includes('--palette');
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
  'Lighter', 'RhLighter', 'Bulk', 'Ostium', 'Imperial',
];
if (realWidgets) {
  mockComponents.delete('TradingViewWidget');
  mockComponents.delete('OrderBook');
}
if (palette) for (const name of ['TradeHistory', 'FundingHistory', 'QuestsTab']) mockComponents.delete(name);
const mocks = `
import React from 'react';
import {useLeverupCollateral} from '/src/hooks/useLeverupCollateral.js';
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
if (params.has('native-chart')) {
  trading.markets[0] = {symbol:'GOLD',max_leverage:50,lot_size:'0.001',tick_size:'0.1',chart_symbol:'Hyperliquid.xyz:GOLD'};
  trading.prices[0] = {symbol:'GOLD',mark:'4381',mid:'4381',oracle:'4381'};
}
let initialTab = 'Trade';
export const getInitialTab = () => initialTab;
export const configureFixture = (tab, patch = {}) => {
  initialTab = tab;
  Object.assign(trading, patch);
};
${hookNames.filter(name=>name!=='Leverup').map(name => 'export const use' + name + ' = () => trading;').join('\n')}
export const useLeverup = () => {
  const walletAddr='0x'+(params.get('wallet')==='b'?'2':'1').repeat(40);
  const [collateralSymbol,setCollateralSymbol]=useLeverupCollateral(walletAddr);
  return {...trading,walletAddr,collateralSymbol,setCollateralSymbol,collateralBalance:collateralSymbol==='lvUSD'?20:0.72,
    walletUsdc:0.72,account:{wallet_usdc:0.72,wallet_lvusd:20,account_equity:20.72,available_to_spend:20.72}};
};
export const useSend = () => ({setFuturesOpen:noop});
export const usePlayer = () => ({token:'local-palette-fixture'});
export const useLayout = () => ({isMobile:window.innerWidth < 768});
export const useWallet = () => ({select:noop,connect:noop,wallets:[]});
export const useWalletModal = () => ({setVisible:noop});
export const useDex = () => ({dex:params.get('dex')==='leverup'?'leverup':'decibel'});
export const DEX_CONFIG = {decibel:{label:'Decibel',name:'Decibel',color:'#e47d35',logo:'/decibel.png'},leverup:{label:'LeverUp',name:'LeverUp',color:'#e47d35',logo:'/decibel.png'}};
export const useAptosWallet = () => ({});
export const useFuturesMode = () => ({mode:'pro',needsSelection:false});
export const useFarcaster = () => ({isInFrame:false});
export const useOptionalPrivy = () => ({enabled:false,ready:true,authenticated:false});
export const useEvmWallet = () => ({setExternalProvider:noop});
export const useElfaSignals = () => ({});
export const setClientActivity = noop;
export const reportClientEvent = noop;
export const reportExchangeBalanceSnapshots = noop;
// Real chart and book components can consume deterministic local feed adapters.
export const aptosFetchOptionsForKey = (options) => options;
export const runWithAptosBrowserKeys = (callback) => callback('local-fixture');
export const getReadClient = async () => ({userTradeHistory:{getByAddr:async()=>({items:[]})},userFundingHistory:{getByAddr:async()=>({items:[]})},candlesticks:{getByName:async ({endTime,interval}) => {
  const seconds = {'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400}[interval] || 300;
  const end = Math.floor(endTime / 1000 / seconds) * seconds;
  return Array.from({length:120}, (_,i) => {
    const open = 80000 + Math.sin(i / 8) * 420 + i * 3;
    const close = open + Math.sin(i * 2) * 110;
    return {t:end - (120-i)*seconds,o:open,h:Math.max(open,close)+65,l:Math.min(open,close)-65,c:close};
  });
}}});
export const startDecibelOrderBook = ({onData}) => {
  const levels = (side) => Array.from({length:12}, (_,i) => ({price:80000+side*(i+1)*2,amount:(i+1)/100,count:i+1}));
  onData({bids:levels(-1),asks:levels(1)});
  return noop;
};
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
const theme = new URLSearchParams(location.search).get('theme');
if (theme === 'light' || theme === 'dark') {
  localStorage.setItem('clash:futures-theme:v1', theme);
  document.documentElement.dataset.uiTheme = theme;
  document.documentElement.dataset.futuresTheme = theme;
}
createRoot(document.getElementById('root')).render(<FuturesPanel />);
`;
const fixture = {
  name:'decibel-optional-deposit-fixture',
  enforce:'pre',
  resolveId(id) { if (id === mockId || id === entryId) return id; },
  load(id) { if(id === mockId) return mocks; if(id === entryId) return entry; },
  transform(code,id) {
    const path = id.replaceAll('\\', '/');
    if (palette && /\/src\/components\/(TradeHistory|FundingHistory|QuestsTab)\.jsx$/.test(path)) {
      return code.replace(/from '\.\.\/(lib\/decibel|hooks\/useGodot|contexts\/DexContext)'/g, `from '${mockId}'`);
    }
    if (realWidgets && (path.endsWith('/src/components/TradingViewWidget.jsx') || path.endsWith('/src/components/OrderBook.jsx'))) {
      return code.replace(/from '\.\.\/lib\/(decibel|aptosBrowserKeyPool|decibelOrderBook)'/g, `from '${mockId}'`);
    }
    if (!id.replaceAll('\\', '/').endsWith('/src/components/FuturesPanel.jsx')) return;
    let transformed = code.replace(/import (.+?) from '([^']+)';/g, (line, names, source) => {
      if ((source.startsWith('../hooks/') && source !== '../hooks/useFuturesTheme')
        || contextImports.has(source)) return `import ${names} from '${mockId}';`;
      if (mockComponents.has(names)) return `import { ${names} } from '${mockId}';`;
      return line;
    });
    // QA-only opt-in: exercise the actual full terminal on wide screens too.
    // Production default and compact-window behavior remain unchanged.
    if (!check) transformed = transformed.replace(
      'useState(window.innerWidth < 600)',
      "useState(new URLSearchParams(location.search).has('terminal') || window.innerWidth < 600)");
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
        <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Decibel optional deposit — LOCAL MOCK</title>
        <style>body{margin:0;background:#152131;color:white;font-family:Arial,sans-serif}
        #fixture-actions{position:fixed;bottom:0;left:0;max-width:100%;max-height:80px;overflow:auto;font-size:10px;white-space:pre-wrap;z-index:20000;background:#17202c;color:#fff;pointer-events:none}
        </style></head><body>
        <div id="root"></div><output id="fixture-actions">LOCAL MOCK — no real transactions\n</output>
        <script type="module" src="${entryId}"></script></body></html>`);
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', `connect-src 'self' ws://127.0.0.1:${process.env.FIXTURE_HMR_PORT || 25188}; form-action 'none'`);
      res.end(html);
    });
  },
};
const server = await createServer({
  root, configFile:false, plugins:[fixture,react()],
  server:{host:'127.0.0.1',port:Number(process.env.FIXTURE_PORT || 5188),strictPort:true,middlewareMode:check,hmr:{port:check ? 25189 : Number(process.env.FIXTURE_HMR_PORT || 25188)}},
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
