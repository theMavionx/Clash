// Clock-skew compensation shared between Pacifica master-sign and agent-sign
// paths. Pacifica enforces `now - timestamp <= expiry_window` (5000ms) on
// every signed request. Some Windows clocks drift enough to make signed
// requests fail with "Invalid message", so we apply a server-time offset.
//
// Important: public Pacifica responses can be cached. A cached `Date` header
// looks like the user's clock is increasingly ahead, so callers should prefer
// setPacificaServerTimeFromResponse(), which ignores aged responses.

let pacificaTimeOffsetMs = 0;

export function pacificaNow() {
  return Date.now() + pacificaTimeOffsetMs;
}

export function setPacificaServerTimeFromResponse(response, source = 'response') {
  if (!response?.headers?.get) return false;
  const ageHeader = response.headers.get('Age');
  const ageSeconds = Number(ageHeader);
  if (Number.isFinite(ageSeconds) && ageSeconds > 2) {
    console.log(`[Pacifica] ignoring cached clock header from ${source}: age=${ageSeconds}s`);
    return false;
  }
  return setPacificaServerTimeFromDateHeader(response.headers.get('Date'), { source });
}

export function setPacificaServerTimeFromDateHeader(dateHeader, opts = {}) {
  if (!dateHeader) return false;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return false;
  const offset = serverMs - Date.now();
  if (Math.abs(offset - pacificaTimeOffsetMs) < 500) return false;
  pacificaTimeOffsetMs = offset;
  const suffix = opts.source ? ` (${opts.source})` : '';
  if (Math.abs(offset) >= 2000) {
    console.warn(`[Pacifica] clock skew detected: local clock is ${offset > 0 ? 'BEHIND' : 'AHEAD OF'} Pacifica by ${Math.abs(offset)}ms${suffix} - compensating all signed timestamps.`);
  } else {
    console.log(`[Pacifica] clock offset = ${offset}ms${suffix} (within tolerance, applying anyway)`);
  }
  return true;
}

export function getPacificaTimeOffset() {
  return pacificaTimeOffsetMs;
}
