import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
test('enabled empty TP/SL blocks submission; disabled and one-sided drafts retain their paths', () => {
  const src=readFileSync(new URL('./src/components/FuturesPanel.jsx',import.meta.url),'utf8');
  const body=src.slice(src.indexOf('const resolveOpenTpslForSide = useCallback'),src.indexOf('const resolveOpenTpslForSide = useCallback')+900);
  const guard=body.slice(body.indexOf('const hasAnyInput'),body.indexOf('const pos ='));
  const run=new Function('openTpslEnabled','openTpPrice','openSlPrice','setLocalAlert',guard+'return {continued:true};');
  const alerts=[];
  assert.equal(run(false,'','',m=>alerts.push(m)).hasTpsl,false);
  assert.equal(run(true,'','',m=>alerts.push(m)).ok,false);
  assert.match(alerts[0],/target/);
  assert.equal(run(true,'120','',()=>{}).continued,true);
  assert.equal(run(true,'','90',()=>{}).continued,true);
});
