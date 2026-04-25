// BasicTradeFlow — 5-step wizard that replaces the Trade tab content for
// users in `basic` futures mode. Pulls live data from the existing
// usePacifica/useAvantis hook (passed in via props from FuturesPanel) and
// uses the same `placeMarketOrder` underneath, so this is purely a
// presentation layer — no new server contract, no new trade pipeline.
//
// State machine: token → direction → amount → leverage → confirm → success.
// `submitting` / `submitted` flags gate side-effects so the user can't
// double-fire the trade.

import { memo, useCallback, useMemo, useRef, useState } from 'react';
// eslint-disable-next-line no-unused-vars -- used as JSX namespace (`motion.div`), false positive
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import BasicTokenPicker from './BasicTokenPicker';
import BasicDirectionPicker from './BasicDirectionPicker';
import BasicAmountSlider from './BasicAmountSlider';
import BasicLeveragePicker from './BasicLeveragePicker';
import BasicConfirm from './BasicConfirm';
import { colors, shared } from './styles';

const STEPS = ['token', 'direction', 'amount', 'leverage', 'confirm'];

// Slide animation between steps. We slide horizontally to reinforce the
// "checkout flow" mental model (forward = right, back = left).
const variants = {
  enter: (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

function fireConfetti() {
  try {
    const end = Date.now() + 600;
    const colors_ = ['#43a047', '#e8b830', '#0EA5E9', '#fdf8e7'];
    (function frame() {
      confetti({
        particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.7 },
        colors: colors_, scalar: 0.9,
      });
      confetti({
        particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.7 },
        colors: colors_, scalar: 0.9,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  } catch { /* canvas-confetti can fail in restricted iframes — silent fall-through */ }
}

function BasicTradeFlow({
  markets, prices, account, walletUsdc,
  placeMarketOrder, setLeverageApi, setMarginMode,
  marginModes, leverageSettings,
  dex,
  setActiveTab,
  // Pacifica agent-wallet — silent-trade infra. Pro tab doesn't need it
  // because the user is already comfortable with multi-popup flow there.
  pacAgent, bindAgent, bindingAgent, bindAgentError,
}) {
  const [step, setStep] = useState('token');
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back (for slide anim)
  const [pickedToken, setPickedToken] = useState(null);
  const [pickedDir, setPickedDir] = useState(null); // 'long' | 'short'
  const [pickedAmount, setPickedAmount] = useState(0);
  const [pickedLev, setPickedLev] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const submittedRef = useRef(false);

  // Find live price for the picked symbol. Memoised so we don't re-derive
  // on every parent re-render.
  const livePrice = useMemo(() => {
    if (!pickedToken || !Array.isArray(prices)) return 0;
    const p = prices.find(x => x.symbol === pickedToken.symbol);
    return Number(p?.mid || p?.mark || 0);
  }, [pickedToken, prices]);

  // Available USD: prefer the on-DEX account balance; fall back to wallet
  // USDC for users who haven't deposited yet so the amount step still
  // shows something sensible.
  const balance = useMemo(() => {
    const accBal = Number(account?.available_to_spend || account?.balance || 0);
    if (accBal > 0) return accBal;
    return Number(walletUsdc || 0);
  }, [account, walletUsdc]);

  const goto = useCallback((next, dir = 1) => {
    setDirection(dir);
    setStep(next);
  }, []);

  const handlePickToken = useCallback((m) => {
    setPickedToken(m);
    goto('direction', 1);
  }, [goto]);

  const handlePickDirection = useCallback((d) => {
    setPickedDir(d);
    goto('amount', 1);
  }, [goto]);

  const handlePickAmount = useCallback((a) => {
    setPickedAmount(a);
    goto('leverage', 1);
  }, [goto]);

  const handlePickLev = useCallback((l) => {
    setPickedLev(l);
    goto('confirm', 1);
  }, [goto]);

  const handleConfirm = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const sideForOpen = pickedDir === 'long'
        ? (dex === 'avantis' ? 'long' : 'bid')
        : (dex === 'avantis' ? 'short' : 'ask');

      let result;
      if (dex === 'avantis') {
        // Avantis: hook takes (symbol, side, USDC collateral, slippage,
        // leverage). Min notional is $100 — surface a clear message
        // before signing if the user picked a sub-$100 position.
        const notional = pickedAmount * pickedLev;
        if (notional < 100) {
          setErrorMsg(`Avantis min position size is $100. With $${pickedAmount.toFixed(2)} margin you need ≥${Math.ceil(100 / pickedAmount)}× leverage.`);
          submittedRef.current = false;
          setSubmitting(false);
          return;
        }
        result = await placeMarketOrder(pickedToken.symbol, sideForOpen, pickedAmount, '0.5', pickedLev);
      } else {
        // Pacifica: hook takes (symbol, side, BASE TOKEN amount, slippage).
        // We hold pickedAmount in USDC margin terms, so convert to base-
        // token quantity via (margin × leverage) / price, then round down
        // to the market's lot size. Leverage is set via a separate API.
        if (!livePrice || livePrice <= 0) {
          setErrorMsg('No live price — try again in a moment.');
          submittedRef.current = false;
          setSubmitting(false);
          return;
        }
        // Each Pacifica setting (margin mode + leverage) is its own signed
        // request. To minimise wallet popups for returning users we SKIP
        // the calls when the symbol's current value already matches the
        // intent. Result: a user who set up "isolated 2×" once and keeps
        // re-trading the same symbol/leverage sees one popup (the trade)
        // instead of three.
        const sym = pickedToken.symbol;
        const currentIsolated = !!(marginModes && marginModes[sym]);
        if (!currentIsolated && setMarginMode) {
          try { await setMarginMode(sym, true); } catch { /* best-effort */ }
        }
        const currentLev = leverageSettings && leverageSettings[sym];
        const currentLevNum = currentLev != null ? Number(currentLev) : NaN;
        const levMatches = Number.isFinite(currentLevNum)
          && Math.abs(currentLevNum - pickedLev) < 0.05;
        if (!levMatches && setLeverageApi) {
          try { await setLeverageApi(sym, pickedLev); } catch { /* best-effort */ }
        }
        const lotSize = parseFloat(pickedToken?.lot_size) || 0;
        const rawTokenAmt = (pickedAmount * pickedLev) / livePrice;
        const tokenAmt = lotSize > 0
          ? Math.floor(rawTokenAmt / lotSize) * lotSize
          : rawTokenAmt;
        if (tokenAmt <= 0) {
          setErrorMsg(`Amount too small — minimum is one ${pickedToken.symbol} lot (${lotSize}).`);
          submittedRef.current = false;
          setSubmitting(false);
          return;
        }
        // Use a precise decimal string so floats like 0.1 + 0.2 don't sneak
        // through as 0.30000000000000004 to the wire format.
        const decimals = lotSize > 0
          ? Math.max(0, -Math.floor(Math.log10(lotSize)))
          : 6;
        const tokenAmtStr = tokenAmt.toFixed(decimals);
        result = await placeMarketOrder(pickedToken.symbol, sideForOpen, tokenAmtStr, '0.5');
      }

      if (result?.error) {
        setErrorMsg(String(result.error));
        submittedRef.current = false;
        setSubmitting(false);
        return;
      }
      // Success: confetti + auto-route to Positions.
      fireConfetti();
      setSubmitting(false);
      // Route after a beat so the confetti is visible.
      setTimeout(() => {
        if (setActiveTab) setActiveTab('Positions');
        // Reset flow for next trade.
        setStep('token');
        setPickedToken(null);
        setPickedDir(null);
        setPickedAmount(0);
        setPickedLev(2);
        submittedRef.current = false;
      }, 1100);
    } catch (e) {
      setErrorMsg(e?.message || 'Trade failed');
      submittedRef.current = false;
      setSubmitting(false);
    }
  }, [dex, placeMarketOrder, setLeverageApi, setMarginMode, marginModes, leverageSettings, pickedToken, pickedDir, pickedAmount, pickedLev, setActiveTab, livePrice]);

  const stepIdx = STEPS.indexOf(step);
  const back = useCallback(() => {
    if (stepIdx <= 0) return;
    goto(STEPS[stepIdx - 1], -1);
  }, [stepIdx, goto]);

  return (
    <div style={S.shell}>
      {/* Header: back button + step dots */}
      <div style={S.header}>
        <button
          onClick={back}
          disabled={stepIdx === 0 || submitting}
          style={{ ...S.backBtn, opacity: stepIdx === 0 ? 0 : 1, pointerEvents: stepIdx === 0 ? 'none' : 'auto' }}
          aria-label="Back"
        >
          {/* SVG chevron — character literals like '‹' have inconsistent
              vertical metrics across fonts and looked offset. */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="3.5"
               strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={shared.stepDots}>
          {STEPS.map((s, i) => (
            <div
              key={s}
              style={{
                ...shared.dot,
                ...(i === stepIdx ? shared.dotActive : {}),
                ...(i < stepIdx ? shared.dotDone : {}),
              }}
            />
          ))}
        </div>
        <div style={shared.spacer36} />
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={S.errorBanner}
            onClick={() => setErrorMsg(null)}
          >
            ⚠ {errorMsg}
            <span style={S.errorClose}>✕</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated step container */}
      <div style={S.stepWrap}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            style={S.stepInner}
          >
            {step === 'token' && (
              <BasicTokenPicker
                markets={markets}
                prices={prices}
                onPick={handlePickToken}
              />
            )}
            {step === 'direction' && pickedToken && (
              <BasicDirectionPicker
                symbol={pickedToken.symbol}
                iconSym={pickedToken.base || pickedToken.symbol}
                price={livePrice}
                onPick={handlePickDirection}
              />
            )}
            {step === 'amount' && pickedToken && (
              <BasicAmountSlider
                direction={pickedDir}
                balance={balance}
                onPick={handlePickAmount}
                onBack={back}
              />
            )}
            {step === 'leverage' && pickedToken && (
              <BasicLeveragePicker
                amount={pickedAmount}
                direction={pickedDir}
                maxLeverage={Number(pickedToken.max_leverage) || 20}
                onPick={handlePickLev}
                onBack={back}
              />
            )}
            {step === 'confirm' && pickedToken && (
              <BasicConfirm
                symbol={pickedToken.symbol}
                direction={pickedDir}
                amount={pickedAmount}
                leverage={pickedLev}
                price={livePrice}
                busy={submitting}
                onConfirm={handleConfirm}
                onBack={back}
                // Show 1-tap-trading banner when on Pacifica AND agent
                // not bound yet. Avantis has its own delegation
                // mechanisms (Privy embedded already silent), so we skip.
                showAgentBanner={dex === 'pacifica' && !pacAgent}
                bindAgent={bindAgent}
                bindingAgent={bindingAgent}
                bindAgentError={bindAgentError}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default memo(BasicTradeFlow);

const S = {
  shell: {
    flex: 1, display: 'flex', flexDirection: 'column',
    minHeight: 0, position: 'relative',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '16px 14px 10px',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    background: 'transparent',
    border: `2px solid ${colors.border}`,
    color: colors.ink,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
    fontFamily: 'inherit',
    transition: 'opacity 0.2s ease',
  },
  errorBanner: {
    margin: '0 14px 8px', padding: '10px 14px',
    borderRadius: 10,
    background: 'rgba(239,83,80,0.18)',
    border: `2px solid ${colors.aggressive}`,
    color: colors.shortDark,
    fontSize: 13, fontWeight: 700,
    cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 12,
  },
  errorClose: { fontWeight: 900, opacity: 0.6 },
  stepWrap: {
    flex: 1, position: 'relative', minHeight: 0,
    overflow: 'hidden',
  },
  stepInner: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
  },
};
