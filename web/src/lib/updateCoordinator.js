const PENDING_UPDATE_KEY = 'clash_pending_update_v1';
const AUTO_UPDATE_APPLY_PREFIX = 'clash_auto_update_applied_';

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

function updateApplyKey(update = {}) {
  const raw = [
    update.version || 'unknown',
    update.reason || 'app_update',
    update.scope || 'app',
    update.chunk_name || '',
  ].join(':');
  return `${AUTO_UPDATE_APPLY_PREFIX}${raw.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 160)}`;
}

function markAutoApplyScheduled(update) {
  try {
    const key = updateApplyKey(update);
    if (sessionStorage.getItem(key) === '1') return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}

function reloadLatestApp() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_clash_update', Date.now().toString(36));
    window.location.replace(url.toString());
    return;
  } catch {
    /* fall through */
  }
  window.location.reload();
}

function clearOldRuntimeCaches(version) {
  try {
    if (!window.caches?.keys) return Promise.resolve();
    return window.caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => /^clash-runtime-/.test(name) && (!version || name !== version))
          .map((name) => window.caches.delete(name))
      ))
      .catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

export function markClientInteractive() {
  try {
    window.__clashAppInteractive = true;
    window.__clashAppInteractiveAt = Date.now();
  } catch {
    /* noop */
  }
}

export function isClientBootLoading() {
  try {
    return window.__clashAppInteractive !== true;
  } catch {
    return true;
  }
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
  scheduleClientUpdateAutoApply(pending);
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
  clearOldRuntimeCaches(update?.version).finally(reloadLatestApp);
}

export function canAutoApplyClientUpdate(update = readPending()) {
  if (!update) return false;
  if (!isClientBootLoading()) return false;
  return !hasCriticalClientActivity();
}

export function scheduleClientUpdateAutoApply(update = readPending(), options = {}) {
  if (!canAutoApplyClientUpdate(update)) return false;
  if (!markAutoApplyScheduled(update)) return true;
  const delayMs = Math.max(0, Number(options.delayMs ?? 120));
  window.setTimeout(() => {
    if (!hasCriticalClientActivity()) applyPendingClientUpdate();
  }, delayMs);
  return true;
}
