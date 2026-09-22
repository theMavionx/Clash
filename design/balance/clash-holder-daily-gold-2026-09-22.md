# Balance Check: Robinhood CLASH Daily Gold

## Data Sources Analyzed

- `design/gdd/economy-balance.md` (existing ~360 Gold/day trading baseline; ~55,400 Gold progression cost).
- `server/db.js` (`TH_BASE_CAPACITY`, `STORAGE_CAPACITY`, daily holder ledger).
- `server/sanctum_rewards.js` (existing independent daily Gold faucet and storage-safe claim).
- `server/clash_holder_rewards.js` (new $50/$100/$500 thresholds).

## Health Summary: CONCERNS

The exact owner-specified rewards are implemented. They greatly exceed the existing trading baseline and are an additive Gold faucet; no existing faucet or sink is reduced. Robinhood CLASH and clashSOL rewards can both accrue independently.

| Minimum daily CLASH holding | New Gold/day | 28 completed days | With ~360 trading Gold/day | Approximate days to 55,400 Gold from this faucet alone |
| --- | ---: | ---: | ---: | ---: |
| $50 | 1,000 | 28,000 | 38,080 | 56 |
| $100 | 5,000 | 140,000 | 150,080 | 12 |
| $500 | 10,000 | 280,000 | 290,080 | 6 |

## Outliers and Degenerate Strategies

- At $100+ and especially $500+, Gold stops being the main progression bottleneck in the historical model. Wood, ore, build timers and Town Hall gating dominate instead.
- Gold storage capacity limits immediate receipt (TH1 base capacity: 6,000). Unclaimed remainder is kept in the reward ledger; no Gold is discarded.
- Sampling the lowest observed USD holding over a completed UTC day prevents a late price or balance increase from upgrading that day's tier. One wallet cannot accrue for two players on the same day, and a sampled player cannot switch reward wallets until 00:00 UTC.
- A 30-minute sample cadence cannot prove continuous second-by-second ownership between samples. Mitigation: at least two samples separated by six hours are required. This is the same coverage rule used for clashSOL and avoids granting an instant daily reward for a temporary claim-time balance.
- DexScreener price or paid Robinhood RPC outages fail closed: missing observations may make the day ineligible. Snapshot failures are audited without exposing paid RPC credentials.

## Recommendations

| Priority | Issue | Suggested follow-up | Impact |
| --- | --- | --- | --- |
| High | 5,000–10,000 Gold/day may trivialize Gold costs | Monitor median daily claims and progression; adjust only after owner approval | Preserves owner-defined tiers now |
| Medium | Sample gaps and late wallet linking | Show explicit insufficient-coverage status and sample telemetry | Explains zero-entitlement days |
| Medium | Price-source concentration | Add independent Robinhood CLASH price cross-check if daily holder volume grows | Reduces oracle manipulation/outage risk |

## Values That Need Attention

The specified thresholds and payouts are unchanged: $50→1,000, $100→5,000, $500+→10,000 Gold per eligible completed UTC day. Claims open after the day rolls over at 00:00 UTC; wallet linking partway through a day only earns that day if the observation coverage rule is met. No backdated rewards are created.
