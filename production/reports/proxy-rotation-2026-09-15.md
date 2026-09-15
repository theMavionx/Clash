# Production proxy rotation — 2026-09-15

Owner explicitly requested replacement and immediate production application.

- Input: 100 unique, valid Webshare entries; credentials kept outside Git and tool output.
- Production-origin probes: 99 HTTP 200 responses from Hibachi public exchange-info; input entry 16 failed twice (timeout / connect timeout) and was excluded.
- Atomically installed 99 validated entries at `/opt/clash/shared/hibachi-proxies.txt`, permissions 0600.
- SHA-256: `dc6ee1b668ad578be38a6b156aba64659501223330c0480e49ce239629c1d5d8`.
- Protected rollback copy: `/opt/clash/shared/proxy-backups/rotation-20260915-1789469011373/hibachi-proxies.txt`.
- Restarted clash-api, clash-futures and clash-hermes-jobs; all five Clash PM2 services online. API and futures startup logs confirm 99 configured proxies.
- API, futures and MCP health endpoints returned HTTP 200.
- Three application public-read relay requests returned HTTP 200, valid JSON and `X-Clash-Public-Transport: proxy`, proving actual proxy routing without direct fallback.
- Updated ignored local deploy configuration to use the newly supplied file. That original local file retains all 100 entries; deployment transport can try alternate entries.
- No application release, database changes or funded trading actions. Probes establish current availability to the tested provider, not guaranteed availability of every upstream service.

Rollback: restore the protected prior pool to its configured shared path with mode 0600 and restart the same three consumers.
