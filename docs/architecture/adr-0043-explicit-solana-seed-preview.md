# ADR-0043: Explicit local Solana derivation from 32-byte hex

## Status
Accepted

## Date
2026-09-21

## Context
The owner wants to test an exported32-byte Ethereum key as a Solana key. A secp256k1 private key does not identify the corresponding MetaMask Ed25519 Solana account. Blindly relaxing the existing parser risks silently selecting a different treasury.

### Constraints and requirements
No actual owner secret in source, logs or chat. No automatic production treasury change. Preserve normal Solana64-byte key validation, encrypted storage and unsettled-liability rotation guard. Display the derived public address before save, without implying a match with MetaMask.

## Decision
Provide a separate explicit admin mode. Interpret exactly32hex bytes as an Ed25519 seed using existing Solana web3 Keypair.fromSeed. Preview locally in the browser; retain only public address as preview state. On explicit checkbox+save confirmation, rederive and compare the address, then send the canonical64-byte JSON key to the existing authenticated credential endpoint.

### Architecture and interfaces
Input32hex → local deriveSolanaHexKey → displayed Solana address → owner verification/consent → canonical64-byte secret → existing encrypted Solana credential storage. No new backend parser or address-conversion promise.

## Alternatives considered
### Accept hex automatically in normal Solana input
Convenient but silently changes meaning of Ethereum key; rejected.
### Send key to server for preview
Unnecessary transmission and new sensitive endpoint; rejected in favor of existing local crypto library.

## Consequences
### Positive
Owner can compare public addresses before changing treasury; unchanged server validation/storage.
### Negative and risks
Derived address can differ from MetaMask's Solana address. UI states this explicitly. Same key material reused across chains also couples compromise risk; dedicated migration wallets remain required guidance. Browser strings cannot be guaranteed erased; never persist them and clear state on edits/submission. Canonical secret is transmitted only when the owner explicitly saves.

## Performance implications
One small local derivation per preview/save; no preview network calls. Existing Solana crypto dependency reused. No background computation.

## Migration plan
Add an opt-in mode alongside unchanged existing credential modes. Do not derive/save any operator key automatically during deployment. Existing stored keys remain unchanged.

## Validation criteria
RFC8032 known seed/public-key vector, canonical64-byte backend validation compatibility, malformed input rejection, no network/storage side effects from preview, disabled save until confirmation, reset on edits and secret clearing. Browser regression and release gate.

## Related decisions
- ADR0040 custodial migration credentials
