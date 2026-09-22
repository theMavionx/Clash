# LeverUp tournament volume investigation — 2026-09-22

Owner request: investigate missing tournament volume for wallet
`0xB98cBF09e757E440CA228795EE32e1C44D7BCfb5` and deploy a verified correction if required.

## Evidence (read-only production and official history)

- Player Umpych: `e15a59e1-6f56-4d56-b85a-0b6cb2d585a5`, LeverUp.
- Tournament 28: joined September 21 at 18:01:34 UTC; tournament permits LeverUp.
- Three locally verified broker-2 intents on September 21 at 21:01:34,
  21:03:01 and 21:03:56 UTC were imported with official history IDs
  1621176, 1621188 and 1621191.
- Their notionals are $308.2875851474832, $506.6740900346794 and
  $577.2044669782074, totaling **$1392.16614216037**.
- Production tournament participant and trade-credit rows already contain that
  exact total, credited September 22 at 10:42:36 UTC. The zero-volume screenshot
  does not represent the current persisted total.
- Newer September 22 opens at 10:52:03 and 10:56:16 UTC have same-transaction
  decrease-order lifecycle rows identifying broker **1**, not Clash broker 2.
  Those transactions have no successful Clash intent proof. They must not be
  manually relabeled or awarded as broker-2 activity.
- History includes cancelled/created orders, which are not additional executed
  economic volume. The actual delta quantity and execution price match the
  existing parser; no valuation correction was justified.

## Changes

- Importer now returns economic-row count, eligible-intent count, and separate
  ignore reasons (wallet mismatch, missing Clash route, invalid fill).
- Added regression assertions distinguishing unrelated wallet/broker activity.
- No eligibility rules, rewards, historical records or production balances changed.

## Verification

- `node server-futures/test-leverup-rewards.js`: PASS.
- `node server/test-leverup-reward-flow.js`: PASS (isolated real route/DB flow,
  Gold claim, task progress and tournament credit).
- `git diff --check` for changed code: PASS.
- No funded transaction, production mutation or deployment performed by this agent.
  Root agent coordinates release and log integration.
