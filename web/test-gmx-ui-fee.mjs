import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GMX_UI_FEE_BPS,
  GMX_UI_FEE_FACTOR,
  GMX_UI_FEE_RECEIVER,
  gmxUiFeeFactorKey,
  isGmxUiFeeOwner,
  withGmxUiFee,
} from './src/lib/gmxUiFee.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const hookSource = fs.readFileSync(path.join(here, 'src/hooks/useGmx.js'), 'utf8');

assert.equal(GMX_UI_FEE_RECEIVER, '0x412A02Ba415e5969596E6f0A35f9439760a3468F');
assert.equal(GMX_UI_FEE_BPS, 1);
assert.equal(GMX_UI_FEE_FACTOR, 100000000000000000000000000n);
assert.equal(
  gmxUiFeeFactorKey(),
  '0xa14fd3d4921cf06faec082f6b75680fbfb57eafd97ccc3bfa153821643362e8c',
);

const routed = withGmxUiFee({ kind: 'increase', uiFeeReceiver: '0x0000000000000000000000000000000000000001' });
assert.equal(routed.kind, 'increase');
assert.equal(routed.uiFeeReceiver, GMX_UI_FEE_RECEIVER);
assert.equal(isGmxUiFeeOwner(GMX_UI_FEE_RECEIVER.toLowerCase()), true);
assert.equal(isGmxUiFeeOwner('0x0000000000000000000000000000000000000001'), false);
assert.throws(() => withGmxUiFee(null), /must be an object/u);

const routedPrepareCalls = hookSource.match(/prepareOrder\(withGmxUiFee\(\{/gu) || [];
assert.equal(routedPrepareCalls.length, 4, 'market, limit, close and TP/SL prepare calls must be routed');
assert.match(hookSource, /const tpsl = buildGmxOpenTpsl\(options, sizeUsd\);[\s\S]*?prepareOrder\(withGmxUiFee/u);
assert.match(hookSource, /functionName: 'setUiFeeFactor'/u);
assert.match(hookSource, /BigInt\(factor\) === GMX_UI_FEE_FACTOR/u);

console.log('GMX_UI_FEE_WEB_TEST_PASS');
