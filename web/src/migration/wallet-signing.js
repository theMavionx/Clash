import { migrationErrorText } from './strings.js';

// Only for signTransaction (not sign-and-send). A late response is discarded;
// this helper never broadcasts, retries signing or creates a replacement quote.
export function signMigrationDeposit(sign, expiresAt, { maxWaitMs = 60000, now = Date.now } = {}) {
  const fail = code => Object.assign(new Error(migrationErrorText(code)), { code, migrationSafe: true });
  const remaining = expiresAt - now();
  if (!Number.isFinite(remaining) || remaining <= 0) return Promise.reject(fail('QUOTE_EXPIRED'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); fn(result);
    };
    const timer = setTimeout(() => finish(reject,
      fail(now() >= expiresAt ? 'QUOTE_EXPIRED' : 'WALLET_SIGN_TIMEOUT')), Math.min(maxWaitMs, remaining));
    // Keep invocation synchronous inside the click action for mobile wallet launch.
    try {
      Promise.resolve(sign()).then(value => {
        if (now() >= expiresAt) finish(reject, fail('QUOTE_EXPIRED'));
        else finish(resolve, value);
      }, error => finish(reject, error));
    } catch (error) { finish(reject, error); }
  });
}
