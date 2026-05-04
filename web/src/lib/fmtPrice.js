// Shared price formatter — used by FuturesPanel and Basic-mode pickers.
// Centralises the sub-tenth-of-a-cent rendering rule so SHIB / mSATS /
// other micro-perp synths look the same across every UI surface.
//
// Format:
//   ≥ 1000          → integer with thousands separator (78,250)
//   ≥ 1             → 2 decimals  (3.34)
//   ≥ 0.01          → 4 decimals  (0.0123)
//   ≥ 0.0001        → 6 decimals  (0.000123)
//   < 0.0001        → subscript-zero notation:
//                     0.0₇153  = "0.<seven zeros>153" = 1.53e-8
//                     same convention DefiLlama / Dexscreener / GMGN use.
//   ≤ 0 / NaN       → "—"

const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

function subscriptN(n) {
  return String(n).split('').map(d => SUBSCRIPT_DIGITS[Number(d)] || d).join('');
}

export function fmtPrice(p) {
  const n = Number(p);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  // Subscript notation. For 1.53e-8: exp=-8 → zerosAfterDecimal=7 → "0.0₇153".
  const exp = Math.floor(Math.log10(n));
  const zeros = -exp - 1;
  const sig = Math.round(n * Math.pow(10, zeros + 3));
  return `0.0${subscriptN(zeros)}${String(sig).padStart(3, '0')}`;
}
