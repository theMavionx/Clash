# USDG temporary payout asset — 2026-09-21

- Owner requested USDG instead of CLASH for Robinhood test payouts, explicitly 1000 CLASH = 1 USDG. Configure fixed ratio `0.001`, not a market-price oracle.
- Official address: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, Robinhood mainnet 4663. Source: Paxos issuer documentation https://docs.paxos.com/guides/stablecoin/usdg/mainnet (search-indexed issuer table; direct page fetch403). Issuer availability also confirmed at https://globaldollar.com/build-with-usdg.
- Narrow supply-rule exception for this exact address only; requires symbol USDG, six decimals and positive supply. All other configured tokens still require one-billion supply. Chain, code, inventory, gas, finalized receipt and exact transfer checks unchanged.
- Correct UI payout/rate/history labels; history now exposes its stored target contract, so later config changes do not relabel old payouts. Immutable quote asset/rate tested at exact 1000→1 conversion.
- Production preflight: acceptance false, no requests/sales, no snapshot, both treasury addresses configured. Read-only RPC probe using stored paid Alchemy key returned HTTP403; no public-node fallback. Real metadata and funded payout could not be tested through paid RPC. No secret output or wallet changes.
- 30 focused backend/label tests passed. Full browser regression passed including USDG mobile rate/review labels and screenshot review. Full canonical Deploy gate passed (existing bundle-size warnings). Release/config update pending.
