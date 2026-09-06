# BULK PnL, builder, referral and order-flow audit

- Reported: 2026-09-06; reporter: owner (two BTC position screenshots).
- Build examined: b93f6eb1, codex/bulk-mainnet; production public config agrees with local defaults.
- Environment: Windows/Chrome, Clash web + BULK mainnet. Public account reads and readonly production SQLite queries, approximately 07:44–07:56 UTC.
- Account: 4Ze3bbJbmBjAUutV3LT1XUmqZG67fAR5PUr7vkXUgU2g; linked player 62364127-cf8b-4cd1-b044-52fa2833d871.
- Scope: diagnosis, documented recommendations and local verification. No application code, production config/data, wallet permissions, orders, referral assignment, commits or deployments changed.

## BUG-BULK-20260906-01 — Inconsistent PnL percentage basis

Severity S3-Minor; priority P2; status Open. UI/trading; reproducible for leveraged positions; regression unknown.

Reproduction: compare the same long 0.000609 BTC, entry 79,795.40, mark 79,781 at 20x in both interfaces.

- Actual dollar PnL: 0.000609 × (79781 − 79795.4) = -0.0087696. Clash -0.008770 and BULK -0.0088 agree after rounding. This is not a 20x dollar loss.
- Actual percentage: BULK screenshot -0.018%; Clash -0.36%.
- Root cause: FuturesPanel.jsx getPositionMetrics multiplies price return by setLev when no explicit pnl_pct is normalized. useBulk.js preserves unrealizedPnl but supplies no percentage. -0.018046153% × 20 = -0.360923061%.
- Expected: clearly named denominator and consistent BULK-style position return; preserve native dollar uPnL. A separately labelled margin ROI is a different metric.
- Recommendation: normalize BULK percentage explicitly, preserve legitimate zero returns, label percentage basis and retain cents in entry/mark display. Test long/short/flat/partial and differing leverage without changing other venues.
- Evidence: owner screenshots, actual code, arithmetic reproduction, public fullAccount snapshot. Documentation confirms the signed-size × mark/entry difference formula, not the UI percentage denominator: [Price Indices](https://docs.bulk.trade/bulk-exchange/Price-Indices).

## BUG-BULK-20260906-02 — Builder payout account is not initialized

Severity S2-Major (revenue); priority P1; status Blocked on payout-account activation. Integration/configuration; current deployment always omits builder fees; intentional safety default, not a new regression.

Reproduction: GET Clash /api/futures/bulk/config; unsigned BULK fullAccount query for configured recipient.

- Actual production config: builder_enabled=false, builder_fee_bps=0, recipient Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9.
- BULK mainnet recipient response: ACCOUNT_NOT_FOUND, "account was not found".
- Production signed-order proof for the owner's entry has empty builder_address and fee_bps=0. No builder payment is evidenced for this trade.
- The native fill's fee -0.017008 matches the ordinary 3.5bps taker fee on $48.5907954; it is not a Clash builder commission.
- Expected: an existing canonical root recipient, master-wallet approval, fee-bearing signed m/l order, and verified settlement.
- Recommendation: owner initializes the intended root payout account using BULK's supported flow, then validate its identity, enable the agreed fee and request each trader's explicit approval. Do not enable fees against a nonexistent recipient or silently attach approvals.
- Relevant files: server-futures/bulk.js config/getBuilderStatus/buildActions/verifyTransaction. Local enabled-mode signing/approval/tamper tests pass; that does not establish production activation or revenue.
- Source: [Builder Codes](https://docs.bulk.trade/bulk-exchange/builder-codes).

## BUG-BULK-20260906-03 — Referral status is inferred from unrelated setup readiness

Severity S2-Major; priority P1; status Open. Integration/UI; always when setupVerified is true; regression unknown.

Reproduction: inspect useBulk.js return value after account setup succeeds with builder disabled.

- Actual: referralStatus.has_referrer = setupVerified === true and code is hard-coded to clashofperps. There is no referral verification request.
- Configured link remains early.bulk.trade/deposit?ref=clashofperps, the historical predeposit route. This audit did not follow/submit it or alter attribution.
- Official connected Referrals page shows 0 referred traders/$0 referred volume; these are this wallet's outbound referrals, not proof of its inviter. Enter Code opens an empty one-time-submission dialog. Nothing was submitted.
- Expected: builder readiness, exchange access and inviter attribution are separate facts. Unknown referral linkage must remain unknown.
- Recommendation: use the current supported mainnet referral/access-code flow; only mark confirmed after authoritative evidence. Do not claim an existing link assigns every trader. Confirm exact case-sensitive CLASH referral name with the owner/BULK.
- Source: [Referral](https://docs.bulk.trade/bulk-exchange/referral) distinguishes legacy predeposit links and one-time mainnet access codes; referral names are case sensitive.

## BUG-BULK-20260906-04 — Counterparty order ID persisted as our proof

Severity S2-Major; priority P1; status Open. Backend/rewards attribution; reproduced on the only stored BULK entry proof; broader frequency unknown.

Reproduction: reconcile the stored entry response against native account orderHistory and fills.

- Stored proof ID: Ebv2uELerPyzLkmwf8JTX3FdYFxwV6PMQVj8kHLjLbLM (counterparty maker).
- Correct entry ID: F9m7Bz54azaXWtiznaFAZy6MjQmNRzzrcu6K4fWrYY2W (owner taker).
- Stored upstream response contains statuses [working(counterparty oid), filled(owner oid)]. persistSubmittedProofs incorrectly assumes statuses[index] corresponds to actions[index] and prefers that ID over the canonical signed-action ID.
- The local canonical order-ID calculation for action 0, nonce 1788678450018627098, BTC-USD buy 0.000609, cross/non-reduce, no builder, independently returns the correct F9m... ID.
- Public orderHistory confirms F9m... filled at 79,795.40 for 0.000609; public fills assigns F9m... to the owner as taker and Ebv... to the maker.
- Dollar volume: $48.5907954. Readonly production trade_history count for the player's BULK rows: 0.
- Expected: bind our signed action to our canonical ID and matching execution; never accept a counterparty ID simply because its status appears first.
- Recommendation: status correlation by canonical ID, regressions with expanded/reordered/mixed statuses, then separately authorized idempotent repair from retained signed proof plus native execution. Do not relax account/order ownership checks or match arbitrary counterparty fills.
- Source: [Query Account](https://docs.bulk.trade/api-reference/getAccount). History coverage returned "unknown"; one observed fill is not a certified complete lifetime history.

## BUG-BULK-20260906-05 — Close callback contract mismatch

Severity S2-Major; priority P1; status Open. Trading UI/hook; all shared positional Close calls; regression unknown.

Reproduction: call the actual useBulk close callback using the shared UI contract closePosition('BTC','bid','0.0003045',...). No wallet/network operation was used.

- UI passes symbol, open side, amount and optional position identifiers. useBulk expects a single position object.
- Actual captured market-call arguments: [undefined, 'bid', 0, '0.5', 1, {reduce_only:true,size_base:0}].
- The legacy object call correctly produced BTC/ask/size_base=0.000609. The shared UI call cannot close the requested long/partial amount.
- Expected: matching shared hook signature, opposite execution side, exact partial/full size, isolated routing when applicable, reduce-only enforced.
- Recommendation: adapt BULK's boundary and test all compact/fullscreen/card Close call sites using a stub signer; never use a live close as the initial test.
- Relevant files: web/src/hooks/useBulk.js:412 and FuturesPanel.jsx close call sites (PositionsList, BottomPanel and compact panel).

## BUG-BULK-20260906-06 — Order side mapping ignores native signed size

Severity S3-Minor; priority P2; status Open. Order display; affected API rows with size and no isBuy/sz/signed_size; regression unknown.

Reproduction: run the actual nextOrders mapper with native stop order size=-0.000609.

- Actual side: bid. The side expression reads sz/signed_size, falls back to 0 and concludes buy; it ignores size, although amount reads size correctly.
- Live protective-order rows include a negative-size stop. Its trigger remains correctly defined by isAbove=false, but the displayed direction is wrong.
- Expected: honor explicit side and native signed size for ordinary orders; for protective types derive execution semantics from order type/trigger/position rather than blindly treating trigger direction as order side.
- Recommendation: fixture tests for buy/sell/stop/takeProfit including native API rows, and reuse a typed normalizer.
- No live protective order was modified. Live TP 80,593.21 and SL 78,598.68 both exist and are resting.

## Additional latency finding

useBulk polls account/prices every 15 seconds and has no account WebSocket subscription. Fast official changes can precede Clash by a polling cycle; REST failures extend it. A 12-second unsigned public account WS probe returned one subscription response and two accountSnapshot messages spanning 6.188s. The probe emitted an error during shutdown; long-term reconnect health is not certified.

Recommendation: implement documented [Account Stream](https://docs.bulk.trade/api-reference/ws-account) with snapshot/delta handling, wallet-scoped cancellation, freshness ordering, reconnect and REST fallback. Do not merely poll faster or substitute a different venue's price.

## Verification and limits

- Existing suites passed: test-bulk-wire.js, test-bulk-adapter.js, test-bulk-proof-flow.js, test-bulk-live-shapes.js, web/test-bulk-client.mjs, web/test-position-pnl-metrics.mjs. Tests used local temporary SQLite, mock upstream responses and local test signing keys.
- These suites omit the expanded actual response statuses and shared Close callback contract; passing them does not invalidate the reproductions above.
- Dynamic source-based diagnostic probes executed the actual Close callback and order mapper with local stubs. Screenshot arithmetic, deterministic canonical order hash, live unsigned account/fill/order reads, public deployment config, readonly production proof/count queries and official connected browser state were checked.
- No funded trade, cancel, TP/SL, key approval, deposit, withdrawal, referral submission, reconciliation import or production mutation was executed.
- Only the request log and this report were added for this audit. Existing Imperial report edits were preserved.

## Recommended implementation order

1. Correct Close contract and canonical proof/status correlation, with adversarial regression tests.
2. Align percentage semantics and native position/order precision; add safe live account updates.
3. Separate referral status from builder readiness and expose truthful disabled/unverified states.
4. With separate owner approval, repair the missing $48.5907954 fill idempotently and publish verified code.
5. Owner activates the intended builder root account; verify mainnet registration and approvals before enabling the agreed fee. Confirm future revenue from actual fills/account credits, not a config flag.
