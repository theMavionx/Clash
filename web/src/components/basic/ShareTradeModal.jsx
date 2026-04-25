// Lightweight modal that previews the generated share image and offers
// share / download / close actions. Background image + overlay text are
// rendered to a canvas via generateShareImage; we then pull a PNG Blob,
// turn it into an objectURL, and show it in <img>. Same blob is reused
// for the share / download paths so we don't re-render twice.

import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateShareImage, shareOrDownload } from './generateShareImage';
import { colors } from './styles';

function ShareTradeModal({ open, trade, onClose }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Generate when modal opens. The preview blob is cached in state until
  // close so Share / Download don't re-render the canvas.
  useEffect(() => {
    if (!open || !trade) return;
    let cancelled = false;
    setError(null);
    setBlob(null);
    setPreviewUrl(null);
    (async () => {
      try {
        const b = await generateShareImage(trade);
        if (cancelled) return;
        setBlob(b);
        setPreviewUrl(URL.createObjectURL(b));
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || 'Could not render share image');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, trade]);

  // Revoke blob URL on unmount / change so we don't leak memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleShare = async () => {
    if (!blob || busy) return;
    setBusy(true);
    try {
      await shareOrDownload(blob);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={S.backdrop}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, y: 16, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, y: 8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          style={S.modal}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={S.header}>
            <span style={S.title}>Share your trade</span>
            <button onClick={onClose} style={S.closeBtn} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="3.5"
                   strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div style={S.previewWrap}>
            {previewUrl ? (
              <img src={previewUrl} alt="Trade preview" style={S.preview} />
            ) : error ? (
              <div style={S.errorBox}>⚠ {error}</div>
            ) : (
              <div style={S.loading}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, ease: 'linear', duration: 1 }}
                  style={S.spinner}
                />
                <span>Rendering…</span>
              </div>
            )}
          </div>

          <div style={S.actions}>
            <button
              onClick={handleShare}
              disabled={!blob || busy}
              style={{ ...S.shareBtn, ...((!blob || busy) ? S.btnDisabled : {}) }}
            >
              {busy ? 'Opening…' : 'Share'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(ShareTradeModal);

const S = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16, zIndex: 10000,
    // GameUI's outer overlay div sets `pointer-events: none` so clicks
    // fall through to the Godot canvas behind it. Without restoring
    // pointer-events here, the modal renders but its X / Share / backdrop-
    // tap-to-dismiss all silently failed (clicks went past the modal to
    // the panel below).
    pointerEvents: 'auto',
  },
  modal: {
    width: '100%', maxWidth: 460,
    background: 'linear-gradient(180deg, #fdf8e7 0%, #f3ebd1 100%)',
    borderWidth: 4, borderStyle: 'solid', borderColor: '#5C3A21',
    borderRadius: 18,
    padding: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
    display: 'flex', flexDirection: 'column', gap: 12,
    fontFamily: '"Inter","Segoe UI",sans-serif',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  title: {
    fontSize: 16, fontWeight: 900, color: colors.ink,
    letterSpacing: '0.4px',
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    background: 'rgba(92,58,33,0.08)', border: 'none',
    color: colors.ink, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  previewWrap: {
    width: '100%',
    aspectRatio: '1200 / 742',  // matches generateShareImage canvas
    background: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  preview: {
    width: '100%', height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  loading: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    color: colors.inkSoft, fontSize: 13, fontWeight: 600,
  },
  spinner: {
    width: 28, height: 28,
    borderWidth: 3, borderStyle: 'solid', borderColor: colors.border,
    borderTopColor: colors.ink,
    borderRadius: '50%',
    boxSizing: 'border-box',
  },
  errorBox: {
    color: colors.shortDark, fontSize: 13, fontWeight: 700,
    textAlign: 'center', padding: 12,
  },
  actions: {
    display: 'flex', gap: 8,
  },
  shareBtn: {
    flex: 1, padding: '12px',
    fontSize: 15, fontWeight: 900, color: '#fff',
    background: 'linear-gradient(180deg, #4caf50 0%, #2e7d32 100%)',
    borderWidth: 3, borderStyle: 'solid', borderColor: '#1b5e20',
    borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: '0.4px',
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
    boxSizing: 'border-box',
  },
  btnDisabled: {
    opacity: 0.6, cursor: 'wait',
  },
};
