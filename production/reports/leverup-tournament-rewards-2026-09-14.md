# LeverUp Tournament, Gold and Quest Support

## Summary

- ID: BUG-LEVERUP-TOURNAMENT-REWARDS
- Severity: S2-Major; priority: P1; system: LeverUp V2 trading rewards and
  tournament administration.
- Reported: 2026-09-14 by owner; baseline: `3434063f`.
- Status: released to production and post-deploy verified.
- Category: intentionally incomplete integration / missing verified fill
  attribution. LeverUp trading itself remained available.

## Reproduction and root cause

Open admin tournament settings and inspect Primary DEX or custom eligible DEXes.
Expected: LeverUp V2 is selectable and its qualifying trades can contribute to
tournament volume/PnL, Gold and quests. Actual: LeverUp is absent. The web
regression explicitly required that exclusion, the main SQLite tournament CHECK
rejected `leverup`, and reward/task/tournament registries omitted the venue.

This was not only a dropdown defect. LeverUp's public history identifies the
trader and executed transaction, but does not repeat the broker carried by the
signed V2 intent. Trusting public wallet history alone would let unrelated
LeverUp trades earn Clash rewards. The original integration therefore excluded
LeverUp until a broker-attribution proof chain existed.

## Correction

- Persist future accepted V2 intent proofs scoped to exact Clash player, linked
  wallet, intent hash, action, nonce, on-chain-verified broker ID/receiver and
  relayer execution status. Signatures, private keys and `actionData` are not
  stored. Existing history is not backfilled.
- Refresh pending intent status from the official relayer. A direct history fill
  is eligible only when its official transaction hash joins a successful,
  reward-eligible Clash intent.
- Learn limit/decrease order hashes only from official lifecycle rows sharing
  that successful intent transaction. Later keeper executions must join that
  durable order proof. Source labels or forged JSON alone cannot pass the SQL
  eligibility predicate.
- Normalize only known economic operations from official history, with exact
  wallet checks, 10-decimal quantity, 18-decimal execution price and USD PnL/
  fees. `tokenInPrice` accepts both the API's decimal string and older raw
  18-decimal units.
- Enable LeverUp in the admin dropdown, API and legacy admin labels, tournament
  SQLite migration/CHECK, AI tournament builder, reward/stat/debug registries,
  task refresh, tournament synchronization and exchange-balance telemetry.
- Use the shared identity-safe Gold scheduler in the LeverUp browser hook. It
  schedules a claim only after the relayer reports successful execution and the
  server response confirms that reward proof tracking was recorded.
- Add the new LeverUp regressions to the canonical deploy gate.

## Verification

- Broker-proof importer test: direct opens/closes, async limit and decrease
  executions, player/wallet isolation, pending/failed statuses, wrong broker,
  untracked history, replay idempotency and decimal collateral-price PnL/fee
  conversion all pass.
- Actual local Express + both SQLite databases: a durable verified LeverUp fill
  is accepted; a forged same-source row is excluded; $100 volume completes both
  volume and position quests; the real claim route awards server-calculated
  Gold; tournament volume, trade count, PnL and Gold update together.
- Tournament migration recreates an old CHECK-constrained database, preserves
  its tournament and participant values, accepts a new LeverUp tournament, and
  passes foreign-key and integrity checks.
- LeverUp V2 protocol/browser regression passes, including broker receiver
  verification, future-only reward proof contents, tournament availability and
  automatic Gold scheduling contract.
- Full canonical `tools/codex/check-repo.ps1 -Mode Deploy`: PASS. This includes
  all trading/server suites, syntax checks, PowerShell parsing, Godot behavior
  probes, lint with 0 errors (135 existing warnings) and the production web
  build.

## Safety and remaining limits

Rewards fail closed: historical LeverUp trades and any intent not captured by
this release remain ineligible. No manual reward grant, database repair, funded
trade, signature, order submission or account mutation was used for testing.
Live production verification can confirm configuration, migrations, health and
read-only importer behavior; a real future owner trade is still required to
prove end-to-end provider execution and reward accrual with live funds.

## Release

Owner explicitly authorized completing the integration and deploying it. The
repository's referenced `deploy-clash` skill is unavailable, so the release uses
the existing canonical `tools/codex/deploy-local-to-prod.ps1` workflow. The
configured proxy pool was unavailable during deployment, while the pinned-host-
key direct SSH route was healthy, so the same canonical atomic deploy was run
directly after the complete Deploy gate had passed.

- Commit `5aff5fd89afc044d38e7e4c5aa4aa55c750478cc` was fast-forwarded to
  `origin/main` and production `/opt/clash`.
- Active release: `/opt/clash/releases/20260914105559-5aff5fd8`; the canonical
  source HEAD and current symlink both match the release commit.
- Local production health checks returned HTTP 200 for API `:4000`, futures
  `:3999` and MCP `:4100`. All five Clash PM2 processes are online with zero
  post-release restarts.
- The live public LeverUp config reports V2, broker `2`, `active=true`,
  `status=verified_onchain`, matching the expected receiver, and zero extra fee.
- The production futures database contains both proof tables and passes
  `quick_check`; both tables are initially empty, as required by the no-backfill
  policy. The live tournament schema accepts `leverup`; no test tournament was
  inserted into production.
- The externally served `admin.html` selects `admin-g0vhYv3O.js`, returns HTTP
  200, and that active bundle contains the LeverUp option.
- No funded trade was placed. The first real post-release owner trade remains
  the final live-funds confirmation of execution-to-Gold attribution.
- The canonical deploy's existing Solana payment sync also refreshed the
  `dragon:clash` 10 USD quote from `21510.002152` to `102082.482646` CLASH at a
  fetched price of `0.00009796` USD.
