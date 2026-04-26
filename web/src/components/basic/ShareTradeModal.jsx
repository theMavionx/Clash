// Lightweight modal that previews the generated share image and offers
// share / download / close actions. Background image + overlay text are
// rendered to a canvas via generateShareImage; we then pull a PNG Blob,
// turn it into an objectURL, and show it in <img>. Same blob is reused
// for the share / download paths so we don't re-render twice.

import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateShareImage, canShareFiles, nativeShare, downloadImage, copyImage } from './generateShareImage';
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

  const [feedback, setFeedback] = useState(null); // { kind: 'ok'|'err', text }

  // Compute capability ONCE per modal open (it's static per device but
  // the feature-probe touches navigator so we don't run it on every render).
  const [hasNativeShare] = useState(() => canShareFiles());

  const runAction = async (fn, successText, autoClose = false) => {
    if (!blob || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await fn(blob);
      if (result.ok) {
        setFeedback({ kind: 'ok', text: successText });
        if (autoClose) setTimeout(() => onClose && onClose(), 1200);
      } else if (!result.cancelled) {
        setFeedback({ kind: 'err', text: result.error || 'Action failed' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleShare = () => runAction(nativeShare, 'Opened share sheet', true);
  const handleSave = () => runAction(downloadImage, 'Saved to your device');
  const handleCopy = () => runAction(copyImage, 'Copied — paste in any chat');

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
            {/* Native share opens the OS share sheet (Telegram, Twitter,
                Instagram, Save to Photos, AirDrop…). Hidden on desktop /
                contexts that don't support file sharing — replaced with
                Save + Copy so the user always has SOMETHING that works. */}
            {hasNativeShare && (
              <button
                onClick={handleShare}
                disabled={!blob || busy}
                style={{ ...S.shareBtn, ...((!blob || busy) ? S.btnDisabled : {}) }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5"
                     strokeLinecap="round" strokeLinejoin="round"
                     style={{ marginRight: 6 }}>
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                {busy ? 'Opening…' : 'Share'}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!blob || busy}
              style={{ ...S.altBtn, ...((!blob || busy) ? S.btnDisabled : {}) }}
              title="Save to your device"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round"
                   style={{ marginRight: 6 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Save
            </button>
            <button
              onClick={handleCopy}
              disabled={!blob || busy}
              style={{ ...S.altBtn, width: 56, padding: 0, ...((!blob || busy) ? S.btnDisabled : {}) }}
              title="Copy image — paste in chat"
              aria-label="Copy"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
          {feedback && (
            <div style={feedback.kind === 'ok' ? S.feedbackOk : S.feedbackErr}>
              {feedback.text}
            </div>
          )}
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
    flex: 2, padding: '12px',
    fontSize: 15, fontWeight: 900, color: '#fff',
    background: 'linear-gradient(180deg, #4caf50 0%, #2e7d32 100%)',
    borderWidth: 3, borderStyle: 'solid', borderColor: '#1b5e20',
    borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: '0.4px',
    textShadow: '0 1px 0 rgba(0,0,0,0.3)',
    boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  altBtn: {
    flex: 1, padding: '12px',
    fontSize: 14, fontWeight: 800, color: '#5C3A21',
    background: '#fdf8e7',
    borderWidth: 2, borderStyle: 'solid', borderColor: '#d4c8b0',
    borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
    boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6, cursor: 'wait',
  },
  feedbackOk: {
    fontSize: 12, fontWeight: 700,
    color: '#2e7d32',
    background: 'rgba(76, 175, 80, 0.12)',
    border: '1px solid #4caf50',
    padding: '6px 10px', borderRadius: 8,
    textAlign: 'center',
  },
  feedbackErr: {
    fontSize: 12, fontWeight: 700,
    color: '#c62828',
    background: 'rgba(239, 83, 80, 0.12)',
    border: '1px solid #ef5350',
    padding: '6px 10px', borderRadius: 8,
    textAlign: 'center',
  },
};
