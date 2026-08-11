import { useCallback, useEffect, useState } from 'react';
import { normalizeOndoRegionAccess } from '../lib/ondoClient';

const REGION_CACHE_TTL_MS = 30_000;
const IDLE_ACCESS = Object.freeze({
  allowed: null,
  status: 'idle',
  country: null,
  regionCode: null,
  reason: null,
  message: null,
});

let cachedAccess = null;
let cachedAt = 0;
let pendingAccess = null;

function freshCachedAccess() {
  return cachedAccess && Date.now() - cachedAt < REGION_CACHE_TTL_MS ? cachedAccess : null;
}
async function requestRegionAccess({ force = false } = {}) {
  if (!force) {
    const cached = freshCachedAccess();
    if (cached) return cached;
    if (pendingAccess) return pendingAccess;
  }
  const request = (async () => {
    const response = await fetch('/api/futures/ondo/eligibility', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Ondo region check failed (${response.status})`);
    const access = normalizeOndoRegionAccess(payload);
    cachedAccess = access;
    cachedAt = Date.now();
    return access;
  })();
  pendingAccess = request;
  try {
    return await request;
  } finally {
    if (pendingAccess === request) pendingAccess = null;
  }
}

export function useOndoRegionAccess(active = true) {
  const [regionAccess, setRegionAccess] = useState(() => (
    active
      ? (freshCachedAccess() || { ...IDLE_ACCESS, status: 'checking' })
      : IDLE_ACCESS
  ));

  const checkRegionAccess = useCallback(async ({ force = false } = {}) => {
    setRegionAccess(previous => ({ ...previous, allowed: null, status: 'checking', message: null }));
    try {
      const access = await requestRegionAccess({ force });
      setRegionAccess(access);
      return access;
    } catch {
      const unavailable = {
        allowed: false,
        status: 'unavailable',
        country: null,
        regionCode: null,
        reason: 'verification_unavailable',
        message: 'Unable to verify whether Ondo Perps is available in your region. Please retry.',
      };
      setRegionAccess(unavailable);
      return unavailable;
    }
  }, []);

  const markRegionBlocked = useCallback((payload = {}) => {
    const blocked = normalizeOndoRegionAccess({ ...payload, allowed: false, status: 'blocked' });
    cachedAccess = blocked;
    cachedAt = Date.now();
    setRegionAccess(blocked);
    return blocked;
  }, []);

  useEffect(() => {
    if (!active) {
      setRegionAccess(IDLE_ACCESS);
      return;
    }
    void checkRegionAccess();
  }, [active, checkRegionAccess]);

  const retryRegionAccess = useCallback(() => checkRegionAccess({ force: true }), [checkRegionAccess]);

  return {
    regionAccess,
    checkRegionAccess,
    retryRegionAccess,
    markRegionBlocked,
  };
}
