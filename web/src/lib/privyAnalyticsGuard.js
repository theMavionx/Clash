const PRIVY_ANALYTICS_HOST = 'auth.privy.io';
const PRIVY_ANALYTICS_PATH = '/api/v1/analytics_events';

function getRequestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input.url === 'string') return input.url;
  return '';
}

function isPrivyAnalyticsRequest(input) {
  try {
    const url = new URL(getRequestUrl(input), globalThis.location?.href || 'https://clashofperps.fun');
    return url.hostname === PRIVY_ANALYTICS_HOST && url.pathname === PRIVY_ANALYTICS_PATH;
  } catch {
    return false;
  }
}

export function installPrivyAnalyticsGuard() {
  if (typeof globalThis.fetch !== 'function') return;
  if (globalThis.__clashPrivyAnalyticsGuardInstalled) return;

  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.__clashPrivyAnalyticsGuardInstalled = true;
  globalThis.fetch = (input, init) => {
    if (isPrivyAnalyticsRequest(input)) {
      return Promise.resolve(new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    return nativeFetch(input, init);
  };
}
