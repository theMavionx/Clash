# Encrypted trading credential vault release — 2026-08-31

## Scope and approval

Owner requested encrypted server persistence and login synchronization of exchange
API/delegate credentials, then explicitly resumed implementation, verification and
production deployment after freeing disk space. Isolated branch:
`codex/server-trading-credential-vault`, base `071547188c3e85ea4942753f23b80e183fccca0c`.
Unrelated holder-rebate changes and Hibachi tournament audit/adjustments are excluded.

## Delivered contract

- Versioned allowlist shared by frontend and backend; AES-256-GCM player-bound
  encrypted records and a separate owner-only production keyring/backup.
- Fresh wallet proof + independent HttpOnly capability for restore and writes.
  Ordinary game/bot bearer tokens cannot retrieve keys on their own.
- Login-time restore, player-isolated encrypted local caches, proof-bound or explicit
  legacy import, durable pending writes, replay receipts, revision conflicts and
  deletion tombstones. Account changes invalidate asynchronous credential work.
- API/delegate adapters and bot setup/export use the same scoped storage. Primary
  wallet/seed material and wallet-only bot credentials are excluded. Existing
  Decibel server-managed signing is unchanged; no new bot trading permission.
- Dedicated deployment validation authenticates existing encrypted records and
  refuses key replacement when records or retry receipts need an existing key.
  Backup must be a separate owner-only regular file, not a symlink or hardlink.
- See ADR-0034 for custody, migration, limitations and key rotation requirements.

## Local verification

- Focused vault/migration/security suite: 195 tests, 190 pass, zero failures,
  5 Windows-specific skips (file symlink privilege; POSIX permissions/ownership).
- Existing eToro/Aster/LeverUp regressions pass, including Real-only eToro, encrypted
  persistence, unverified pending writes and A/B account isolation.
- Canonical `check-repo.ps1 -Mode Deploy` passes: game/server/exchange regressions,
  syntax/PowerShell parsing, Godot probes, full ESLint and Vite production build.
- ESLint: zero errors, 133 warnings. Existing bundle-size warnings remain.
- Bash deployment syntax and `git diff --check` pass.
- Actual local browser flow, real React boundary/storage and HTTP vault with an
  in-memory SQLite DB and unfunded synthetic wallets: A verified, saved a dummy
  Hibachi key, recovered it after cache drop/reload; B did not inherit A's key,
  verified and saved its own key; switching back restored only A's local key and
  required fresh proof for cloud access. Capability was not JavaScript-readable.
- Browser connection disappeared during final deletion check; deletion, legacy
  import and race cases pass automated tests. Responsive visual review and real
  extension-wallet confirmation remain unverified. No exchange/funded trades.

## Production gate

Atomic deploy uses the existing scripts and pinned SSH host key through the supplied
proxy pool. `deploy-clash` skill is unavailable. Before switching production, the
release executes the three backend suites on Linux, then validates/creates and
backs up the dedicated production keyring. Database migrations are additive.

Status at report creation: candidate verified locally; production deployment pending.

## Operational limitations

Server storage can decrypt API/delegate keys; it is not zero-knowledge custody or
XSS protection. Maintain an off-host protected key backup as well as the generated
same-host backup. Never replace a missing keyring or remove keys referenced by
records/receipts. Receipt-only keys can be checked for presence but cannot be
cryptographically authenticated without the original request payload.

Restoration on a new browser requires the account-wallet proof. Ambiguous old
browser-global keys require explicit import. Unsupported Aptos key schemes and
direct Farcaster-only signing require a supported wallet connection. Deleting a
saved credential does not revoke it on the exchange or on an offline device.
