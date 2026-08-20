# LeverUp Broker Activation v1.1.5 Release Checklist

## Scope

- Activate permissioned LeverUp broker `2` for Clash Of Perps on Monad.
- Force-align and verify receiver
  `0xB36402e87a86206D3a114a98B53f31362291fe1B` on-chain.
- Route every fee-bearing V2 open/close/partial/TP-SL action through broker `2`.
- Keep LeverUp `extraFee=0`, so this release adds no trader surcharge.
- Add exact aggregate lifetime/pending broker commissions to admin earnings.
- Correct dynamic batch TP/SL ABI validation.

## Verified provider record

- Broker ID: `2`
- Name: `Clash Of Perps`
- URL: `https://clashofperps.fun/`
- Receiver: `0xB36402e87a86206D3a114a98B53f31362291fe1B`
- Commission points: `5000` (50% share of the existing protocol trade fee)
- Extra fee: `0`

## Pre-release gates

- [x] Official LeverUp V2 broker documentation and on-chain record verified.
- [x] All seven fee-bearing V2 action families behaviorally covered.
- [x] Receiver mismatch and non-zero extra fee fail closed.
- [x] Admin lifetime/pending token formatting and receiver gate pass.
- [x] Focused lint/build and canonical Deploy gate pass on final snapshot.
- [x] QA, release-manager, DevOps and producer gates are GO.

## Production verification

- [ ] Production source/current SHA equals the pushed v1.1.5 commit.
- [ ] Required PM2 services, Nginx and public web/API/MCP health are green.
- [ ] Public LeverUp config returns active broker `2`, exact receiver match and
      `commissionP=5000`.
- [ ] Admin earnings exposes LeverUp lifetime/pending balances without counting
      unknown tokens as USD.
- [ ] LeverUp markets/prices and setup UI remain healthy.
- [ ] Tag `v1.1.5` is pushed only after successful production verification.

## Rollback

This release has no database schema migration, funded transaction or wallet
signature. Roll back to the prior immutable v1.1.4 release if routing, config or
service health checks fail. Shared env values for broker ID/receiver can remain:
v1.1.4 ignores them and routes broker `0`.

## Deferred owner smoke

A small owner-signed LeverUp open and close can prove real fee accrual later.
It is explicitly excluded from unattended deployment verification.
