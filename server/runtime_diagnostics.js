'use strict';
const crypto = require('node:crypto');
const { createWindow } = require('./http_security');

/** Preserve expected parser status without disclosing submitted text. */
function errorStatus(error) {
  if (error?.type === 'entity.too.large') return 413;
  if (error?.type === 'encoding.unsupported') return 415;
  if (['entity.parse.failed', 'request.aborted', 'request.size.invalid'].includes(error?.type)) return 400;
  if (error?.code === 'ORIGIN_NOT_ALLOWED') return 403;
  return 500;
}

/** Persist safe server metadata in the existing seven-day admin client-log view. */
function createRuntimeDiagnostics({ db, now = Date.now, warn = () => {} }) {
  const take = createWindow({ now });
  const insert = db.prepare(`INSERT INTO client_logs (level,source,message,payload)
    VALUES ('error','server.http',?,?)`);
  let lastStorageWarning = -Infinity;
  function persist(record) {
    if (!take('persist', 120).ok) return;
    try { insert.run(`HTTP ${record.status} ${record.method} ${record.route}`, JSON.stringify(record)); }
    catch {
      if (now() - lastStorageWarning >= 60000) {
        lastStorageWarning = now();
        try { warn('RUNTIME_DIAGNOSTICS_STORAGE_UNAVAILABLE'); } catch { /* logging must not change a response */ }
      }
    }
  }
  function middleware(req, res, next) {
    const started = now(), traceId = crypto.randomUUID();
    res.locals.runtimeTraceId = traceId;
    res.set('X-Request-Id', traceId);
    let recorded = false;
    const completed = () => {
      if (recorded) return;
      recorded = true;
      if (res.statusCode < 500 && !res.locals.runtimeFailure) return;
      // req.route.path is the registered template, never a raw user URL/query.
      const route = typeof req.route?.path === 'string' ? req.route.path.slice(0, 180) : 'middleware';
      persist({ traceId, at: now(), status: res.statusCode, route,
        method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(req.method) ? req.method : 'OTHER',
        durationMs: Math.max(0, now() - started), failure: res.locals.runtimeFailure || 'HTTP_FAILURE',
        fingerprint: res.locals.runtimeFingerprint || null });
    };
    res.on('finish', completed);
    res.on('close', completed);
    next();
  }
  function errorHandler(error, req, res, next) {
    res.locals.runtimeFailure = errorStatus(error) < 500 ? 'REQUEST_REJECTED' : 'UNEXPECTED_ERROR';
    // Hash only: stack/message can include API credentials or submitted key material.
    res.locals.runtimeFingerprint = crypto.createHash('sha256').update(String(error?.stack || error?.name || 'Error')).digest('hex');
    if (res.headersSent) return next(new Error('Response interrupted; see request reference'));
    const status = errorStatus(error);
    res.status(status).json({ error: status < 500 ? 'Invalid request' : 'Internal server error',
      traceId: res.locals.runtimeTraceId });
  }
  return { middleware, errorHandler };
}
module.exports = { createRuntimeDiagnostics, errorStatus };
