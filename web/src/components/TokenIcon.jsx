import { useCallback, useEffect, useMemo, useState } from 'react';
import { canonTokenSymbol, tokenFallbackColor, tokenLogoSources } from '../lib/tokenLogos';

// v15 = stable generated stock/ETF badges are no longer treated as failed
//       logos, and the letter fallback stays visible while image probes load.
// v14 = fixes FX pair normalization/placeholders (USD/JPY, USD/CAD, etc.).
// v13 = tries local aliases before raw synthetic symbols like 1000BONK,
//       invalidating sessions that cached those raw symbols as missing.
// v12 = adds local Hotstuff/Decibel/Flash stock, ETF, index, and commodity
//       market logos; invalidates failed logo cache for those symbols.
// v11 = normalizes raw perp/quote symbols (BTC-PERP, BTC/USDT-P, BTCUSD)
//       before probing local/remote logo sources.
// v10 = retries all failed logos after symbol normalization fixes and uses
//       multi-letter ticker badges for final fallback.
// v9 = adds local Hot Stuff ANTHROPIC / SPCX generated badges and resets
//      failed logo cache for symbols that previously fell through.
// v8 = adds local Decibel MU / CBRS / SNDK logos.
// v7 = adds generated full-symbol SVG fallback for GRVT/new market symbols.
// v6 = removes remote FX/commodity probes that 404 on Parqet.
// v5 = invalidate cached "failed" entries after we bulk-imported ~120
//      Hyperliquid token logos (BIO, PNUT, PURR, NIL, GRIFFAIN, BLUR,
//      KNEIRO, PROMPT, LAYER, JELLY, HYPER, etc.) into /tokens/. Old
//      sessions had these marked as failed in localStorage so the
//      <img> probe was skipped even after files landed locally.
// v4 = invalidated entries from before we added local SKR.
// v3 invalidated MSATS / MET / SYRUP / BRENTOIL aliases. Bump
// whenever new local /tokens/* are added so users force a fresh probe.
const LOGO_CACHE_KEY = 'clash_token_logos_v15';
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
  const fallbackLabel = canon.length <= 5 ? canon : canon.slice(0, 5);
  const fallbackFontSize = size * (fallbackLabel.length <= 2 ? 0.5 : fallbackLabel.length <= 4 ? 0.38 : 0.32);
  const cached = logoCache.get(canon);
  const allSources = useMemo(() => tokenLogoSources(canon), [canon]);
  const sources = useMemo(
    () => (cached ? [cached, ...allSources.filter(url => url !== cached)] : allSources),
    [cached, allSources]
  );
  const hasGeneratedSource = useMemo(
    () => sources.some(url => String(url || '').startsWith('data:image/')),
    [sources]
  );
  const [srcIdx, setSrcIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState((logoFailed.has(canon) && !hasGeneratedSource) || sources.length === 0);

  useEffect(() => {
    setSrcIdx(0);
    setLoaded(false);
    setFailed((logoFailed.has(canon) && !hasGeneratedSource) || sources.length === 0);
  }, [canon, sources.length, hasGeneratedSource]);

  const onImgError = useCallback(() => {
    setLoaded(false);
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
    setLoaded(true);
    if (!url || (url.startsWith('/tokens/') && canon === '')) return;
    if (url.startsWith('data:image/')) return;
    if (logoCache.get(canon) === url) return;
    logoCache.set(canon, url);
    persistLogoCache();
  }, [sources, srcIdx, canon]);

  const activeSrc = !failed ? sources[srcIdx] : '';
  const showFallback = failed || !loaded || !activeSrc;
  // Keep a deterministic fallback under the probing image. The old component
  // rendered an empty transparent circle until `/tokens/*.svg` failed and the
  // next source loaded; in fast Ostium polling that read as logo flicker.
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: showFallback ? bg : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      {showFallback && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            fontSize: fallbackFontSize,
            fontWeight: 700,
            color: 'var(--terminal-on-accent)',
            lineHeight: 1,
          }}
        >
          {fallbackLabel || '?'}
        </span>
      )}
      {activeSrc ? (
        <img
          src={activeSrc}
          alt=""
          width={size}
          height={size}
          decoding="async"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 120ms ease',
          }}
          onError={onImgError}
          onLoad={onImgLoad}
        />
      ) : null}
    </div>
  );
}
