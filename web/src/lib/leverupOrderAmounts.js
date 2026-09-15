import { decodeErrorResult } from 'viem';

const USD = 10n ** 18n;
const USDC_TO_USD = 10n ** 12n;
const QTY = 10n ** 10n;

// Expand decimal/scientific input without passing it through binary floats.
// Truncate excess precision: never silently increase a user's quantity/margin.
export function leverupUnits(value, decimals) {
  const text = String(value ?? '').trim().replace(/^\./, '0.');
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error('LeverUp amount must be a non-negative decimal');
  const exponent = Number(match[3] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100 || text.length > 150) {
    throw new Error('LeverUp amount is out of range');
  }
  const fraction = match[2] || '';
  const digits = BigInt(match[1] + fraction);
  const shift = decimals + exponent - fraction.length;
  return shift >= 0 ? digits * 10n ** BigInt(shift) : digits / 10n ** BigInt(-shift);
}

export function buildLeverupOpenAmounts({ margin, leverage, price, feeRate = 0, slippage = 0, isLong = true }) {
  const marginRaw = leverupUnits(margin, 6);
  const leverageRaw = leverupUnits(leverage, 18);
  const priceRaw = leverupUnits(price, 18);
  const feeRaw = leverupUnits(feeRate, 18);
  const slippageRaw = leverupUnits(slippage, 18);
  if (marginRaw <= 0n || leverageRaw < USD || priceRaw <= 0n) throw new Error('Enter a positive USDC margin, price and leverage of at least 1x');
  if (slippageRaw >= 100n * USD) throw new Error('LeverUp slippage must be below 100%');
  const notionalRaw = marginRaw * USDC_TO_USD * leverageRaw / USD;
  const qty = notionalRaw * QTY / priceRaw;
  if (qty <= 0n) throw new Error('LeverUp order is below the minimum quantity precision');
  // Round the fee up to one USDC atomic unit so collateral covers it exactly.
  const divisor = USD * USDC_TO_USD;
  const openFee = (notionalRaw * feeRaw + divisor - 1n) / divisor;
  const amountIn = marginRaw + openFee;
  const delta = priceRaw * slippageRaw / (100n * USD);
  const bound = isLong ? priceRaw + delta : priceRaw - delta;
  if (amountIn >= 2n ** 96n || qty >= 2n ** 128n || bound >= 2n ** 128n) throw new Error('LeverUp order exceeds protocol numeric limits');
  return { amountIn, qty, price: bound, openFee };
}

export function leverupActionError(status) {
  const skip = status?.skipReason;
  const messages = {
    INVALID: 'LeverUp rejected the signature or trading authorization. Check one-click setup and retry.',
    NONCE: 'LeverUp rejected an expired or reused request. Refresh and try again.',
    FEE: 'LeverUp execution fee could not be collected. Check balance and token approval.',
  };
  if (skip) return messages[skip] || `LeverUp request skipped: ${String(skip).slice(0, 150)}`;
  const reason = String(status?.reason || '');
  try {
    const decoded = decodeErrorResult({ abi: [], data: reason });
    if (decoded.errorName === 'Error') {
      const message = String(decoded.args[0]);
      if (message.includes('Position is too small')) return 'LeverUp position is too small. Increase the USDC margin or leverage.';
      return message.slice(0, 300);
    }
  } catch { /* Unknown revert data is not useful UI text. */ }
  return reason && !reason.startsWith('0x') ? reason.slice(0, 300) : 'LeverUp could not execute this request. Refresh market data and check order parameters.';
}
