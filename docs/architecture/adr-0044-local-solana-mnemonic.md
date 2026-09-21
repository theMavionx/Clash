# ADR-0044: Local 12-word Solana treasury derivation

## Status
Accepted

## Date
2026-09-21

## Context
### Problem and requirements
Owner requests importing a 12-word recovery phrase and seeing the address before adding the treasury. Existing backend accepts encrypted canonical Solana keys, not mnemonics. Preserve that boundary and all rotation guards.

## Decision
An explicit admin mode validates English BIP39 word count/checksum with pinned @scure/bip39, then uses pinned micro-key-producer SLIP10 Ed25519 derivation at m/44'/501'/account'/0'. Account index is explicit (0–9999), default 0. Additional BIP39 passphrases and alternate paths are not supported and the UI states this.

### Architecture and interfaces
Password input → local validation/derivation → public-address preview → explicit address confirmation → rederive/compare → existing encrypted canonical64-byte key endpoint. Phrase never enters a request, browser storage, or logging. Changes invalidate consent. Successful submission clears input state. After save existing admin status displays the stored address.

## Alternatives considered
### Backend mnemonic import
Simpler UI, but unnecessarily exposes a multi-account recovery secret; rejected.
### Automatic first-account save
Convenient but risks selecting an unintended treasury; rejected. Require public-address comparison.

## Consequences
### Positive
Owner can compare addresses; no backend schema or credential compatibility change.
### Negative and risks
Only one explicit derivation family is supported. Browser compromise can expose the phrase; require dedicated migration wallets and warn against main-wallet phrases. JavaScript strings and intermediate library allocations cannot be reliably erased; clear UI state and byte buffers without promising complete erasure. Never use real phrases in automated tests.

## Performance implications
CPU: one local PBKDF2/SLIP10 operation per preview/save. Memory: temporary seed/derived keys. Load: tree-shaken dependencies plus English wordlist. Network: no preview calls, unchanged save payload.

## Migration plan
Add opt-in mode; existing private-key modes and backend unchanged. Never configure production treasury automatically.

## Validation criteria
Independent Node crypto BIP39/SLIP10 reference, actual server key parser, invalid checksum/count/account cases, browser preview/address/consent reset, no phrase in requests/storage, canonical key save and input clearing.

## Related decisions
- ADR0043 explicit hex preview
- Library documentation: https://github.com/paulmillr/micro-key-producer
