import { useCallback, useEffect, useMemo, useState } from 'react';
import { canonTokenSymbol, tokenFallbackColor, tokenLogoSources } from '../lib/tokenLogos';

const LOGO_CACHE_KEY = 'clash_token_logos_v2';
const LOGO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const logoCache = new Map();
const logoFailed = new Set();

(function hydrateLogoCacheFromStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOGO_CACHE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    const now = Date.now();
    for (const [sym, entry] of Object.entries(obj || {})) {
      if (!entry || typeof entry !== 'object') continue;
      if (now - (entry.ts || 0) > LOGO_CACHE_TTL_MS) continue;
      if (entry.url) logoCache.set(sym, entry.url);
      else logoFailed.add(sym);
    }
  } catch {}
})();

let logoPersistTimer = null;
function persistLogoCache() {
  if (typeof localStorage === 'undefined') return;
  if (logoPersistTimer) clearTimeout(logoPersistTimer);
  logoPersistTimer = setTimeout(() => {
    try {
      const obj = {};
      const now = Date.now();
      for (const [sym, url] of logoCache) obj[sym] = { url, ts: now };
      for (const sym of logoFailed) if (!(sym in obj)) obj[sym] = { url: null, ts: now };
      localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(obj));
    } catch {}
  }, 500);
}

export default function TokenIcon({ sym, size = 20, fallbackColor, style }) {
  const canon = canonTokenSymbol(sym);
  const bg = fallbackColor || tokenFallbackColor(canon);
  const cached = logoCache.get(canon);
  const allSources = useMemo(() => tokenLogoSources(canon), [canon]);
  const sources = useMemo(
    () => (cached ? [cached, ...allSources.filter(url => url !== cached)] : allSources),
    [cached, allSources]
  );
  const [srcIdx, setSrcIdx] = useState(0);
  const [failed, setFailed] = useState(logoFailed.has(canon) || sources.length === 0);

  useEffect(() => {
    setSrcIdx(0);
    setFailed(logoFailed.has(canon) || sources.length === 0);
  }, [canon, sources.length]);

  const onImgError = useCallback(() => {
    if (srcIdx < sources.length - 1) {
      setSrcIdx(srcIdx + 1);
    } else {
      logoFailed.add(canon);
      persistLogoCache();
      setFailed(true);
    }
  }, [srcIdx, sources.length, canon]);

  const onImgLoad = useCallback(() => {
    const url = sources[srcIdx];
    if (!url || (url.startsWith('/tokens/') && canon === '')) return;
    if (logoCache.get(canon) === url) return;
    logoCache.set(canon, url);
    persistLogoCache();
  }, [sources, srcIdx, canon]);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      {!failed ? (
        <img
          src={sources[srcIdx]}
          alt=""
          width={size}
          height={size}
          style={{ borderRadius: '50%', objectFit: 'cover' }}
          onError={onImgError}
          onLoad={onImgLoad}
        />
      ) : (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            fontSize: size * 0.5,
            fontWeight: 900,
            color: '#fff',
          }}
        >
          {(canon || '?').charAt(0)}
        </span>
      )}
    </div>
  );
}
