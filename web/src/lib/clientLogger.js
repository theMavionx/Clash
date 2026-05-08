const ENDPOINT = '/api/client-log';
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'];
const BATCH_SIZE = 5;
const FLUSH_DELAY_MS = 1200;
const MAX_QUEUE = 100;
const CLIENT_MAX_PER_MINUTE = 240;
const REDACT_KEY_RE = /(token|secret|private|password|authorization|signature|signedmessage|signed_message)/i;
const NOISY_LOG_RE = /^\[load\] stage(1 download|2 signal)/;

let installed = false;
let flushing = false;
let timer = null;
const queue = [];
const recentAt = [];
const original = {};

function nowMinuteOk() {
  const now = Date.now();
  while (recentAt.length && recentAt[0] < now - 60_000) recentAt.shift();
  if (recentAt.length >= CLIENT_MAX_PER_MINUTE) return false;
  recentAt.push(now);
  return true;
}

function truncate(s, max) {
  return String(s == null ? '' : s).slice(0, max);
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === 'string') return truncate(value, 1000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message, 1000),
      stack: truncate(value.stack || '', 2500),
    };
  }
  if (depth >= 3) return '[Object]';
  if (typeof value !== 'object') return truncate(String(value), 1000);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((v) => sanitize(v, depth + 1, seen));
  }
  const out = {};
  for (const [key, child] of Object.entries(value).slice(0, 24)) {
    out[key] = REDACT_KEY_RE.test(key) ? '[redacted]' : sanitize(child, depth + 1, seen);
  }
  return out;
}

function argToText(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try { return JSON.stringify(sanitize(arg)); } catch { return String(arg); }
}

function scheduleFlush() {
  if (timer || flushing) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

function enqueue(event) {
  if (!event?.message || NOISY_LOG_RE.test(event.message)) return;
  if (!nowMinuteOk()) return;
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (queue.length >= BATCH_SIZE) flush();
  else scheduleFlush();
}

function makeEvent(level, args, source, stack) {
  const safeArgs = args.map((arg) => sanitize(arg));
  let payload = null;
  try { payload = truncate(JSON.stringify({ args: safeArgs }), 2400); } catch {}
  return {
    level,
    source,
    message: truncate(args.map(argToText).join(' '), 1600),
    stack: truncate(stack || '', 2500),
    payload,
    ua: navigator.userAgent,
    url: location.href,
  };
}

function tokenHeader() {
  try {
    return window._playerToken ? { 'x-token': window._playerToken } : {};
  } catch {
    return {};
  }
}

function flush() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const events = queue.splice(0, BATCH_SIZE);
  const body = JSON.stringify({ events });
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...tokenHeader() },
    body,
    keepalive: body.length < 60_000,
  }).catch(() => {}).finally(() => {
    flushing = false;
    if (queue.length) scheduleFlush();
  });
}

function patchConsole(level) {
  original[level] = console[level]?.bind(console) || console.log.bind(console);
  console[level] = (...args) => {
    try { enqueue(makeEvent(level, args, `console.${level}`)); } catch {}
    original[level](...args);
  };
}

export function installClientLogger() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const level of LEVELS) patchConsole(level);

  window.addEventListener('error', (event) => {
    enqueue(makeEvent('onerror', [event.error || event.message], 'window.error', event.error?.stack));
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    enqueue(makeEvent('unhandledrejection', [reason], 'window.unhandledrejection', reason?.stack));
  });
  window.addEventListener('pagehide', flush);
}
