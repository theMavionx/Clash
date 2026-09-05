import test from 'node:test';
import assert from 'node:assert/strict';
import { imperialPopoverPosition } from './src/lib/imperialPopoverPosition.js';

test('right-hand ticket stays anchored to its edge, not viewport centre', () => {
  const p = imperialPopoverPosition({right:1256,top:230,bottom:274}, {left:0,top:0,width:1280,height:900}, 260);
  assert.deepEqual(p, {left:876,top:280,width:380,maxHeight:608});
});
test('320px mobile fits without horizontal overflow', () => {
  const p = imperialPopoverPosition({right:308,top:230,bottom:274}, {left:0,top:0,width:320,height:700}, 260);
  assert.equal(p.left,12); assert.equal(p.width,296); assert.equal(p.top,280);
});
test('opens above a low trigger and bounds expanded content', () => {
  const p = imperialPopoverPosition({right:1260,top:700,bottom:744}, {left:0,top:0,width:1280,height:800}, 800);
  assert.equal(p.top,54); assert.equal(p.maxHeight,640);
});
test('visual viewport offsets are respected', () => {
  const p = imperialPopoverPosition({right:450,top:600,bottom:644}, {left:100,top:300,width:390,height:450}, 260);
  assert.ok(p.left>=112); assert.ok(p.left+p.width<=478);
  assert.ok(p.top>=312); assert.ok(p.top+Math.min(260,p.maxHeight)<=738);
});
