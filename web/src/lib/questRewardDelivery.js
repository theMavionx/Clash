const RESOURCE_KEYS = ['gold', 'wood', 'ore'];

export function questRewardPending(value = {}) {
  return Object.fromEntries(RESOURCE_KEYS.map(key => [key, Math.max(0, Math.floor(Number(value?.[key]) || 0))]));
}

// Quest rewards may be partly reserved. Never add the advertised amount to
// the HUD optimistically; synchronize only a complete authoritative balance.
export function syncQuestResources(resources, bridge = globalThis.window) {
  if (!resources || RESOURCE_KEYS.some(key => resources[key] == null
    || !Number.isFinite(Number(resources[key])) || Number(resources[key]) < 0)) return false;
  const next = Object.fromEntries(RESOURCE_KEYS.map(key => [key, Number(resources[key])]));
  bridge?.onGodotMessage?.({ action: 'resources', data: next });
  bridge?.godotBridge?.(JSON.stringify({ action: 'set_resources', data: next }));
  return true;
}
