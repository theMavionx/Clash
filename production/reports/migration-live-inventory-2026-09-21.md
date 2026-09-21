# Current treasury inventory — 2026-09-21

- Owner requested read-only simulation and removing the finalized-balance delay. Latest EVM block number now pins contract/metadata/USDG inventory/ETH reads. Existing reservations and all settlement-finality, exact-transfer, nonce and signing checks retained.
- Live paid-Alchemy eth_call for 1 and20USDG to a nonzero fixture recipient returned true. eth_estimateGas returned48652/48898; estimated costs2365654848000/2377616352000wei. Pending nonce stayed0x50. No treasury private key loaded for this diagnostic; no transaction signed or broadcast. This proves simulation only, not future funded execution.
- 33 focused chain/ledger/HTTP tests passed including newly pinned latest health, zero balance/gas failures, preserved receipt finality and simulation-revert rejection.
- ADR0046 documents reorg/liquidity tradeoff. Full canonical Deploy gate passed (existing bundle-size warnings). Release pending. Keep user treasury/snapshot/rate unchanged; owner controls actual test deposit. Enable only after live readiness passes under owner's request to proceed with testing and earlier explicit enable instruction.
