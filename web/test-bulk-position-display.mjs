import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { normalizeBulkPosition } from './src/lib/bulkClient.js';
import { calculateFeeAwarePositionPnl, findPositionMarket, positionPnlPresentation } from './src/lib/positionPnlMetrics.js';

// Execute the actual shared metrics functions, not a duplicate test formula.
const source = readFileSync(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const names = ['numOrNull','displayLeverage','cleanSignedZero','signedMetricDirection','firstPositive',
  'isFlashPositionLike','flashPositionDisplayLeverageStable','getPositionMetrics','formatPositionPrice','positionPnlFeeTitle'];
const nodes = parse(source, {sourceType:'module',plugins:['jsx']}).program.body
  .filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name));
assert.equal(nodes.length, names.length);
const funcs = vm.runInNewContext(nodes.map(node => source.slice(node.start,node.end)).join('\n')
  + '\n({getPositionMetrics,formatPositionPrice,positionPnlFeeTitle})', {
    calculateFeeAwarePositionPnl, findPositionMarket, positionPnlPresentation, fmtPrice: String,
  });
const native = {symbol:'BTC-USD',size:.000609,price:79795.4,fairPrice:79994.4,
  unrealizedPnl:.121191,notional:48.7167896,leverage:20,fees:-.017008,funding:-.0018,iso:false};

test('BULK screenshot retains dollar PnL and shows +0.25%, not +4.99%',()=>{
  const p=normalizeBulkPosition(native);
  const result=funcs.getPositionMetrics(p,[],{}, {dex:'bulk'});
  assert.equal(result.pnlVal,.121191);
  assert.equal(result.pnlPct.toFixed(2),'0.25');
  assert.equal(result.pnlDisplay.primaryPnlPct.toFixed(2),'0.25');
  assert.equal(result.setLev,20);
  assert.match(funcs.positionPnlFeeTitle(result.pnlFees),/entry notional/);
  assert.equal(funcs.formatPositionPrice(p.entry_price,'bulk'),'79,795.40');
  assert.equal(funcs.formatPositionPrice(p.mark_price,'bulk'),'79,994.40');
});

test('BULK return is independent of leverage, preserves native zero and both signs',()=>{
  for (const leverage of [1,20,100]) {
    const p=normalizeBulkPosition({...native,leverage});
    assert.equal(funcs.getPositionMetrics(p,[],{}, {dex:'bulk'}).pnlPct.toFixed(2),'0.25');
  }
  const zero=normalizeBulkPosition({...native,unrealizedPnl:0});
  const metrics=funcs.getPositionMetrics(zero,[],{}, {dex:'bulk'});
  assert.equal(metrics.pnlPct,0,'native zero must not become a derived leveraged return');
  assert.equal(metrics.pnlVal,0);
  const short=normalizeBulkPosition({...native,size:-native.size,unrealizedPnl:-native.unrealizedPnl});
  assert.equal(short.side,'ask');
  assert.equal(short.amount,native.size);
  assert.equal(funcs.getPositionMetrics(short,[],{}, {dex:'bulk'}).pnlPct.toFixed(2),'-0.25');
  const partial=normalizeBulkPosition({...native,size:native.size/2,unrealizedPnl:native.unrealizedPnl/2});
  assert.equal(partial.pnl_pct,normalizeBulkPosition(native).pnl_pct);
});

test('BULK missing PnL uses signed mark difference; invalid data does not create infinity',()=>{
  const p=normalizeBulkPosition({...native,size:-native.size,unrealizedPnl:null});
  assert.ok(Math.abs(p.unrealized_pnl+native.unrealizedPnl)<1e-9);
  assert.equal(normalizeBulkPosition({...native,price:0}).pnl_pct,null);
  assert.equal(normalizeBulkPosition({...native,size:'bad'}).size,0);
  assert.equal(normalizeBulkPosition({...native,iso:true,isoPubkey:'fixture-isolated'}).trade_index,'fixture-isolated');
});

test('other venues keep the shared percentage convention',()=>{
  const p={symbol:'BTC',amount:1,entry_price:100,mark_price:101,unrealized_pnl:1,side:'bid',leverage:20};
  assert.equal(funcs.getPositionMetrics(p,[],{}, {dex:'pacifica'}).pnlPct,20);
});
