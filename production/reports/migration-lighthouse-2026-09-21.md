# Migration assertion compatibility

Production trace 1e8eb6f6-96c4-41aa-9060-7b48f36f8377: request bd5dc3ac-7157-4472-b0e0-3c3a457373db, 6 expected instructions and 12 received, unchanged fee payer/blockhash. Phantom documents Lighthouse augmentation. Exact historical additional programs were not captured; this implementation supports a verified bounded case, not an assertion that the historical payload was reconstructed.

Implemented ADR-0047 policy, immutable deployed-program byte pin, complete signature checks and unchanged full simulation. Finalized receipt matches persisted accepted signed message, including all guards, instead of original unsigned quote. Old byte-identical flows remain valid. Added safe Lighthouse count to existing structural diagnostics for unsupported modifications.

37 migration tests pass, including generated local owner/treasury signatures, guarded settlement receipt, changed original-message rejection, unsigned/forged signature rejection, wrong fees/programs/privileges/accounts, blocked memory/CPI variants and immutable deployment failure. Local dependency hook replaces chain reads only in tests; HTTP cannot supply it.

Read-only paid Alchemy verification: pinned program executable is non-upgradeable, ProgramData CJ5WEjifs4d77pEA9DpewppByFjHcAkNv3YYSuSoDk7c and executable SHA-256 match. Six constructed executable=false assertions appended to the actual stored quote pass policy and live unsigned simulation: err=null, 34384 CU. This was not the user's original signed payload and did not sign/broadcast/spend.

Canonical Deploy gate passed. Released through export-upload-deploy.ps1 as 20260921123029-7d43430d. Live deployed-module check confirms immutable executable pin succeeds, enabled=true and ready=true. Actual Phantom submission and end-to-end payout remain owner-test requirements.

Canonical retention removed compiled release 20260921120059-600193a1; the previous release is retained for rollback and older code is rebuildable from Git. No shared ledger, keys or user data were removed.
