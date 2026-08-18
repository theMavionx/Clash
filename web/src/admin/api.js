const KEY_STORAGE = 'admin_key';

function queryAdminKey() {
  try {
    const host = window.location.hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) return '';
    return new URLSearchParams(window.location.search).get('admin_key') || '';
  } catch {
    return '';
  }
}

export function getStoredAdminKey() {
  try {
    const keyFromQuery = queryAdminKey();
    if (keyFromQuery) {
      localStorage.setItem(KEY_STORAGE, keyFromQuery);
      return keyFromQuery;
    }
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function storeAdminKey(key) {
  try {
    localStorage.setItem(KEY_STORAGE, key || '');
  } catch {
    /* storage disabled */
  }
}

export function clearAdminKey() {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage disabled */
  }
}

export async function adminFetch(path, { key, method = 'GET', body, signal } = {}) {
  const response = await fetch('/api' + path, {
    method,
    signal,
    headers: {
      'x-admin-key': key || getStoredAdminKey(),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 403) {
    clearAdminKey();
    const err = new Error('Forbidden');
    err.status = response.status;
    throw err;
  }
  if (!response.ok) {
    const err = new Error(data?.error || data?.message || 'Request failed');
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function adminGet(path, options) {
  return adminFetch(path, { ...options, method: 'GET' });
}

export function adminPost(path, body, options) {
  return adminFetch(path, { ...options, method: 'POST', body });
}

export function adminPatch(path, body, options) {
  return adminFetch(path, { ...options, method: 'PATCH', body });
}

export function adminPut(path, body, options) {
  return adminFetch(path, { ...options, method: 'PUT', body });
}

export function adminDelete(path, options) {
  return adminFetch(path, { ...options, method: 'DELETE' });
}

export async function adminDownload(path, filename) {
  const response = await fetch('/api' + path, {
    headers: { 'x-admin-key': getStoredAdminKey() },
    cache: 'no-store',
  });
  if (!response.ok) {
    if (response.status === 403) clearAdminKey();
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Download failed (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'export.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
