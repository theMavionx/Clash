# ADR-0023: Robinhood Lighter deployment and partner attribution

- **Status:** Accepted
- **Date:** 2026-08-14
- **Decision owners:** Clash of Perps

## Context

Robinhood Lighter exposes the Lighter API and transaction schema from a separate production deployment at `https://api.rh.lighter.xyz`. It supports permissionless Partner Attribution: an integrator is identified by an account index, each user approves that integrator on the relevant deployment, and every attributed order carries the integrator index plus maker/taker fee values.

Clash already integrates public Lighter with integrator account index `730898`. A live account lookup confirms that index belongs to the Clash partner wallet on public Lighter, while the same index is absent from Robinhood Lighter. Account indexes, API keys, approval state, transaction domain details, and earnings therefore cannot be treated as portable between deployments.

## Decision

1. Register Robinhood Lighter as a separate Clash DEX id, `rhlighter`, with server routes under `/api/futures/rh-lighter` and public API base `https://api.rh.lighter.xyz`.
2. Reuse one reviewed Lighter adapter through immutable, request-scoped deployment profiles. Robinhood and public Lighter keep separate API bases, caches, browser credential storage, auth tokens, account indexes, approval state, logs, verified trade sources, rewards, tournaments, and earnings records.
3. Do not reuse public Lighter integrator index `730898`. Robinhood openings remain fail-closed until `RH_LIGHTER_INTEGRATOR_ACCOUNT_INDEX` points to an account that exists on Robinhood Lighter and its owner matches `RH_LIGHTER_INTEGRATOR_L1_ADDRESS` (defaulting to the existing Clash partner wallet).
4. Set the Clash Partner Attribution fee to **1 basis point** for maker and taker orders. Lighter wire values are parts per million, so the order carries `integrator_taker_fee=100` and `integrator_maker_fee=100`.
5. Require the official `ApproveIntegrator` flow and verify `approved_integrators` from the remote account response. Browser storage is only a credential cache; it is never authoritative for approval.
6. Use the SDK-provided `messageToSign` for cross-owner approval. Do not borrow public Lighter chain id `304` for Robinhood Lighter unless RH publishes/configures `RH_LIGHTER_CHAIN_ID`.
7. Robinhood referral attribution remains independent from Partner Attribution, but Clash also requires a confirmed referral before opening new positions. Preserve any existing RH referral; when none exists, submit the dedicated RH code `CLASSHOFPERPS` through the authenticated RH referral API. Never reuse or silently submit the public-Lighter code.
8. Use the public Robinhood `partnerStats` endpoint as the exact cumulative earnings source. Persist attributed fills with verified source `rhlighter_integrator` for per-player rewards, recent activity, 24-hour analytics, and order-level proof.
9. Market data remains available when partner configuration is incomplete, but opening orders, approval preparation, and reward imports fail closed. Cancel and risk-reducing account access remain independent where supported.

## Alternatives considered

### Reuse public Lighter account index 730898

Rejected. The Robinhood account endpoint reports that index as absent; routing it would either fail or misattribute fees if the index is later assigned to another owner.

### Copy the existing Lighter server adapter

Rejected. A second large implementation would drift in signing, order normalization, TP/SL, and security fixes. Request-scoped immutable profiles preserve one implementation without cross-deployment state leakage.

### Allow orders while the Robinhood partner index is pending

Rejected. Partner attribution is part of each order and cannot be added retroactively. Unattributed openings would permanently lose builder fees and make reward accounting unverifiable.

### Treat a local approval flag as sufficient

Rejected. Users can change approvals on another client, and deployment-specific approvals can expire or have inadequate fee caps. The remote account state is authoritative.

## Consequences

- A Robinhood Lighter account must first be created for the Clash partner wallet; its account index must then be configured before trading can be enabled.
- Existing public Lighter users and credentials continue to use the unchanged `lighter` profile.
- Users who trade on both deployments configure separate account/API-key credentials, referral state, and Clash integrator approval. Existing RH referrals are accepted and never overwritten; accounts without one attach `CLASSHOFPERPS` before opening trades.
- Exact cumulative RH partner earnings are readable without estimating from volume, while local fill import provides player attribution and recent-window metrics.
- No funded or signed production smoke is possible until a valid RH integrator account exists and an owner explicitly authorizes the approval/order test.

## References

- https://apidocs.rh.lighter.xyz/docs/get-started
- https://apidocs.rh.lighter.xyz/docs/partner-attribtuion
- https://apidocs.rh.lighter.xyz/reference/partnerstats
- https://apidocs.rh.lighter.xyz/reference/systemconfig
- https://apidocs.rh.lighter.xyz/reference/accountsbyl1address
