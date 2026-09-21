import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./src/lib/clientLogger.js',import.meta.url),'utf8');
test('actual logger sanitizes Error message/stack and sensitive object fields',()=>{
  const context={Error,WeakSet,truncate:(v,n)=>String(v).slice(0,n)};
  vm.createContext(context);
  const rule=source.match(/const REDACT_KEY_RE = .*;/)[0];
  const helpers=source.slice(source.indexOf('function maskAddress'),source.indexOf('function currentContext'));
  vm.runInContext(rule+'\n'+helpers+'\nglobalThis.safe = {sanitize,argToText,redactText};',context);
  const error=new Error('https://rpc.example/v2/SECRET_API_CREDENTIAL?admin_key=ADMINPRIVATE&token=TOKENPRIVATE Bearer BEARERPRIVATE');
  for(const value of [context.safe.sanitize(error),context.safe.argToText(error),context.safe.redactText(error.stack)])
    assert.doesNotMatch(JSON.stringify(value),/SECRET_API_CREDENTIAL|ADMINPRIVATE|TOKENPRIVATE|BEARERPRIVATE/);
  const record=context.safe.sanitize({mnemonic:'PRIVATE_PHRASE',seed:'PRIVATE_SEED',nested:{signature:'PRIVATE_SIGNATURE'}});
  assert.doesNotMatch(JSON.stringify(record),/PRIVATE_/);
  assert.match(source,/stack: truncate\(redactText\(stack \|\| ''\), 3500\)/);
  assert.match(source,/url: location.origin \+ location.pathname/);
});
