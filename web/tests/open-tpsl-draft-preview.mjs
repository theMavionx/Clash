// Real draft/editor functions and styles, extracted without mounting wallet hooks.
// Run: node tests/open-tpsl-draft-preview.mjs (http://127.0.0.1:5195).
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('../', import.meta.url));
const componentId = '/__open-tpsl-components.jsx';
const entryId = '/__open-tpsl-preview.jsx';
const source = readFileSync(new URL('../src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const names = new Set([
  'OpenTpslEditor', 'TpslEditor', 'TpslValueInput', 'ClosingButtonLabel',
  'openTpslInputGuidance', 'tpslPriceFromInput', 'tpslSubmitValue',
  'tpslPositionAmount', 'tpslCollateralUsd', 'tpslReferencePrice',
  'validateTpslBeforeSubmit', 'tpslInputPlaceholder', 'tpslModeLabel',
  'positionOpenSide', 'firstPositive', 'firstFinite', 'finiteNumber',
  'formatTpslInputValue', 'normalizeTpslInputValue', 'fmtPrice', 'subscriptN',
  'SUBSCRIPT_DIGITS', 'TPSL_INPUT_MODES', 'OPEN_TPSL_NATIVE_ORDER_ATTACH_DEXES',
  'OPEN_TPSL_NATIVE_LIMIT_ATTACH_DEXES', 'DEX_ERROR_LABELS', 'dexErrorLabel',
]);
const selected = [];
for (const node of ast.program.body) {
  if (node.type === 'FunctionDeclaration' && names.has(node.id.name)) selected.push(source.slice(node.start, node.end));
  if (node.type !== 'VariableDeclaration') continue;
  for (const declaration of node.declarations) {
    if (names.has(declaration.id.name)) selected.push(`const ${source.slice(declaration.start, declaration.end)};`);
    if (declaration.id.name === 'S') {
      const properties = declaration.init.properties.filter(property => /^(tpsl|openTpsl|closeLoading)/.test(property.key.name) || property.key.name === 'btnBlue');
      selected.push(`const S = {${properties.map(property => source.slice(property.start, property.end)).join(',')}};`);
    }
  }
}
const components = `import React,{useState,useId,memo} from 'react';
import PositionActionDialog from '/src/components/trading/PositionActionDialog.jsx';
import {validateOstiumStopLossDirection,validateOstiumTakeProfitDirection,validateOstiumTakeProfitLimit} from '/src/lib/ostiumTpLimits.js';
${selected.join('\n')}
export {OpenTpslEditor,TpslEditor,tpslPriceFromInput,tpslSubmitValue};`;

const fixture = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {OpenTpslEditor,TpslEditor,tpslSubmitValue,tpslPriceFromInput} from '${componentId}';
import '/src/components/FuturesTerminal.css';
const params = new URLSearchParams(location.search);
window.fixture = {calls:[], arithmetic:tpslPriceFromInput};
function App(){
 const [saved,setSaved]=useState({enabled:false,mode:'price',previewSide:'bid',tpValue:'',slValue:''});
 const [entry,setEntry]=useState(params.has('entry')?params.get('entry'):'100');
 const [amount,setAmount]=useState(params.has('amount')?params.get('amount'):'2');
 const [theme,setTheme]=useState(params.get('theme')||'dark');
 const [dex,setDex]=useState(params.get('dex')||'imperial');
 const [orderType,setOrderType]=useState(params.get('orderType')||'market');
 const [live,setLive]=useState(false),[liveMode,setLiveMode]=useState('price'),[liveTp,setLiveTp]=useState(''),[liveSl,setLiveSl]=useState('');
 const [callCount,setCallCount]=useState(0);
 document.documentElement.dataset.futuresTheme=theme;
 const pos={symbol:'BTC',side:saved.previewSide,entry_price:Number(entry),mark_price:Number(entry),amount:Number(amount),margin:Number(entry)*Number(amount)/10,leverage:10};
 const metrics={entryP:pos.entry_price,markP:pos.mark_price,amt:pos.amount,margin:pos.margin,setLev:10};
 const change=key=>value=>setSaved(previous=>({...previous,[key]:value}));
 const setPosition=()=>{window.fixture.calls.push({action:'setTpsl',tp:tpslSubmitValue({pos,metrics,leg:'tp',mode:liveMode,value:liveTp,initialValue:''}),sl:tpslSubmitValue({pos,metrics,leg:'sl',mode:liveMode,value:liveSl,initialValue:''})});setCallCount(window.fixture.calls.length);};
 return <main><h1>TP/SL · order draft preview</h1><p>Local component fixture. Wallets and order placement are not connected.</p>
 <div className="fixture-controls">
 <label>Entry<input aria-label="Fixture entry" type="number" value={entry} onChange={e=>setEntry(e.target.value)}/></label>
 <label>Amount<input aria-label="Fixture amount" type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
 <label>Theme<select aria-label="Fixture theme" value={theme} onChange={e=>setTheme(e.target.value)}><option>dark</option><option>light</option></select></label>
 <label>Venue<select aria-label="Fixture venue" value={dex} onChange={e=>setDex(e.target.value)}>{['imperial','bulk','ostium','risex'].map(d=><option key={d}>{d}</option>)}</select></label>
 <label>Order<select aria-label="Fixture order type" value={orderType} onChange={e=>setOrderType(e.target.value)}><option>market</option><option>limit</option></select></label>
 </div>
 <OpenTpslEditor {...saved} onEnabledChange={change('enabled')} onModeChange={change('mode')} onPreviewSideChange={change('previewSide')} onTpChange={change('tpValue')} onSlChange={change('slValue')} pos={pos} metrics={metrics} dex={dex} orderType={orderType}/>
 <h2>Saved parent state</h2><output aria-label="Saved order settings">{JSON.stringify(saved)}</output>
 <p>Financial calls: <output aria-label="Financial calls">{callCount}</output></p>
 <button type="button" onClick={()=>setLive(v=>!v)}>Toggle existing position editor</button>
 {live&&<section aria-label="Existing position editor"><TpslEditor mode={liveMode} onModeChange={setLiveMode} tpValue={liveTp} slValue={liveSl} onTpChange={setLiveTp} onSlChange={setLiveSl} pos={pos} metrics={metrics} hasChanges={Boolean(liveTp||liveSl)} onSubmit={setPosition}/></section>}
 </main>;
}
createRoot(document.getElementById('root')).render(<App/>);`;

export async function startPreview(port = 5195) {
  const plugin = {
    name: 'open-tpsl-real-components',
    resolveId(id) { if ([componentId, entryId].includes(id)) return id; },
    load(id) { if (id === componentId) return components; if (id === entryId) return fixture; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/' && !req.url?.startsWith('/?')) return next();
        res.setHeader('content-type', 'text/html');
        res.end(await server.transformIndexHtml('/', `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>TP/SL draft preview</title><style>
        body{margin:0;padding:24px;background:var(--terminal-canvas);color:var(--terminal-text);font:14px/1.5 system-ui}main{max-width:600px;margin:auto}h1{font-size:20px}h2{font-size:14px;margin-top:24px}.fixture-controls{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}.fixture-controls label{display:flex;flex-direction:column;gap:4px}.fixture-controls input{width:90px}.fixture-controls :is(input,select),main>button{padding:8px;border:1px solid var(--terminal-border);border-radius:6px;background:var(--terminal-surface);color:var(--terminal-text)}output{overflow-wrap:anywhere}section{margin-top:16px}
        </style></head><body><div id="root"></div><script type="module" src="${entryId}"></script></body></html>`));
      });
    },
  };
  const server = await createServer({ root, configFile: false, plugins: [plugin, react()], server: { host: '127.0.0.1', port, strictPort: true } });
  await server.listen();
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startPreview();
  console.log('TP/SL draft preview: http://127.0.0.1:5195');
}
