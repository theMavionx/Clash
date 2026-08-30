import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { uiButton, uiIconButton } from './src/styles/theme.js';
import {
  createTradingWalletSessionHistory, normalizeVenueWallet, tradingWalletSessionKey,
} from './src/lib/tradingWalletSession.js';

const EVM = '0x' + 'a'.repeat(40);
const SOL = 'So11111111111111111111111111111111111111112';
const APTOS = '0x' + 'b'.repeat(64);
const source = readFileSync(new URL('./src/components/WalletSessionRecovery.jsx', import.meta.url), 'utf8');
const { code } = await transformWithOxc(
  source.replace(/^import[\s\S]*?;\s*/gm, '').replace('export default function', 'function'),
  'wallet-session-recovery.jsx', { jsx: { runtime: 'classic' } },
);

function memoryStorage() {
  const data = new Map();
  return { data, getItem:key=>data.get(key) ?? null, setItem:(key,value)=>data.set(key,value) };
}

// Execute the actual component/effects with a deterministic hook scheduler,
// fake timers and wallet adapters. No real provider, login or network calls.
function mount(storage = memoryStorage()) {
  const state = {
    dex:'avantis', player:{id:'player-a',token:'fixture-token',wallet:SOL},
    ui:{showRegister:false,futuresOpen:false},
    evm:{address:null,isReady:false},
    aptos:{address:null,connected:false},
    sol:{publicKey:{toBase58:()=>SOL},connected:true},
    privy:{authenticated:false,ready:true,solanaWallets:[]},
    picked:true, reconnects:0, solConnects:0, aptosConnects:0,
  };
  const slots = [];
  const timers = new Map();
  const listeners = new Map();
  let cursor = 0;
  let dirty = false;
  let pending = [];
  let tree;
  let timerId = 0;
  const equalDeps = (a,b) => a && b && a.length === b.length && a.every((v,i)=>Object.is(v,b[i]));
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = {value:typeof initial === 'function' ? initial() : initial};
    return [slots[index].value, value => {
      const next = typeof value === 'function' ? value(slots[index].value) : value;
      if (!Object.is(next,slots[index].value)) { slots[index].value = next; dirty = true; }
    }];
  };
  const useMemo = (fn,deps) => {
    const index = cursor++;
    if (!equalDeps(slots[index]?.deps,deps)) slots[index] = {deps,value:fn()};
    return slots[index].value;
  };
  const evmActions = {
    reconnectStoredProvider:async()=>{state.reconnects++;return false;},
    disconnect:()=>{},
    setExternalProvider:()=>{},
  };
  const aptosActions = {connect:async()=>{state.aptosConnects++;},disconnect:async()=>{}};
  const EvmWalletModal = ({open}) => open ? React.createElement('div', {'data-evm-connect-modal':true}) : null;
  const context = vm.createContext({
    React, uiButton, uiIconButton, useState, useMemo,
    useCallback:(fn,deps)=>useMemo(()=>fn,deps),
    useRef:initial=>useState(()=>({current:initial}))[0],
    useEffect:(fn,deps)=>{
      const index = cursor++;
      if (!equalDeps(slots[index]?.deps,deps)) {
        pending.push(()=>{
          slots[index]?.cleanup?.();
          slots[index] = {deps,cleanup:fn()};
        });
      }
    },
    useDex:()=>({dex:state.dex}),
    usePlayer:()=>state.player,
    useUI:()=>state.ui,
    useSend:()=>({sendToGodot:()=>{}}),
    useWallet:()=>state.sol,
    useWalletModal:()=>({setVisible:()=>{}}),
    useEvmWallet:()=>Object.assign(state.evm,evmActions),
    useAptosWallet:()=>Object.assign(state.aptos,aptosActions),
    useOptionalPrivy:()=>state.privy,
    useFarcaster:()=>({isInFrame:false}),
    openSolanaWallet:()=>{state.solConnects++;},
    addClientBreadcrumb:()=>{},
    EvmWalletModal,
    normalizeVenueWallet, tradingWalletSessionKey,
    createTradingWalletSessionHistory:()=>createTradingWalletSessionHistory(()=>storage),
    window:{location:{hostname:'clashofperps.fun',href:'https://clashofperps.fun/'}},
    localStorage:{getItem:()=>state.picked?'1':null,removeItem:()=>{}},
    document:{
      visibilityState:'visible',
      addEventListener:(name,fn)=>listeners.set(name,fn),
      removeEventListener:name=>listeners.delete(name),
    },
    setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},
    clearTimeout:id=>timers.delete(id),
  });
  const Component = vm.runInContext(code + '\nWalletSessionRecovery;',context);
  const render = () => {
    let passes = 0;
    do {
      assert.ok(++passes < 20, 'component effects must settle');
      cursor=0;dirty=false;pending=[];
      tree=Component();
      pending.forEach(fn=>fn());
    } while(dirty);
    return renderToStaticMarkup(tree);
  };
  const advance = () => {
    const tasks=[...timers.values()];
    timers.clear();
    tasks.forEach(fn=>fn());
    return render();
  };
  return {
    state,storage,render,advance,context,
    tree:()=>tree,
    focus:()=>{listeners.get('visibilitychange')?.();return render();},
  };
}

function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node,...React.Children.toArray(node.props.children).flatMap(elements)];
}
const hasBanner = html => html.includes('Wallet session needs repair');
function connectEvm(fixture) {
  fixture.state.ui.futuresOpen=true;
  fixture.state.evm={address:EVM,isReady:true};
  assert.equal(hasBanner(fixture.render()),false);
}
function disconnectEvm(fixture) {
  fixture.state.evm={address:null,isReady:false};
  fixture.render();
  return fixture.advance();
}

test('Solana game login -> first EVM venue does not reconnect or claim a linked EVM wallet', () => {
  const f=mount();
  f.render();
  f.advance();
  f.state.ui.futuresOpen=true;
  assert.equal(hasBanner(f.render()),false);
  assert.equal(hasBanner(f.focus()),false);
  assert.equal(f.state.reconnects,0);
  assert.equal(f.storage.data.size,0);
});

test('a selected venue or stored server wallet is not connection evidence', () => {
  const f=mount();
  f.state.player.dex_accounts=[{dex:'avantis',wallet_address:EVM,status:'ready'}];
  f.state.player.wallets=[{chain_type:'evm',address:EVM}];
  f.state.evm={address:EVM,isReady:true};
  f.render(); // live shared provider, but this trading panel was never opened
  assert.equal(hasBanner(disconnectEvm(f)),false);
  assert.equal(f.state.reconnects,0);
  assert.equal(f.storage.data.size,0);
});

test('an observed Solana venue does not make the first EVM venue a recovery session', () => {
  const f=mount();
  f.state.dex='pacifica';
  f.state.ui.futuresOpen=true;
  f.render();
  assert.equal(f.storage.data.size,1);
  f.state.dex='avantis';
  assert.equal(hasBanner(f.render()),false);
  assert.equal(hasBanner(f.advance()),false);
  assert.equal(f.state.reconnects,0);
  assert.equal(f.storage.data.size,1);
});

test('a real connection then disconnect shows recovery for the actual venue wallet', async () => {
  const f=mount();
  connectEvm(f);
  const html=disconnectEvm(f);
  assert.ok(hasBanner(html));
  assert.ok(html.includes('Previously connected wallet: 0xaaaa...aaaa'));
  assert.ok(!html.includes('Linked wallet:'));
  assert.equal(f.state.reconnects,1);
  const reconnect=elements(f.tree()).find(el=>el.type==='button' && el.props.children==='Reconnect Base wallet');
  await reconnect.props.onClick();
  assert.ok(f.render().includes('data-evm-connect-modal'));
  connectEvm(f);
  assert.equal(hasBanner(f.render()),false);
  assert.ok(!f.render().includes('data-evm-connect-modal'));
});

test('another EVM venue and another player do not inherit the recovery prompt', () => {
  const f=mount();
  connectEvm(f);
  assert.ok(hasBanner(disconnectEvm(f)));
  f.state.ui.futuresOpen=false;
  f.state.dex='domfi';
  assert.equal(hasBanner(f.render()),false);
  assert.equal(hasBanner(f.advance()),false);
  f.state.dex='avantis';
  f.state.player={id:'player-b',token:'different-token',wallet:SOL};
  assert.equal(hasBanner(f.render()),false);
});

test('reload retains only previously observed venue sessions', () => {
  const storage=memoryStorage();
  const first=mount(storage);
  connectEvm(first);
  const reload=mount(storage);
  reload.render();
  assert.ok(hasBanner(reload.advance()));
  reload.state.dex='gmx';
  assert.equal(hasBanner(reload.render()),false);
});

test('address without ready signer and a wrong-chain address do not establish a session', () => {
  for (const evm of [{address:EVM,isReady:false},{address:SOL,isReady:true}]) {
    const f=mount();
    f.state.ui.futuresOpen=true;
    f.state.evm=evm;
    f.render();
    assert.equal(hasBanner(disconnectEvm(f)),false);
    assert.equal(f.storage.data.size,0);
  }
});

test('registration, logout and unpicked venues suppress recovery', () => {
  for (const disable of [
    f=>{f.state.ui.showRegister=true;},
    f=>{f.state.player={id:'player-a'};},
    f=>{f.state.picked=false;},
  ]) {
    const f=mount();
    connectEvm(f);
    disable(f);
    assert.equal(hasBanner(disconnectEvm(f)),false);
    assert.equal(f.state.reconnects,0);
  }
});

test('switching away cancels a pending recovery timer', () => {
  const f=mount();
  connectEvm(f);
  f.state.evm={address:null,isReady:false};
  f.render();
  f.state.dex='decibel';
  f.render();
  assert.equal(hasBanner(f.advance()),false);
});

test('Aptos has its own first-connect/recovery lifecycle', async () => {
  const f=mount();
  f.state.dex='decibel';
  f.state.ui.futuresOpen=true;
  assert.equal(hasBanner(f.render()),false);
  f.state.aptos={address:APTOS,connected:true};
  f.render();
  f.state.aptos={address:null,connected:false};
  f.render();
  assert.ok(hasBanner(f.advance()));
  const reconnect=elements(f.tree()).find(el=>el.type==='button' && el.props.children==='Reconnect Petra wallet');
  await reconnect.props.onClick();
  assert.equal(f.state.aptosConnects,1);
});

test('Solana adapter and Privy sessions both recover after an observed connection', () => {
  for (const privy of [false,true]) {
    const f=mount();
    f.state.dex='pacifica';
    f.state.ui.futuresOpen=true;
    if(privy) {
      f.state.sol={publicKey:null,connected:false};
      f.state.privy={authenticated:true,ready:true,solanaWallets:[{address:SOL}],solanaSignTransaction:()=>{}};
    }
    f.render();
    f.state.sol={publicKey:null,connected:false};
    f.state.privy={authenticated:false,ready:true,solanaWallets:[]};
    f.render();
    assert.ok(hasBanner(f.advance()));
  }
});

test('blocked browser storage still allows same-session recovery without tokens in keys', () => {
  const storage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  const history=createTradingWalletSessionHistory(()=>storage);
  history.remember('player-a','avantis',EVM);
  assert.equal(history.read('player-a','avantis'),EVM);
  assert.equal(history.read('player-b','avantis'),'');
  assert.equal(history.read('player-a','domfi'),'');
  assert.equal(tradingWalletSessionKey('', 'avantis'),'');
  assert.equal(tradingWalletSessionKey('player-a', 'unknown'),'');
});
