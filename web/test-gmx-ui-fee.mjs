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

assert.equal(GMX_UI_FEE_RECEIVER, '0x39B36f1EDF2eF5a6f2e02991b3a85Fb356eB5005');
assert.equal(GMX_UI_FEE_BPS, 1);
assert.equal(GMX_UI_FEE_FACTOR, 100000000000000000000000000n);
assert.equal(
  gmxUiFeeFactorKey(),
  '0x15e1ba63791f41b4288a53e197e3d973e74b8750e9d5f30e84b0fbf388abe97a',
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

// setUiFeeFactor must target the ExchangeRouter that currently holds the
// CONTROLLER role. 0x1C3fa76e...6A41 (SDK 1.5 bundle) was deauthorized and
// reverts with Unauthorized, so activating the fee from it can never work.
const configSource = fs.readFileSync(path.join(here, 'src/lib/gmxConfig.js'), 'utf8');
assert.match(configSource, /GMX_EXCHANGE_ROUTER = '0x7dE39FF2e232A2203196788d37e234cF8F1b83f1'/u);
assert.doesNotMatch(configSource, /GMX_EXCHANGE_ROUTER = '0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41'/u);
assert.match(configSource, /GMX_SYNTHETICS_ROUTER = '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6'/u,
  'USDC approvals stay on the unchanged Router used by every ExchangeRouter');
assert.doesNotMatch(configSource, /gmx-synthetics-arbitrum:live/u, 'the :live Subsquid path returns 404');
assert.match(hookSource, /address: GMX_EXCHANGE_ROUTER,\s*abi: GMX_UI_FEE_ROUTER_ABI/u);

console.log('GMX_UI_FEE_WEB_TEST_PASS');
