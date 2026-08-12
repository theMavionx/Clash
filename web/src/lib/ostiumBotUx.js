/**
 * Human-readable Ostium bot status for Bots UI (Futures one-tap parity).
 * Maps raw reject / API strings into actionable copy — not a generic "error 1".
 */

function shortEvmAddr(addr) {
  const a = String(addr || '');
  if (a.length < 10) return a || '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function formatOstiumEth(eth) {
  const n = Number(eth);
  if (!Number.isFinite(n)) return '—';
  if (n >= 0.001) return n.toFixed(4);
  if (n > 0) return n.toFixed(6);
  return '0';
}

/** Normalize API / runtime error blobs into a readable string. */
export function normalizeOstiumErrorText(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number') return `Error code ${raw}`;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (/^\d+$/.test(t)) return `Error code ${t}`;
    return t;
  }
  if (typeof raw === 'object') {
    if (typeof raw.message === 'string' && raw.message.trim()) return raw.message.trim();
    if (typeof raw.reason === 'string' && raw.reason.trim()) return raw.reason.trim();
    if (raw.code != null && (raw.message == null || raw.message === '')) {
      return `Error code ${raw.code}`;
    }
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

/**
 * Classify Ostium / Arbitrum bot failures into { code, title, hint, tone }.
 */
export function classifyOstiumIssue(rawError, gasStatus = null) {
  const text = normalizeOstiumErrorText(rawError);
  const lower = text.toLowerCase();

  if (!text && gasStatus?.needsEth) {
    return {
      code: 'OSTIUM_GAS_LOW',
      tone: 'warn',
      title: 'One-tap gas low',
      hint:
        `Delegate has ${formatOstiumEth(gasStatus.eth)} ETH. `
        + 'Click «Top up one-tap gas» — MetaMask sends ~0.0003 ETH (USDC stays on your trader).',
    };
  }

  if (/gas required exceeds allowance|intrinsic gas too low/i.test(text)) {
    return {
      code: 'OSTIUM_GAS_LIMIT',
      tone: 'warn',
      title: 'Gas limit too low on top-up',
      hint:
        'Hard-refresh the page, then click «Top up one-tap gas» again '
        + '(Arbitrum needs >21000 gas — fixed in latest UI).',
    };
  }

  if (/insufficient funds for gas|gas \* price \+ value|gas required exceeds/i.test(text)) {
    return {
      code: 'OSTIUM_GAS_LOW',
      tone: 'warn',
      title: 'One-tap wallet needs ETH for gas',
      hint:
        `Bot txs are signed by the one-tap delegate`
        + (gasStatus?.eth != null ? ` (${formatOstiumEth(gasStatus.eth)} ETH now)` : '')
        + '. Click «Top up one-tap gas» or «One tap + Sync» — MetaMask pays the top-up from your Arbitrum wallet.',
    };
  }

  if (/delegate mismatch|not on-chain delegate|is not on-chain delegate/i.test(text)) {
    return {
      code: 'OSTIUM_DELEGATE_MISMATCH',
      tone: 'error',
      title: 'Delegate mismatch',
      hint:
        'Browser one-tap key ≠ on-chain delegate. Accounts → Ostium → One tap + Sync, then Stop → Start the bot.',
    };
  }

  if (/usdc approve|allowance|erc20|insufficient.*usdc|collateral/i.test(text) && /approve|allowance|balance/i.test(text)) {
    return {
      code: 'OSTIUM_USDC',
      tone: 'warn',
      title: 'USDC / allowance issue',
      hint:
        'USDC must sit on your trader (MetaMask), not the delegate. Re-run One tap + Sync to approve USDC.',
    };
  }

  if (
    /insufficient (free )?margin|insufficient usdc|not enough.*margin|available.?usd|buying.?power|trader wallet|min.?×.?2|collateral on trader/i.test(
      text,
    )
  ) {
    return {
      code: 'OSTIUM_MARGIN',
      tone: 'warn',
      title: 'Not enough free USDC on trader',
      hint:
        'Deposit USDC to the connected trader wallet (not the delegate). Dual-sided quotes need ≥ $5 × 2 = $10 free collateral. Lower Trade Size or top up, then Start again.',
    };
  }

  if (/user rejected|denied|cancelled|canceled/i.test(text)) {
    return {
      code: 'OSTIUM_USER_REJECTED',
      tone: 'info',
      title: 'Wallet signature cancelled',
      hint: 'Confirm the MetaMask prompt (setDelegate / approve / gas top-up) and try again.',
    };
  }

  if (/auth|unauthorized|credential|invalid signature/i.test(text)) {
    return {
      code: 'OSTIUM_AUTH',
      tone: 'error',
      title: 'Ostium auth / credential problem',
      hint: 'Re-run One tap + Sync, then reconnect the Ostium account in Bots.',
    };
  }

  if (/rate.?limit|429|too many requests/i.test(text)) {
    return {
      code: 'OSTIUM_RATE_LIMIT',
      tone: 'info',
      title: 'Rate limited',
      hint: 'Bot is cooling down — wait for the pause, then it will retry.',
    };
  }

  if (text) {
    const short = text.length > 140 ? `${text.slice(0, 140)}…` : text;
    return {
      code: 'OSTIUM_UNKNOWN',
      tone: 'warn',
      title: 'Ostium order rejected',
      hint: short,
    };
  }

  return null;
}

export function describeOstiumBotAction(ctx = {}) {
  const {
    quotes = 0,
    cycles = 0,
    availableUsd = null,
    lastError = '',
    gasStatus = null,
    inBackoff = false,
    backoffSymbols = [],
    credsPaused = false,
    credsPauseReason = '',
  } = ctx;

  if (!cycles && quotes === 0 && !lastError && !inBackoff && !credsPaused) {
    return {
      tone: 'info',
      message:
        'Press ▶ Start after Accounts → Ostium: One tap + Sync. '
        + 'MetaMask tops up gas to the one-tap wallet; USDC stays on your trader.',
    };
  }

  const errBlob = lastError || credsPauseReason || '';
  const classified = classifyOstiumIssue(errBlob, gasStatus);

  if (credsPaused && classified) {
    return {
      tone: classified.tone,
      message: `${classified.title}: ${classified.hint}`,
    };
  }

  if (inBackoff) {
    const parts = (Array.isArray(backoffSymbols) ? backoffSymbols : [])
      .map((s) => `${s.symbol} (~${s.pause_secs_remaining ?? '?'}s)`)
      .join(', ');
    if (classified) {
      return {
        tone: classified.tone,
        message:
          `Paused${parts ? ` (${parts})` : ''}. ${classified.title}: ${classified.hint}`,
      };
    }
    return {
      tone: 'warn',
      message:
        `Paused${parts ? ` (${parts})` : ''} after rejected orders. `
        + 'Check one-tap gas (Top up), USDC on trader, and Trade Size — then wait for cooldown.',
    };
  }

  if (classified) {
    return {
      tone: classified.tone,
      message: `${classified.title}: ${classified.hint}`,
    };
  }

  if (quotes === 0 && typeof availableUsd === 'number' && availableUsd < 5) {
    return {
      tone: 'info',
      message:
        `Working — free USDC $${availableUsd.toFixed(2)} (margin may be locked in Ostium positions). `
        + 'Open Ostium app to see live trades.',
    };
  }

  if (quotes > 0) {
    return {
      tone: 'ok',
      message: `MM active · cycle ${cycles}. Waiting for fill or re-quote.`,
    };
  }

  return {
    tone: 'info',
    message: `MM active · cycle ${cycles}. Waiting for fill or re-quote — check Ostium app for live orders.`,
  };
}

export function ostiumGasPanelCopy(status, walletAddr = '') {
  if (!status?.address) {
    return {
      title: 'Ostium one tap',
      body: 'Connect Arbitrum MetaMask. Use «One tap + Sync» (same as Futures → Ostium).',
      showFund: false,
      tone: 'muted',
    };
  }
  if (!status.active) {
    return {
      title: 'One tap not synced',
      body:
        `On-chain delegate (${shortEvmAddr(status.onchainDelegate) || 'none'}) `
        + `≠ one-tap (${shortEvmAddr(status.address)}). Run One tap + Sync.`,
      showFund: false,
      tone: 'error',
    };
  }
  if (status.needsEth) {
    return {
      title: 'Top up one-tap gas',
      body:
        `Delegate ${shortEvmAddr(status.address)} has ${formatOstiumEth(status.eth)} ETH — not enough for bot txs. `
        + 'Click «Top up one-tap gas»: MetaMask sends ~0.0003 ETH. Without this, place_order fails with “insufficient funds for gas”.',
      showFund: true,
      tone: 'warn',
    };
  }
  return {
    title: 'One tap ready',
    body:
      `Delegate ${shortEvmAddr(status.address)} has ${formatOstiumEth(status.eth)} ETH. `
      + `Trader ${shortEvmAddr(walletAddr) || 'MetaMask'} holds USDC for margin.`,
    showFund: false,
    tone: 'ok',
  };
}
