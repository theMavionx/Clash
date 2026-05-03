// Clock-skew compensation shared between Pacifica master-sign and agent-sign
// paths. Pacifica enforces `now - timestamp <= expiry_window` (5000ms) on
// every signed request. Users with Windows clocks unsynced from NTP routinely
// drift several seconds — every signed request then fails the expiry check
// and Pacifica returns plain-text "Invalid message" (400).
//
// We capture the server time from any successful response's `Date` HTTP
// header (set by Pacifica's edge) and treat the delta vs. local clock as the
// offset to apply to every future timestamp. Resolution is ~1s (HTTP Date
// granularity) which is well inside the 5s expiry window.
//
// Lives in lib/ rather than hooks/ because both usePacifica and
// usePacificaAgent import it — keeping it in either hook would create a
// circular dependency.

let pacificaTimeOffsetMs = 0;

export function pacificaNow() {
  return Date.now() + pacificaTimeOffsetMs;
}

export function setPacificaServerTimeFromDateHeader(dateHeader) {
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return;
  const offset = serverMs - Date.now();
  // Don't churn on tiny jitter, but always log the first significant
  // correction so we can debug user clocks remotely.
  if (Math.abs(offset - pacificaTimeOffsetMs) < 500) return;
  pacificaTimeOffsetMs = offset;
  if (Math.abs(offset) >= 2000) {
    console.warn(`[Pacifica] clock skew detected: local clock is ${offset > 0 ? 'BEHIND' : 'AHEAD OF'} Pacifica by ${Math.abs(offset)}ms — compensating all signed timestamps.`);
  } else {
    console.log(`[Pacifica] clock offset = ${offset}ms (within tolerance, applying anyway)`);
  }
}

export function getPacificaTimeOffset() {
  return pacificaTimeOffsetMs;
}
