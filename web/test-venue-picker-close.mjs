import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { uiButton, uiIconButton } from './src/styles/theme.js';
import { playerDexPreferenceKey } from './src/lib/lastPlayerDex.js';

const source = readFileSync(new URL('./src/components/GameUI.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const dexSource = readFileSync(new URL('./src/contexts/DexContext.jsx', import.meta.url), 'utf8');
const logoVenues = ['lighter', 'rhlighter'].map(id => {
  const config = dexSource.match(new RegExp('  ' + id + ': (\\{[\\s\\S]*?\\n  \\}),'));
  assert.ok(config, id + ' config must exist');
  return vm.runInNewContext('(' + config[1] + ')');
});
const overlayStart = source.indexOf('function VenuePickerOverlay(');
const overlayEnd = source.indexOf('export default function GameUI()', overlayStart);
const stylesStart = source.indexOf('const venueStyles =');
const stylesEnd = source.indexOf('const styles =', stylesStart);
assert.ok(overlayStart >= 0 && overlayEnd > overlayStart && stylesEnd > stylesStart);
const { code } = await transformWithOxc(
  source.slice(overlayStart, overlayEnd) + source.slice(stylesStart, stylesEnd),
  'venue-picker.jsx',
  { jsx: { runtime: 'classic' } },
);
const VenuePickerOverlay = vm.runInNewContext(code + '\nVenuePickerOverlay;', {
  React, uiButton, uiIconButton,
  getAvailableDexConfigs: () => [
    {id:'decibel',label:'Decibel',chain:'Aptos',logo:'/decibel.png'},
    ...logoVenues,
  ],
});

function descendants(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(descendants)];
}

test('Robinhood Lighter card renders both local logos and still selects the same venue', () => {
  const picks = [];
  const tree = VenuePickerOverlay({onClose:()=>{},onPick:id=>picks.push(id)});
  const card = descendants(tree).find(node=>node.type === 'button'
    && descendants(node).some(child=>child.type === 'strong' && child.props.children === 'ROBINHOOD LIGHTER'));
  assert.ok(card);
  const logos = descendants(card).filter(node=>node.type === 'img');
  assert.deepEqual(logos.map(node=>node.props.src), ['/lighter.svg', '/robinhood.svg']);
  assert.deepEqual(logos.map(node=>node.props.alt), ['Lighter', 'Robinhood']);
  for (const logo of logos) {
    assert.equal(logo.props.style.width, 28);
    assert.equal(logo.props.style.height, 28);
    assert.equal(logo.props.style.objectFit, 'contain');
  }
  const wrapper = descendants(card).find(node=>node.props.style?.width === 64);
  assert.equal(wrapper.props.style.gap, 4);
  assert.equal(wrapper.props.style.alignItems, 'center');
  assert.equal(wrapper.props.style.justifyContent, 'center');
  assert.ok(28 * 2 + wrapper.props.style.gap <= wrapper.props.style.width);
  assert.match(renderToStaticMarkup(card), /src="\/robinhood\.svg" alt="Robinhood"/);
  card.props.onClick();
  assert.deepEqual(picks, ['rhlighter']);
});

test('ordinary Lighter keeps its original single-logo card', () => {
  const tree = VenuePickerOverlay({onClose:()=>{},onPick:()=>{}});
  const card = descendants(tree).find(node=>node.type === 'button'
    && descendants(node).some(child=>child.type === 'strong' && child.props.children === 'LIGHTER'));
  const logos = descendants(card).filter(node=>node.type === 'img');
  assert.equal(logos.length, 1);
  assert.equal(logos[0].props.src, '/lighter.svg');
  assert.equal(logos[0].props.style.maxHeight, 32);
  assert.doesNotMatch(renderToStaticMarkup(card), /robinhood\.svg/);
});

test('Robinhood asset is a local standalone green SVG without active or remote content', () => {
  const asset = readFileSync(new URL('./public/robinhood.svg', import.meta.url), 'utf8');
  assert.match(asset, /fill="#CCFF00"/);
  assert.match(asset, /viewBox="0 0 24 24"/);
  assert.match(asset, /<title>Robinhood<\/title>/);
  assert.match(asset, /<path d="M/);
  assert.doesNotMatch(asset, /<(script|foreignObject|image|use)\b|\bon\w+=|\bhref=/i);
});

function actualCallback(name) {
  const start = source.indexOf('const ' + name + ' = useCallback(');
  const body = source.indexOf('useCallback(', start) + 'useCallback('.length;
  const end = source.indexOf('\n  }, [', body);
  assert.ok(start >= 0 && end > body, name + ' callback must exist');
  return source.slice(body, end + '\n  }'.length);
}

function actualEffect(anchor) {
  const marker = source.indexOf(anchor);
  const start = source.lastIndexOf('useEffect(', marker) + 'useEffect('.length;
  const end = source.indexOf('\n  }, [', marker);
  assert.ok(marker >= 0 && end > start, anchor + ' effect must exist');
  return source.slice(start, end + '\n  }'.length);
}

const autoOpen = actualEffect('if (!solanaMobileReady) return;');
const manualOpen = actualEffect('const openVenuePicker = (event) =>');
function setup() {
  const state = {visible:true,dex:'hibachi',writes:[],events:new Map(),asyncReads:0};
  let resolveRead;
  const context = vm.createContext({
    player:{id:'player-a',token:'fixture-token'}, showRegister:false,
    solanaMobileReady:true, isSolanaMobile:false,
    dismissedVenuePickersRef:{current:new Set()},
    playerDexPreferenceKey,
    shouldBypassVenuePickerForLocalGuest:()=>false,
    LOCAL_GUEST_DEFAULT_DEX:'pacifica',
    setShowVenuePicker:value=>{state.visible=value;},
    setDex:value=>{state.dex=value;},
    isDexAvailableInContext:()=>true,
    readLastPlayerDexPreference:()=>'',
    readLastPlayerDexPreferenceAsync:()=>{
      state.asyncReads++;
      return new Promise(resolve=>{resolveRead=resolve;});
    },
    localStorage:{getItem:()=>null,setItem:(...args)=>state.writes.push(args)},
    addClientBreadcrumb:()=>{},
    window:{
      addEventListener:(name,fn)=>state.events.set(name,fn),
      removeEventListener:name=>state.events.delete(name),
    },
  });
  const run = callback => vm.runInContext('(' + callback + ')', context)();
  return {state,context,run,resolveRead:value=>resolveRead(value)};
}

test('visible, named 44px close button calls dismiss, not venue selection', () => {
  let closes = 0;
  const picks = [];
  const tree = VenuePickerOverlay({isSolanaMobile:false,onClose:()=>closes++,onPick:id=>picks.push(id)});
  const close = descendants(tree).find(node=>node.props['aria-label'] === 'Close trading venue picker');
  assert.ok(close);
  assert.equal(close.type, 'button');
  assert.equal(close.props.type, 'button');
  assert.equal(close.props.style.width, 44);
  assert.equal(close.props.style.height, 44);
  assert.equal(close.props.autoFocus, true);
  assert.ok(descendants(close).some(node=>node.type === 'svg'));
  const html = renderToStaticMarkup(tree);
  assert.match(html, /aria-label="Close trading venue picker"/);
  assert.match(html, /aria-labelledby="venue-picker-title"/);
  close.props.onClick();
  assert.equal(closes, 1);
  assert.deepEqual(picks, []);
  descendants(tree).find(node=>node.type === 'button' && !node.props['aria-label']).props.onClick();
  assert.deepEqual(picks, ['decibel']);
});

test('Escape dismisses and is not passed through to the game', () => {
  let closes = 0;
  let prevented = false;
  let stopped = false;
  const tree = VenuePickerOverlay({onClose:()=>closes++,onPick:()=>assert.fail('must not pick')});
  const dialog = descendants(tree).find(node=>node.props.role === 'dialog');
  dialog.props.onKeyDown({key:'Enter'});
  assert.equal(closes, 0);
  dialog.props.onKeyDown({key:'Escape',preventDefault:()=>{prevented=true;},stopPropagation:()=>{stopped=true;}});
  assert.equal(closes, 1);
  assert.ok(prevented && stopped);
});

test('closing does not change the current exchange or persist a fabricated selection', () => {
  const {state,context,run} = setup();
  run(actualCallback('dismissVenuePicker'));
  assert.equal(state.visible, false);
  assert.equal(state.dex, 'hibachi');
  assert.deepEqual(state.writes, []);
  assert.ok(context.dismissedVenuePickersRef.current.has('player:player-a'));
  assert.match(source, /onClose=\{dismissVenuePicker\}/);
});

test('player refreshes do not immediately reopen a dismissed picker', () => {
  const {state,context,run} = setup();
  run(actualCallback('dismissVenuePicker'));
  context.player = {id:'player-a',token:'fixture-token',gold:100};
  run(autoOpen);
  assert.equal(state.visible, false);
  assert.equal(state.asyncReads, 0);
});

for (const savedDex of ['', 'decibel']) {
  test('late preference read after dismissal is ignored: ' + (savedDex || 'empty'), async () => {
    const {state,run,resolveRead} = setup();
    const cleanup = run(autoOpen);
    run(actualCallback('dismissVenuePicker'));
    resolveRead(savedDex);
    await Promise.resolve();
    assert.equal(state.visible, false);
    assert.equal(state.dex, 'hibachi');
    assert.deepEqual(state.writes, []);
    cleanup();
  });
}

test('a different player can still receive the automatic picker', async () => {
  const {state,context,run,resolveRead} = setup();
  run(actualCallback('dismissVenuePicker'));
  context.player = {id:'player-b',token:'fixture-token-b'};
  const cleanup = run(autoOpen);
  assert.equal(state.asyncReads, 1);
  resolveRead('');
  await Promise.resolve();
  assert.equal(state.visible, true);
  cleanup();
});

test('explicit reopen still works after dismissal', () => {
  const {state,run} = setup();
  run(actualCallback('dismissVenuePicker'));
  const cleanup = run(manualOpen);
  state.events.get('clash-open-venue-picker')({detail:{source:'profile'}});
  assert.equal(state.visible, true);
  assert.equal(state.dex, 'hibachi');
  assert.deepEqual(state.writes, []);
  cleanup();
  assert.equal(state.events.size, 0);
});
