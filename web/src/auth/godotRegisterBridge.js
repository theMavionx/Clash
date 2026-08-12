export const GODOT_REGISTER_BRIDGE_TIMEOUT_MS = 12000;

const bridgeReady = (bridgeWindow) => !!bridgeWindow?.godotBridge;

export function waitForGodotBridge({
  bridgeWindow = globalThis.window,
  timeoutMs = GODOT_REGISTER_BRIDGE_TIMEOUT_MS,
  pollIntervalMs = 100,
  isActive = () => true,
} = {}) {
  if (!isActive()) return Promise.resolve(false);
  if (bridgeReady(bridgeWindow)) return Promise.resolve(true);
  if (!bridgeWindow?.addEventListener) {
    return Promise.reject(new Error('Game connection is unavailable. Open the game and try again.'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let pollId = null;
    let timeoutId = null;

    const cleanup = () => {
      bridgeWindow.removeEventListener('clash-godot-bridge-ready', checkReady);
      if (pollId !== null) clearInterval(pollId);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const checkReady = () => {
      if (!isActive()) {
        finish(false);
        return;
      }
      if (bridgeReady(bridgeWindow)) finish(true);
    };

    bridgeWindow.addEventListener('clash-godot-bridge-ready', checkReady);
    pollId = setInterval(checkReady, pollIntervalMs);
    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Game is still loading. Wait a moment and try again.'));
    }, timeoutMs);
    // Close the add-listener race if Godot became ready between the first
    // synchronous check and listener registration.
    checkReady();
  });
}

export async function dispatchGodotRegister({
  sendToGodot,
  payload,
  bridgeWindow = globalThis.window,
  timeoutMs = GODOT_REGISTER_BRIDGE_TIMEOUT_MS,
  pollIntervalMs,
  isActive = () => true,
}) {
  if (typeof sendToGodot !== 'function') {
    throw new TypeError('sendToGodot must be a function');
  }

  const ready = await waitForGodotBridge({
    bridgeWindow,
    timeoutMs,
    pollIntervalMs,
    isActive,
  });
  if (!ready || !isActive()) return false;

  if (!sendToGodot('register', payload)) {
    throw new Error('Game connection was interrupted. Wait a moment and try again.');
  }
  return true;
}
