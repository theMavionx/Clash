/**
 * Human-readable Nado bot status for Bots UI.
 * Maps raw rejects into actionable copy — especially the $100 notional floor
 * (users with ~$20 balance were seeing vague "margin/quota" language).
 */

export const NADO_MIN_ORDER_USD = 100;

/** Normalize API / runtime error blobs into a readable string. */
export function normalizeNadoErrorText(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number') return `Error code ${raw}`;
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'object') {
    if (typeof raw.message === 'string' && raw.message.trim()) return raw.message.trim();
    if (typeof raw.reason === 'string' && raw.reason.trim()) return raw.reason.trim();
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

/**
 * Approx free margin needed for dual-sided MM at venue min notional.
 * Mirror of calmVolumePlan depositForTradeSizeUsd(100) at planning leverage.
 */
export function nadoMinDepositUsd(leverage = 10) {
  const lev = Math.max(1, Number(leverage) || 10);
  return Math.ceil((NADO_MIN_ORDER_USD * 2) / (0.85 * lev));
}

/**
 * Classify Nado bot failures into { code, title, hint, tone }.
 */
export function classifyNadoIssue(rawError, { availableUsd = null, leverage = 10 } = {}) {
  const text = normalizeNadoErrorText(rawError);
  const lower = text.toLowerCase();
  const avail = availableUsd != null && Number.isFinite(Number(availableUsd))
    ? Number(availableUsd)
    : null;
  const need = nadoMinDepositUsd(leverage);

  if (
    /minimum (order|notional)|min(?:imum)? (?:order )?size|venue floor|below exchange minimum/i.test(
      text,
    )
  ) {
    const balHint = avail != null && avail < need
      ? ` Your free ≈$${avail.toFixed(2)} is below ~$${need} needed for dual $${NADO_MIN_ORDER_USD} quotes at ${leverage}×.`
      : '';
    return {
      code: 'NADO_MIN_NOTIONAL',
      tone: 'warn',
      title: `Nado minimum order is $${NADO_MIN_ORDER_USD}`,
      hint:
        `Each quote must be ≥$${NADO_MIN_ORDER_USD} notional (venue floor, not an API quota).`
        + ` Raise Trade Size to ≥$${NADO_MIN_ORDER_USD} in Bot Settings.`
        + balHint
        + (avail != null && avail < need
          ? ` Deposit ≥$${need} USDC to Nado, then Launch again.`
          : ''),
    };
  }

  if (
    /nado floor|only funds|deposit ≥|not an api quota|insufficient (free )?margin|insufficient usdc|available≈|available_usd=/i.test(
      lower,
    )
  ) {
    const bal = avail != null ? ` Free now ≈$${avail.toFixed(2)}.` : '';
    return {
      code: 'NADO_BALANCE_LOW',
      tone: 'warn',
      title: `Balance too low for Nado’s $${NADO_MIN_ORDER_USD} floor`,
      hint:
        `Symmetric MM needs ~$${NADO_MIN_ORDER_USD} notional per side.`
        + bal
        + ` Deposit at least ~$${need} USDC (cushion recommended) — this is not a rate-limit or “quota” error.`,
    };
  }

  if (/linked.?signer|private.?key|credential|unauthorized|invalid signature|auth/i.test(lower)) {
    return {
      code: 'NADO_AUTH',
      tone: 'error',
      title: 'Nado linked signer / auth problem',
      hint: 'Accounts → Nado: paste linked signer key and Sync, then Stop → Start the bot.',
    };
  }

  if (/rate.?limit|429|too many requests/i.test(lower)) {
    return {
      code: 'NADO_RATE_LIMIT',
      tone: 'info',
      title: 'Rate limited',
      hint: 'Bot is cooling down — wait for the pause, then it will retry.',
    };
  }

  if (text) {
    const short = text.length > 160 ? `${text.slice(0, 160)}…` : text;
    return {
      code: 'NADO_UNKNOWN',
      tone: 'warn',
      title: 'Nado order rejected',
      hint: short,
    };
  }

  return null;
}

/**
 * Dashboard "Last action" copy for a running Nado bot.
 */
export function describeNadoBotAction(ctx = {}) {
  const {
    quotes = 0,
    cycles = 0,
    availableUsd = null,
    lastError = '',
    inBackoff = false,
    backoffSymbols = [],
    credsPaused = false,
    credsPauseReason = '',
    tradeSizeUsd = null,
    leverage = 10,
  } = ctx;

  const need = nadoMinDepositUsd(leverage);
  const avail = availableUsd != null && Number.isFinite(Number(availableUsd))
    ? Number(availableUsd)
    : null;
  const size = tradeSizeUsd != null && Number.isFinite(Number(tradeSizeUsd))
    ? Number(tradeSizeUsd)
    : null;

  const errBlob = lastError || credsPauseReason || '';
  const classified = classifyNadoIssue(errBlob, { availableUsd: avail, leverage });

  if (credsPaused && classified) {
    return { tone: classified.tone, message: `${classified.title}: ${classified.hint}` };
  }

  if (inBackoff) {
    const parts = (Array.isArray(backoffSymbols) ? backoffSymbols : [])
      .map((s) => `${s.symbol} (~${s.pause_secs_remaining ?? '?'}s)`)
      .join(', ');
    if (classified) {
      return {
        tone: classified.tone,
        message: `Paused${parts ? ` (${parts})` : ''}. ${classified.title}: ${classified.hint}`,
      };
    }
    return {
      tone: 'warn',
      message:
        `Paused${parts ? ` (${parts})` : ''} after rejected orders. `
        + `Nado needs ≥$${NADO_MIN_ORDER_USD}/order — check Trade Size and free USDC (not an API quota).`,
    };
  }

  if (classified) {
    return { tone: classified.tone, message: `${classified.title}: ${classified.hint}` };
  }

  if (size != null && size > 0 && size < NADO_MIN_ORDER_USD) {
    return {
      tone: 'warn',
      message:
        `Trade Size $${size} is below Nado’s $${NADO_MIN_ORDER_USD} minimum notional. `
        + `Raise Trade Size in Bot Settings (venue floor, not a quota).`,
    };
  }

  if (quotes === 0 && avail != null && avail < need) {
    return {
      tone: 'warn',
      message:
        `Nado needs ≥$${NADO_MIN_ORDER_USD}/order. Free ≈$${avail.toFixed(2)} `
        + `is below ~$${need} needed for dual-sided quotes at ${leverage}×. `
        + `Deposit USDC on Nado — this is not an API quota.`,
    };
  }

  if (quotes > 0) {
    return {
      tone: 'ok',
      message: `${quotes} quote(s) on Nado · cycle ${cycles}`,
    };
  }

  if (cycles > 0) {
    return {
      tone: 'info',
      message:
        `Bot runs but Nado has 0 quotes — need Trade Size ≥$${NADO_MIN_ORDER_USD} `
        + `and free margin ≥~$${need} (venue min, not quota).`,
    };
  }

  return {
    tone: 'info',
    message:
      `Worker spawned — Nado floor is $${NADO_MIN_ORDER_USD}/order. `
      + `Waiting for first cycle.`,
  };
}
