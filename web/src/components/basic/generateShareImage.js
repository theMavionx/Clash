// Canvas-based share-image generator. Returns a PNG Blob that can be
// passed to navigator.share() (mobile) or downloaded (desktop).
//
// Layout: background (win.jpg / lose.jpg) covers the canvas; a subtle
// dark gradient on the right third ensures the white text overlay always
// reads regardless of the source image's right-side brightness.

// Output canvas matches the source artwork's aspect ratio (lose.jpg is
// 1280×791 ≈ 1.618 — golden ratio). Using the same ratio means the
// `cover` fit shows the full image without cropping the knight's sword
// tip / shield / "Clash of Perps" caption. Twitter / Telegram / Discord
// previews adapt to the file's ratio so this still looks good.
const W = 1200;
const H = 742;  // 1200 / (1280/791) ≈ 742

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

// `cover` fit — fill the canvas without distortion, crop excess.
function drawCoverImage(ctx, img) {
  const imgRatio = img.width / img.height;
  const canvasRatio = W / H;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (imgRatio > canvasRatio) {
    // image wider — crop horizontally
    sw = img.height * canvasRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / canvasRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
}

function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '−';
  return `${sign}${Math.abs(v).toFixed(2)}%`;
}

function fmtPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

/**
 * Generate the share image.
 * @param {Object} trade
 * @param {string} trade.symbol     — "BTC"
 * @param {'long'|'short'} trade.side
 * @param {number} trade.leverage   — 5, 10, 20…
 * @param {number} trade.entryPrice
 * @param {number} trade.exitPrice  — close price OR live mark for open positions
 * @param {number} trade.pnlUsd     — realised (closed) or unrealised (open)
 * @param {number} trade.pnlPct     — same scope as pnlUsd
 * @param {boolean} trade.isOpen    — distinguishes "Mark" vs "Exit" label
 * @returns {Promise<Blob>}
 */
export async function generateShareImage(trade) {
  const isWin = Number(trade.pnlUsd) >= 0;

  // Pick background — win.jpg for green trades, lose.jpg for red.
  // win.jpg may not exist yet (placeholder until designer ships it); we
  // gracefully fall back to lose.jpg so the share never fails outright.
  let bg;
  try {
    bg = await loadImage(isWin ? '/win.jpg' : '/lose.jpg');
  } catch {
    try { bg = await loadImage('/lose.jpg'); } catch { bg = null; }
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background — image cover. If load failed, fall back to brand brown.
  if (bg) {
    drawCoverImage(ctx, bg);
  } else {
    ctx.fillStyle = '#5C3A21';
    ctx.fillRect(0, 0, W, H);
  }

  // Subtle left-side dark gradient — improves text legibility on bright
  // images. Mirrors the previous right-side version.
  const grad = ctx.createLinearGradient(0, 0, W * 0.45, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ---- Text layout (left column) ----
  const LEFT_X = 90;            // left margin — bumped up for breathing room
  // Entry/Mark value column — sits just to the right of the label rather
  // than stretching to mid-canvas. Keeps the row visually compact.
  const COL_VAL_X = LEFT_X + 240;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  // ---- Side | leverage | symbol ----
  const sideLabel = trade.side === 'long' ? 'LONG' : 'SHORT';
  const sideColor = trade.side === 'long' ? '#4caf50' : '#ef5350';
  let y = 110;
  ctx.font = '700 36px "Inter", "Segoe UI", sans-serif';

  // Render parts left-to-right starting at LEFT_X. Each segment uses its
  // own colour (coloured side label, dim separators, white lev/symbol).
  const lev = `${trade.leverage}×`;
  const sym = trade.symbol || '?';
  const sep = '  |  ';
  let x = LEFT_X;

  ctx.fillStyle = sideColor;
  ctx.fillText(sideLabel, x, y); x += ctx.measureText(sideLabel).width;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(sep, x, y); x += ctx.measureText(sep).width;
  ctx.fillStyle = '#fff';
  ctx.fillText(lev, x, y); x += ctx.measureText(lev).width;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(sep, x, y); x += ctx.measureText(sep).width;
  ctx.fillStyle = '#fff';
  ctx.fillText(sym, x, y);

  // ---- Big PnL % ----
  y += 130;
  ctx.font = '900 130px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = isWin ? '#4caf50' : '#ef5350';
  ctx.fillText(fmtPct(trade.pnlPct), LEFT_X, y);

  // ---- PnL in USD (slightly smaller, same colour) ----
  y += 60;
  ctx.font = '700 44px "Inter", "Segoe UI", sans-serif';
  ctx.fillText(fmtUsd(trade.pnlUsd), LEFT_X, y);

  // ---- Entry / Exit prices ----
  y += 70;
  ctx.font = '500 28px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';

  // Two-column row: label left-aligned at LEFT_X, value right-aligned at COL_VAL_X.
  const drawRow = (label, value) => {
    ctx.shadowBlur = 6;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(label, LEFT_X, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = '700 28px "Inter", "Segoe UI", sans-serif';
    ctx.fillText(value, COL_VAL_X, y);
    ctx.font = '500 28px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    y += 44;
  };

  drawRow('Entry', fmtPrice(trade.entryPrice));
  drawRow(trade.isOpen ? 'Mark' : 'Exit', fmtPrice(trade.exitPrice));

  // Reset shadow
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Export to PNG Blob.
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas export failed'));
    }, 'image/png', 0.95);
  });
}

// True when the browser can share files (native share sheet — covers
// Telegram, Twitter, Instagram, Save to Photos, AirDrop, etc.). Used by
// the modal to know whether to render the big native-share button.
export function canShareFiles() {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.canShare) return false;
  try {
    // Probe with a dummy file — `canShare` returns false if files aren't
    // supported in the current context (e.g. desktop Chrome, some iframe
    // contexts).
    const probe = new File([new Blob(['x'])], 'p.png', { type: 'image/png' });
    return !!navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Open the OS native share sheet. */
export async function nativeShare(blob, filename = 'clash-of-perps-trade.png') {
  const file = new File([blob], filename, { type: 'image/png' });
  try {
    await navigator.share({
      files: [file],
      title: 'My Clash of Perps trade',
      text: 'Just traded on Clash of Perps 🛡️⚔️',
    });
    return { ok: true };
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, cancelled: true };
    return { ok: false, error: e?.message || 'Share failed' };
  }
}

/**
 * Save the image — tries `<a download>` first; on iOS Safari (which
 * silently ignores download attribute on blobs in some cases) falls back
 * to opening in a new tab so the user can long-press → Save Image.
 */
export async function downloadImage(blob, filename = 'clash-of-perps-trade.png') {
  const url = URL.createObjectURL(blob);
  const cleanup = () => setTimeout(() => URL.revokeObjectURL(url), 30_000);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // iOS Safari quirk: `download` attribute is honoured only on https +
    // not always for blobs. Open the blob in a new tab as a parallel
    // safety net — the user can long-press to save if download did
    // nothing visible.
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (isIOS) {
      try { window.open(url, '_blank', 'noopener'); } catch { /* popup blocked */ }
    }
    cleanup();
    return { ok: true };
  } catch (e) {
    cleanup();
    return { ok: false, error: e?.message || 'Download failed' };
  }
}

/** Copy the image to clipboard — useful for Telegram/Discord paste. */
export async function copyImage(blob) {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) {
      return { ok: false, error: 'Clipboard not supported' };
    }
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'Copy failed' };
  }
}
