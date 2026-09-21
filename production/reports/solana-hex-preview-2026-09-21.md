# Explicit Solana hex preview — 2026-09-21

- Owner requested testing32-byte Ethereum-key bytes as a Solana seed. Separate opt-in credential mode, not relaxed normal Solana parser. Warns this does not convert Ethereum accounts, transfer funds or recover MetaMask Solana account.
- Local Ed25519 preview returns public address only, no network/storage writes or serializedsecret64 for preview. On explicit checkbox+save confirmation, rederive, compare with preview and submit canonical64-byte JSON to existing encrypted credential endpoint. Existing liability lock/backend validation retained.
- Key/mode edits invalidate preview and consent; fields cleared on submission. Owner must compare public address and choose whether to save. No actual owner key acquired or treasury chosen during development/deployment.
- Two crypto tests passed: RFC8032 seed/public-key vector, canonical64 validation, prefix/case and malformed formats. Full mocked browser regression passed including zero writes before save, disabled save, reset confirmation, no storage leaks and explicit canonical save to mocked server.
- UX review found no blocker; hardened preview to avoid unnecessary serializedsecret. JS heap/string erasure cannot be guaranteed; no such claim made. Screenshot uses public test vector only.
- Full canonical Deploy gate passed, including crypto tests/lint/build (existing build-size warnings). Release verification pending. No funded transaction or automatic credential update.
