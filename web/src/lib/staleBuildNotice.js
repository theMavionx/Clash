// Detects a tab running an old deploy and offers a one-click reload.
//
// Players keep the game open for a day or more; after a deploy their tab still
// runs the previous bundle and calls endpoints whose contract has changed
// (e.g. GRVT leverage now needs a signed position config). We compare the
// entry script hashed by Vite in the live document with the one in a fresh
// /index.html. No build id plumbing is needed: a deploy changes the hash.

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
const NOTICE_ID = 'clash-stale-build-notice';

/** Entry module script ("/assets/main-HASH.js") from an HTML string or document. */
export function entryScriptFromHtml(html) {
  const match = /<script[^>]+type=["']module["'][^>]*\ssrc=["']([^"']*\/assets\/[^"']+\.js)["']/i.exec(String(html || ''))
    || /<script[^>]+src=["']([^"']*\/assets\/[^"']+\.js)["'][^>]*type=["']module["']/i.exec(String(html || ''));
  return match ? normalizeAssetPath(match[1]) : null;
}

function normalizeAssetPath(src) {
  try { return new URL(src, 'https://x.invalid').pathname; } catch { return String(src || ''); }
}

function currentEntryScript() {
  try {
    const script = Array.from(document.querySelectorAll('script[type="module"][src]'))
      .find(s => /\/assets\/[^/]+\.js/.test(s.getAttribute('src') || ''));
    return script ? normalizeAssetPath(script.getAttribute('src')) : null;
  } catch {
    return null;
  }
}

/** True when the deployed entry differs from the running one (both known). */
export function isStaleBuild(running, deployed) {
  return !!running && !!deployed && running !== deployed;
}

function showNotice() {
  if (document.getElementById(NOTICE_ID)) return;
  const box = document.createElement('div');
  box.id = NOTICE_ID;
  box.setAttribute('role', 'status');
  box.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%)',
    'z-index:2147483000', 'display:flex', 'align-items:center', 'gap:10px',
    'max-width:calc(100vw - 32px)', 'padding:10px 12px 10px 14px', 'border-radius:12px',
    'background:#1b1e27', 'color:#f3f4f6', 'border:1px solid rgba(255,255,255,0.14)',
    'box-shadow:0 8px 28px rgba(0,0,0,0.45)', 'font:500 13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif',
  ].join(';');
  const text = document.createElement('span');
  text.textContent = 'A new version of Clash is out. Reload to keep trading smoothly.';
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.style.cssText = 'flex:none;padding:6px 12px;border-radius:8px;border:0;background:#f5b62a;color:#111;font:600 13px system-ui,sans-serif;cursor:pointer';
  reload.addEventListener('click', () => { try { window.location.reload(); } catch {} });
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '×';
  close.style.cssText = 'flex:none;padding:0 4px;border:0;background:transparent;color:#9ca3af;font:600 18px system-ui,sans-serif;cursor:pointer';
  close.addEventListener('click', () => { box.remove(); });
  box.append(text, reload, close);
  document.body.appendChild(box);
}

export function installStaleBuildNotice({ fetchImpl = (...a) => window.fetch(...a) } = {}) {
  if (typeof window === 'undefined' || import.meta.env?.DEV) return;
  const running = currentEntryScript();
  if (!running) return;
  let lastCheck = 0;
  let inFlight = false;
  let notified = false;

  const check = async () => {
    const now = Date.now();
    if (notified || inFlight || now - lastCheck < MIN_GAP_MS) return;
    lastCheck = now;
    inFlight = true;
    try {
      const res = await fetchImpl(`/index.html?stale-check=${now}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return;
      const deployed = entryScriptFromHtml(await res.text());
      if (isStaleBuild(running, deployed)) {
        notified = true;
        showNotice();
        try { console.info('[stale-build] running', running, 'deployed', deployed); } catch {}
      }
    } catch {
      // offline or blocked: try again later
    } finally {
      inFlight = false;
    }
  };

  setInterval(check, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
}
