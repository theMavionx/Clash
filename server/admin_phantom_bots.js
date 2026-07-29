/**
 * Admin proxy: Clash Admin → Phantom GET /api/v1/admin/bots
 * Mounted from routes.js via mountAdminPhantomBots(router, ctx).
 *
 * Auth to Phantom uses the bot proxy secret (same as player bot calls),
 * NOT Clash ADMIN_KEY (that is only for Clash Admin UI login).
 */

function resolvePhantomAdminKey(botProxySecret = '') {
  return String(
    process.env.PHANTOM_ADMIN_KEY
    || process.env.PHANTOM__ADMIN__KEY
    || botProxySecret
    || process.env.CLASH_BOT_PROXY_SECRET
    || process.env.PHANTOM__AUTH__TRUSTED_PROXY_SECRET
    || '',
  ).trim();
}

function mountAdminPhantomBots(router, ctx = {}) {
  const {
    adminAuth,
    botUrl = process.env.CLASH_BOT_URL || 'http://127.0.0.1:8080',
    botProxySecret = '',
  } = ctx;

  if (!router || typeof adminAuth !== 'function') {
    throw new Error('mountAdminPhantomBots requires router + adminAuth');
  }

  router.get('/admin/phantom-bots', adminAuth, async (req, res) => {
    const hours = Math.min(720, Math.max(1, Number(req.query.hours) || 24));
    const started = Date.now();
    try {
      const targetUrl = `${botUrl}/api/v1/admin/bots?hours=${encodeURIComponent(hours)}`;
      const headers = { accept: 'application/json' };
      const proxySecret = String(botProxySecret || process.env.CLASH_BOT_PROXY_SECRET || process.env.PHANTOM__AUTH__TRUSTED_PROXY_SECRET || '').trim();
      if (proxySecret) headers['x-proxy-secret'] = proxySecret;

      const adminKey = resolvePhantomAdminKey(proxySecret);
      if (adminKey) headers['x-phantom-admin-key'] = adminKey;

      if (!adminKey && !proxySecret) {
        console.error('[admin-phantom-bots] missing proxy/admin secret on Clash (set CLASH_BOT_PROXY_SECRET or PHANTOM__AUTH__TRUSTED_PROXY_SECRET)');
        return res.status(503).json({
          error: 'Clash is missing PHANTOM__AUTH__TRUSTED_PROXY_SECRET / CLASH_BOT_PROXY_SECRET for Phantom admin proxy',
          bots: [],
          running_count: 0,
          bot_count: 0,
          user_count: 0,
          exchange_totals: [],
          hours,
        });
      }

      const response = await fetch(targetUrl, { method: 'GET', headers });
      let bodyText = await response.text();
      // Flatten Phantom { success, data } envelope for Clash Admin UI.
      try {
        const parsed = JSON.parse(bodyText);
        if (
          parsed
          && typeof parsed === 'object'
          && parsed.success === true
          && parsed.data
          && typeof parsed.data === 'object'
          && !Array.isArray(parsed.data)
        ) {
          bodyText = JSON.stringify(parsed.data);
        }
      } catch {
        /* keep raw body */
      }
      if (!response.ok) {
        console.warn('[admin-phantom-bots] upstream_non_ok', {
          status: response.status,
          ms: Date.now() - started,
          hasProxySecret: Boolean(proxySecret),
          hasAdminKey: Boolean(adminKey),
        });
      }
      res.status(response.status);
      res.setHeader('content-type', response.headers.get('content-type') || 'application/json');
      res.send(bodyText);
    } catch (error) {
      const detail = error.cause?.message || error.message || 'unknown';
      console.error('[admin-phantom-bots] unreachable', {
        target: botUrl,
        error: detail,
        ms: Date.now() - started,
      });
      res.status(502).json({
        error: `Phantom bot unreachable (${detail})`,
        bots: [],
        running_count: 0,
        bot_count: 0,
        user_count: 0,
        exchange_totals: [],
        hours,
      });
    }
  });
}

module.exports = { mountAdminPhantomBots, resolvePhantomAdminKey };
