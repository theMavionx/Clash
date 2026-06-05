const KEY_STORAGE = 'admin_key';

export function getStoredAdminKey() {
  try {
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

export function adminDelete(path, options) {
  return adminFetch(path, { ...options, method: 'DELETE' });
}
