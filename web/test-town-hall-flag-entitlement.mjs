#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  emptyTownHallFlagEntitlement,
  parseTownHallFlagEntitlement,
  shouldChargeForTownHallFlagUpload,
} from './src/lib/townHallFlagEntitlement.js';

const pending = emptyTownHallFlagEntitlement();
assert.equal(pending.loaded, false);
assert.equal(shouldChargeForTownHallFlagUpload(pending), false);

const normal = parseTownHallFlagEntitlement({ recovery_upload_available: false });
assert.equal(normal.loaded, true);
assert.equal(shouldChargeForTownHallFlagUpload(normal), true);

const recovery = parseTownHallFlagEntitlement({
  recovery_upload_available: true,
  recovery_purchase_id: 817,
});
assert.equal(recovery.recoveryPurchaseId, 817);
assert.equal(shouldChargeForTownHallFlagUpload(recovery), false);

console.log('Town Hall flag client entitlement tests passed.');
