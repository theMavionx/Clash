function hibachiErrorText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return String(value || '');
  return [
    value.code,
    value.status,
    value.error,
    value.detail,
    value.message,
    value.response?.data?.code,
    value.response?.data?.error,
    value.response?.data?.detail,
  ].filter(part => part !== undefined && part !== null && part !== '').join(' ');
}

export const HIBACHI_TRADING_PERMISSION_MESSAGE = 'This Hibachi API key is read-only. In Hibachi, create or edit the key and enable Read-write > Trading (Withdraws and Transfers are not required), then use EDIT API in Clash.';

export function isHibachiTradingPermissionError(value) {
  const code = String(value?.code ?? value?.response?.data?.code ?? '');
  if (code === 'HIBACHI_TRADING_PERMISSION_REQUIRED') return true;
  const status = Number(value?.status ?? value?.response?.status);
  return status === 401 && /missing required permission\s*:\s*trading/iu.test(hibachiErrorText(value));
}

export function isHibachiRateLimitedError(value) {
  const status = Number(value?.status ?? value?.response?.status);
  if (status === 429) return true;
  return /HIBACHI_RATE_LIMITED|Error\s*1015|Too Many Requests|rate[_\s-]?limit|\b429\b/iu.test(
    hibachiErrorText(value),
  );
}

export function isHibachiIpBlockedError(value) {
  const code = String(value?.code ?? value?.response?.data?.code ?? '');
  if (code === 'HIBACHI_IP_BLOCKED') return true;
  const status = Number(value?.status ?? value?.response?.status);
  const text = hibachiErrorText(value);
  if (status === 451) return true;
  return /Hibachi is not available from your IP address|(?:unsupported|restricted|blocked|prohibited|not available).{0,80}(?:country|region|jurisdiction|geographic|geo-location|ip address)|(?:country|region|jurisdiction|geographic|geo-location|ip address).{0,80}(?:unsupported|restricted|blocked|prohibited|not available)/iu.test(text);
}
