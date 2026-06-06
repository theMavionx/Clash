#!/usr/bin/env node

const API = 'https://api.cloudflare.com/client/v4';
const DOMAIN = process.env.CLOUDFLARE_DOMAIN || 'clashofperps.fun';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || process.env.CF_ZONE_ID || '';
const ORIGIN_IP = process.env.CLOUDFLARE_ORIGIN_IP || process.env.CF_ORIGIN_IP || '92.205.29.88';
const CONFIGURE_DNS = process.argv.includes('--configure-dns');
const WARM_CACHE = process.argv.includes('--warm');
const RULE_DESCRIPTION = 'Clash Godot runtime CDN cache';
const ONE_YEAR_SECONDS = 31536000;

if (!TOKEN) {
  console.error('Missing CLOUDFLARE_API_TOKEN. Required permissions: Zone > Cache Rules > Edit, Zone > DNS > Edit if using --configure-dns.');
  process.exit(1);
}

async function cf(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    const err = new Error(`Cloudflare API ${options.method || 'GET'} ${path} failed: ${response.status}`);
    err.response = data;
    throw err;
  }
  return data;
}

async function resolveZoneId() {
  if (ZONE_ID) return ZONE_ID;
  const data = await cf(`/zones?name=${encodeURIComponent(DOMAIN)}`);
  const zone = data.result?.[0];
  if (!zone?.id) throw new Error(`Cloudflare zone not found for ${DOMAIN}. Add the domain to Cloudflare first.`);
  return zone.id;
}

async function ensureProxiedDns(zoneId) {
  const data = await cf(`/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(DOMAIN)}`);
  const existing = data.result?.[0];
  if (existing) {
    if (existing.proxied && existing.content === ORIGIN_IP) {
      console.log(`DNS A ${DOMAIN} already proxied to ${ORIGIN_IP}`);
      return;
    }
    await cf(`/zones/${zoneId}/dns_records/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: 'A',
        name: DOMAIN,
        content: ORIGIN_IP,
        proxied: true,
        ttl: 1,
      }),
    });
    console.log(`Updated DNS A ${DOMAIN} -> ${ORIGIN_IP}, proxied=true`);
    return;
  }

  await cf(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'A',
      name: DOMAIN,
      content: ORIGIN_IP,
      proxied: true,
      ttl: 1,
    }),
  });
  console.log(`Created DNS A ${DOMAIN} -> ${ORIGIN_IP}, proxied=true`);
}

async function getOrCreateCacheRuleset(zoneId) {
  const entrypointPath = `/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`;
  try {
    const data = await cf(entrypointPath);
    if (data.result?.id) return data.result;
  } catch (err) {
    const code = err.response?.errors?.[0]?.code;
    if (code !== 10000 && code !== 10003 && code !== 7003) throw err;
  }

  const created = await cf(`/zones/${zoneId}/rulesets`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'default cache settings',
      description: 'Zone cache rules',
      kind: 'zone',
      phase: 'http_request_cache_settings',
      rules: [],
    }),
  });
  return created.result;
}

function buildGodotCacheRule(existingRule = {}) {
  return {
    ...existingRule,
    enabled: true,
    description: RULE_DESCRIPTION,
    expression: `(http.host eq "${DOMAIN}" and starts_with(http.request.uri.path, "/godot/") and http.request.method in {"GET" "HEAD"})`,
    action: 'set_cache_settings',
    action_parameters: {
      cache: true,
      edge_ttl: {
        mode: 'override_origin',
        default: ONE_YEAR_SECONDS,
      },
      browser_ttl: {
        mode: 'respect_origin',
      },
      respect_strong_etags: true,
      serve_stale: {
        disable_stale_while_updating: false,
      },
    },
  };
}

async function ensureGodotCacheRule(zoneId) {
  const ruleset = await getOrCreateCacheRuleset(zoneId);
  const rules = Array.isArray(ruleset.rules) ? [...ruleset.rules] : [];
  const idx = rules.findIndex((rule) => rule.description === RULE_DESCRIPTION);
  if (idx >= 0) {
    rules[idx] = buildGodotCacheRule(rules[idx]);
  } else {
    rules.unshift(buildGodotCacheRule());
  }

  const updated = await cf(`/zones/${zoneId}/rulesets/${ruleset.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: ruleset.name || 'default cache settings',
      description: ruleset.description || 'Zone cache rules',
      kind: 'zone',
      phase: 'http_request_cache_settings',
      rules,
    }),
  });

  const rule = updated.result?.rules?.find((item) => item.description === RULE_DESCRIPTION);
  console.log(`Cache rule ready: ${rule?.id || '(created)'}`);
}

async function warmGodotCache() {
  const urls = [
    `https://${DOMAIN}/godot/Work.js`,
    `https://${DOMAIN}/godot/Work.wasm`,
    `https://${DOMAIN}/godot/Work.pck`,
  ];
  for (const url of urls) {
    const started = Date.now();
    const response = await fetch(url, {
      headers: { 'accept-encoding': 'br' },
    });
    console.log(`${url} status=${response.status} cf-cache-status=${response.headers.get('cf-cache-status') || '-'} bytes=${response.headers.get('content-length') || '-'} ms=${Date.now() - started}`);
    await response.arrayBuffer();
  }
}

try {
  const zoneId = await resolveZoneId();
  console.log(`Using Cloudflare zone ${zoneId} for ${DOMAIN}`);
  if (CONFIGURE_DNS) await ensureProxiedDns(zoneId);
  await ensureGodotCacheRule(zoneId);
  if (WARM_CACHE) await warmGodotCache();
} catch (err) {
  console.error(err.message);
  if (err.response) console.error(JSON.stringify(err.response, null, 2));
  process.exit(1);
}
