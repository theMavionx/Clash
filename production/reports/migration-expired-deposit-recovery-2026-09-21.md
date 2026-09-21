# Expired deposit recovery

Owner asks to fix the reconciliation dead end shown in the screenshot. ADR0055 records the expiry model and paid-RPC history assumption. Original failed attempt is retained; no new signature or payment is made for the user.

## Implementation

Exact signed-identity adapter checks finalized expiry+32block margin, invalid original blockhash, fresh contexts and historical signature absence bracketing null receipt. Core repeats after30seconds with advancing finalized slot/height; ambiguity/RPC error resets candidate, late confirmation wins. Only deposit-only review with no sold lots/outgoing markers becomes deposit_failed / DEPOSIT_EXPIRED_UNLANDED. Existing accounting restores its unused allocation without deleting raw/hash/send history.

UI explains checking, then offers Create new quote only after verified terminal recovery. It prefills editable exact amount/recipient, never signs/submits. Normal pause/deadline/eligibility/inventory/fee and fresh approval requirements apply.

## Verification

-119 server migration tests passed, including24 adapter rejection mutations and5RPC-stage failures.
-12 frontend model tests passed; desktop1440/mobile390 mocked browser flow passed. No automatic quote/sign/submit from recovery button; review/pause/closed/existingquote guarded.
-Independent second agent review and10 focused tests passed; late-confirmation probe cleanup applied.
-Canonical Deploy gate passed (pre-existing warnings). Production recovery verification pending.

## Limits

Historical RPC completeness remains trusted, not cryptographic absence proof. Unknown/malformed/stale results retain review. Original broadcast failure is not diagnosed by successful current simulation. A real new owner-signed deposit remains a separate user action after recovery; no funded test is fabricated.
