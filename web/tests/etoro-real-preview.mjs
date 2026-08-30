// Mount the actual FuturesPanel with isolated account/network doubles.
// No exchange credentials, wallet signatures or trades are sent.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mockId = '/__etoro-real-mocks.jsx';
const entryId = '/__etoro-real-entry.jsx';
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
import {normalizeEtoroCredentials} from '/src/lib/etoroClient.js';
const noop = () => {};
const trading = {
  walletAddr:'0x'+'1'.repeat(40), hasWallet:true, connected:true,
  setupVerified:false, dataReady:false, accountReady:false,
  account:null, positions:[], orders:[], markets:[], prices:[],
  leverageSettings:{}, marginModes:{}, loading:false, error:'',
  clearError:noop, clearGoldEarned:noop,
  activate:async(input)=>{
    const credentials=normalizeEtoroCredentials(input);
    if(!credentials)return {error:'Real credentials required'};
    document.getElementById('fixture-actions').textContent='Verified request environment: '+credentials.environment+'; orders sent: 0';
    return {success:true};
  },
};
${hookNames.map(name => 'export const use' + name + ' = () => trading;').join('\n')}
export const useSend=()=>({setFuturesOpen:noop});
export const useLayout=()=>({isMobile:false});
export const useWallet=()=>({select:noop,connect:noop,wallets:[]});
export const useWalletModal=()=>({setVisible:noop});
export const useDex=()=>({dex:'etoro'});
export const DEX_CONFIG={etoro:{label:'eToro',name:'eToro',color:'#5CBF2A',logo:'/etoro.svg'}};
export const useAptosWallet=()=>({});
export const useFuturesMode=()=>({mode:'pro',needsSelection:false});
export const useFarcaster=()=>({isInFrame:false});
export const useOptionalPrivy=()=>({enabled:false,ready:true,authenticated:false});
export const useEvmWallet=()=>({setExternalProvider:noop});
export const useElfaSignals=()=>({});
export const setClientActivity=noop;
export const reportClientEvent=noop;
export const reportExchangeBalanceSnapshots=noop;
${[...mockComponents].map(name=>'export const '+name+'=()=>null;').join('\n')}
`;
const plugin = {
  name:'etoro-real-local-preview', enforce:'pre',
  resolveId(id) { if (id === mockId || id === entryId) return id; },
  load(id) {
    if(id === mockId)return mocks;
    if(id === entryId)return `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import FuturesPanel from '/src/components/FuturesPanel.jsx';
      import '/src/components/FuturesTerminal.css';
      createRoot(document.getElementById('root')).render(<FuturesPanel/>);
    `;
  },
  transform(code,id) {
    if(!id.replaceAll('\\','/').endsWith('/src/components/FuturesPanel.jsx'))return;
    return code.replace(/import (.+?) from '([^']+)';/g,(line,names,source)=>{
      if((source.startsWith('../hooks/') && source!=='../hooks/useFuturesTheme') || contextImports.has(source))
        return `import ${names} from '${mockId}';`;
      if(mockComponents.has(names))return `import { ${names} } from '${mockId}';`;
      return line;
    });
  },
  configureServer(server) {
    server.middlewares.use(async(req,res,next)=>{
      if(req.url?.startsWith('/api/')) {
        res.setHeader('content-type','application/json');
        res.end('{}');
        return;
      }
      if(req.url?.split('?')[0]!=='/')return next();
      res.setHeader('content-type','text/html');
      res.end(await server.transformIndexHtml('/',`<!doctype html><html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>LOCAL eToro Real-only setup</title>
        <style>body{margin:0;background:#152131;color:white;font-family:Arial,sans-serif}
        #fixture-actions{position:fixed;bottom:0;left:0;z-index:20000;padding:12px;font-size:13px}</style>
        </head><body><div id="root"></div><output id="fixture-actions">LOCAL MOCK — no exchange requests</output>
        <script type="module" src="${entryId}"></script></body></html>`));
    });
  },
};
const server=await createServer({
  root,configFile:false,plugins:[plugin,react()],
  optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime']},
  server:{host:'127.0.0.1',port:5194,strictPort:true},
});
await server.listen();
server.printUrls();
