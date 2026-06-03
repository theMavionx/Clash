const PENDING_UPDATE_KEY = 'clash_pending_update_v1';

let activity = {
  selected_dex: null,
  active_scope: null,
  futures_busy: false,
  critical_action: false,
};

function safeDispatch(type, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  } catch {
    /* noop */
  }
}

function readPending() {
  try {
    const raw = sessionStorage.getItem(PENDING_UPDATE_KEY) || localStorage.getItem(PENDING_UPDATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePending(update) {
  try { sessionStorage.setItem(PENDING_UPDATE_KEY, JSON.stringify(update)); } catch { /* noop */ }
  try { localStorage.setItem(PENDING_UPDATE_KEY, JSON.stringify(update)); } catch { /* noop */ }
}

function clearPending() {
  try { sessionStorage.removeItem(PENDING_UPDATE_KEY); } catch { /* noop */ }
  try { localStorage.removeItem(PENDING_UPDATE_KEY); } catch { /* noop */ }
}

export function setClientActivity(patch = {}) {
  activity = { ...activity, ...patch };
  try {
    window.__clashClientActivity = { ...activity };
  } catch {
    /* noop */
  }
  safeDispatch('clash:activity', { activity: { ...activity } });
}

export function getClientActivity() {
  return { ...activity };
}

export function hasCriticalClientActivity() {
  return !!(activity.critical_action || activity.futures_busy);
}

export function requestClientUpdate(update = {}) {
  const pending = {
    reason: update.reason || 'app_update',
    version: update.version || null,
    scope: update.scope || null,
    chunk_name: update.chunk_name || null,
    created_at: new Date().toISOString(),
    activity: { ...activity },
  };
  writePending(pending);
  safeDispatch('clash:update-available', { update: pending });
  return pending;
}

export function getPendingClientUpdate() {
  return readPending();
}

export function clearPendingClientUpdate() {
  clearPending();
}

export function applyPendingClientUpdate() {
  const update = readPending();
  clearPending();
  try {
    const version = update?.version;
    if (version && window.caches?.keys) {
      window.caches.keys()
        .then((names) => Promise.all(
          names
            .filter((name) => /^clash-runtime-/.test(name) && name !== version)
            .map((name) => window.caches.delete(name))
        ))
        .catch(() => {})
        .finally(() => window.location.reload());
      return;
    }
  } catch {
    /* fall through */
  }
  window.location.reload();
}
