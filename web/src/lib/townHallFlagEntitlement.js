export function emptyTownHallFlagEntitlement(overrides = {}) {
  return {
    loaded: false,
    loading: false,
    recoveryUploadAvailable: false,
    recoveryPurchaseId: null,
    error: '',
    ...overrides,
  };
}

export function parseTownHallFlagEntitlement(payload = {}) {
  return emptyTownHallFlagEntitlement({
    loaded: true,
    recoveryUploadAvailable: payload.recovery_upload_available === true,
    recoveryPurchaseId: payload.recovery_purchase_id || null,
  });
}

export function shouldChargeForTownHallFlagUpload(entitlement) {
  return entitlement?.loaded === true && entitlement?.recoveryUploadAvailable !== true;
}
