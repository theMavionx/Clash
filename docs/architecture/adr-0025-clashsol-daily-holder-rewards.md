# ADR-0025: clashSOL Daily Holder Rewards and Battle Shop

## Status

Accepted

## Date

2026-08-18

## Context

clashSOL is now a live 9-decimal SanctumSpl LST. Clash already has a secure
server-side Sanctum proxy and short-lived exact-message order intents, but the
entry is mounted in the construction picker, supports only SOL to clashSOL, and
has no holder-reward ledger or administrative controls.

The owner wants a player-facing Battle Shop product with bidirectional swaps,
a daily in-game Gold loyalty reward for verified clashSOL holdings, adjustable
reward economics, and complete player/admin history. The Sanctum API key must
remain server-only, wallet custody must remain with the player, rewards must be
idempotent, and a full Gold storage must never silently destroy an entitlement.

## Decision

### Battle Shop and swaps

Move clashSOL into a first-class Battle Shop tab and remove it from the
building picker. Extend the existing allowlisted exact-input order service to
the two safe directions only:

- wrapped SOL to the configured clashSOL mint;
- the configured clashSOL mint to wrapped SOL.

The server owns both mints, direction, stored upstream order, expiry, and
unsigned message hash. The browser signs only the reviewed transaction. The
server verifies the required signer, Ed25519 signature, and exact message hash
before calling Sanctum execute. The API key is never exposed to Vite.

### Completed-day reward observations

Create periodic balance observations for one explicitly linked reward wallet
per player. A wallet must be linked to exactly one Clash player through an
existing wallet authentication proof. Once the first observation for a UTC day
exists, the player cannot switch the reward wallet until the next UTC day.

After a UTC day completes, finalize one immutable reward row using that day's
minimum observed clashSOL balance. At least two observations spanning six hours
are required; otherwise the day earns zero rather than estimating historical
ownership from a later balance. The finalized row records:

- reward day, observation coverage and Solana RPC evidence;
- exact minimum clashSOL balance in token atomics;
- the effective integer Gold-per-clashSOL rate;
- the resulting integer Gold entitlement.

The reward formula is:

`floor(balance_atomics * gold_per_clashsol / 1_000_000_000)`

The initial rate is 2,000 Gold per clashSOL. Settings changes become effective
on the next UTC day, so an already-created entitlement never changes. A unique
constraint on player/day and wallet/day prevents duplicate claims and prevents
one linked wallet from rewarding multiple game accounts.

Observations are created by a low-frequency server scheduler for linked Solana
wallets. Opening the shop, linking a wallet, checking status or claiming never
creates a same-day entitlement. RPC reads use the existing private Solana
fallback policy, and successes/failures are recorded for operations. A missing
historical observation is never fabricated from a later balance.

### Claim atomicity and capacity

Claiming updates the player Gold balance and consumes the oldest ready reward
amounts in one SQLite transaction. The claim is capacity-safe and may be
partial: only the Gold that currently fits is credited, while the remainder
stays banked and claimable later. Tournament Gold multipliers do not apply to
clashSOL loyalty rewards; the configured rate is the exact economy cost.

### Admin and observability

Admin exposes current/live LST status, the effective and next reward settings,
holder/snapshot/claim/swap metrics, recent claim and swap history, and immutable
configuration history. Rate and enabled-state changes require admin auth,
validate bounded integer input, and become effective the next UTC day.

## Alternatives Considered

### Calculate rewards only in the browser

Rejected because a client can spoof balances, dates, rates, and claim state.

### Recalculate current balance on every claim without observations

Rejected because it rewards temporary same-day borrowing, and retries or later
rate changes could produce different results with no trustworthy audit trail.

### Credit Gold even when storage is full

Rejected because `addResources` clamps to storage capacity and would silently
burn part of the loyalty reward. Capacity-safe partial claims preserve the
unclaimed remainder instead.

### Make the Clash server a generic Sanctum swap proxy

Rejected because it would expose the partner API quota to arbitrary token
routes and remove the mint-level safety boundary accepted in ADR-0019.

## Consequences

### Positive

- Self-custodial in-app staking and unstaking.
- Deterministic, auditable and idempotent completed-day rewards.
- Reward economics can change without rewriting historical entitlements.
- Player and admin histories reconcile from the same ledgers.
- Full storage and transient RPC failures do not lose earned rewards.

### Negative

- Daily RPC reads add bounded operational load proportional to linked Solana
  wallets.
- A wallet first linked after a missed UTC day cannot receive a fabricated
  historical entitlement, and a day without sufficient observation coverage
  earns zero.
- Funded end-to-end swap verification still requires an owner wallet signature.

## Performance Implications

- Balance observations run every 30 minutes at bounded concurrency and use a
  unique wallet/time-bucket key to skip duplicates.
- Player reward/status reads use indexed player/day queries.
- Admin metrics aggregate indexed snapshot and intent ledgers.
- No polling loop runs in the browser; the Battle Shop refreshes on open,
  explicit refresh, claim, and swap success.

## Migration Plan

1. Add immutable reward-settings, balance-observation, daily reward and claim indexes.
2. Extend stored Sanctum intents with direction and allowlisted reverse swaps.
3. Add reward status, wallet-link, claim, history and admin endpoints.
4. Move the UI into Battle Shop and add Swap, Daily Gold and History sections.
5. Configure the live public mint in the production shared environment.
6. Run server, frontend, RPC, responsive browser and production smoke checks.

## Validation Criteria

- No Sanctum API key appears in source, browser assets, responses or logs.
- Both swap directions reject arbitrary mints and modified signed messages.
- Wallet ownership, same-day wallet locks and daily uniqueness are enforced server-side.
- Rate changes do not alter existing daily rows.
- Concurrent duplicate claims credit Gold once.
- Full storage leaves the entitlement banked; partial capacity claims preserve the remainder.
- Player/admin histories and aggregate totals reconcile.
- Battle Shop works in light/dark desktop and narrow mobile layouts.

## Related Decisions

- [ADR-0019: clashSOL Sanctum Shop Integration](./adr-0019-clashsol-sanctum-shop-integration.md)
- [ADR-0007: Batch NFT and Shop Transactions](./adr-0007-batch-nft-and-shop-transactions.md)
