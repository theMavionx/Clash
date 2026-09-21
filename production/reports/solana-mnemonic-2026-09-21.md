# Solana 12-word treasury import — 2026-09-21

- Added explicit English BIP39 twelve-word mode with checksum validation, account index 0–9999, displayed m/44'/501'/account'/0' path, local address preview, mandatory confirmation and reset on input changes. Extra BIP39 passphrases/alternate paths explicitly unsupported.
- Phrase remains local, not persisted or submitted. Save rederives/checks displayed address, clears input and submits only canonical64-byte Solana key to unchanged encrypted backend. Existing liability safeguards preserved. No real operator key used or treasury changed.
- ADR0044 records boundary/risks and pinned dependency selection. JavaScript memory erasure is not guaranteed; dedicated wallets required guidance.
- Four crypto tests passed (hex and mnemonic), including independent Node crypto reference and actual server parser; focused lint passed. Full mocked desktop/mobile browser suite passed including address preview, invalid checksum, account-change consent reset, no phrase in requests/storage, canonical save and input clearing. Screenshot reviewed: `web/artifacts/migration/admin-solana-mnemonic-preview.png` (public test phrase only).
- Initial browser run timed out while dependencies were installing; restarted local Vite after install and complete rerun passed. Existing npm peer conflict required the project's legacy-peer-deps compatibility mode. No unrelated dependency upgrades.
- Full canonical Deploy gate passed (existing bundle-size warnings). Release pending. No funded transaction test.
