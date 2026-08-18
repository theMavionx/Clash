# Robinhood Lighter self-referral release v1.1.2

## Scope

- Detect ownership of `CLASSHOFPERPS` through authenticated RH Lighter
  `/api/v1/referral/get`.
- Treat only that owner as `self_referral_owner`; never call the rejected
  self-referral endpoint for it.
- Preserve existing referrals and require `CLASSHOFPERPS` for ordinary accounts
  without a referral.
- Support SDK same-master integrator approval when the user and integrator
  accounts share the same L1 owner. Cross-owner approvals still require a
  server-verified wallet signature.
- Explain the exemption in the trading setup UI.

## Production evidence

- RH account `3156` owner:
  `0xB36402e87a86206D3a114a98B53f31362291fe1B`.
- Referral code: `CLASSHOFPERPS`.
- Existing production requests authenticated successfully until RH returned
  `cannot use your own referral code`.
- Connected wallets that did not match the account owner were rejected before
  referral or approval actions.

## Verification checklist

- [x] Focused referral behavior tests pass.
- [x] RH profile/isolation, same-master/cross-owner approval, and browser
  source-contract tests pass.
- [x] Lint, production build, Deploy preflight, and clean diff pass.
- [x] Production config reports integrator account `3156`, 1 bps, and
  `CLASSHOFPERPS`.
- [ ] Owner refresh reaches the integrator approval step without attempting
  `/referral/use`.
- [x] No funded order or wallet signature is initiated by deployment.

## Player-facing patch note

Fixed Robinhood Lighter setup for accounts that own the Clash referral code.
The owner now skips the impossible self-referral step and continues directly
to the normal integrator approval; referral requirements for other players are
unchanged.
