# ADR-0026: Bounded Wallet Compute Budget Adjustments for Sanctum

## Status

Accepted

## Date

2026-08-18

## Context

### Problem Statement

The first owner-signed clashSOL swap was rejected before broadcast because the
wallet recalculated standard Solana Compute Budget instructions while signing.
The reviewed Sanctum route, signers, account roles, address lookup tables, and
swap instructions were unchanged, but byte-for-byte message validation treated
the safe priority-fee update as arbitrary transaction tampering.

### Constraints

- A wallet must never be allowed to change the Sanctum route, recipients,
  amounts, signers, account roles, lookup tables, or non-Compute instructions.
- Phantom and other Solana wallets may legitimately refresh the recent
  blockhash and Compute Budget limit/price while signing.
- The server must bound the maximum possible priority fee independently of the
  wallet UI.
- Unknown Compute Budget opcodes, duplicates, or malformed instructions must
  fail closed before anything is submitted.

### Requirements

- Preserve self-custodial signing and the reviewed Sanctum order.
- Accept at most one `SetComputeUnitLimit` and one `SetComputeUnitPrice`.
- Cap the compute-unit limit at 1,400,000 and the calculated priority fee at
  0.005 SOL.
- Keep every non-Compute message semantic exactly equal to the reviewed order.
- Prove safe and unsafe wallet rewrites with real versioned-transaction tests,
  including address lookup tables.

## Decision

When exact message-hash validation fails for a versioned Sanctum transaction,
the server performs a second, narrowly scoped semantic comparison:

1. signer keys must be identical and ordered identically;
2. every non-Compute static account and its signer/writable role must match;
3. every address lookup table and writable/readonly index list must match;
4. every non-Compute instruction program, ordered account references, and data
   bytes must match;
5. Compute Budget instructions may contain only one unit-limit opcode and one
   unit-price opcode;
6. the limit must be between 1 and 1,400,000 compute units;
7. `ceil(microLamportsPerCU * limit / 1,000,000)` must not exceed 5,000,000
   lamports (0.005 SOL).

The recent blockhash may differ. Any other difference returns a 400 response
before the transaction reaches Sanctum's execute endpoint.

### Architecture Diagram

```text
Reviewed Sanctum v0 message          Wallet-signed v0 message
              |                                  |
              +------ semantic comparator -------+
                               |
            signers/accounts/LUTs/swap ix exact?
                      | yes              | no -> reject
                      v
            Compute Budget opcodes bounded?
                      | yes              | no -> reject
                      v
      verify connected-wallet signature;
      require primary transaction signature
                      |
                      v
             Sanctum execute endpoint
```

### Key Interfaces

- `verifyReviewedSignedTransaction(...)` retains the exact-hash fast path and
  invokes semantic validation only after a `TRANSACTION_CHANGED` result.
- `verifySafeVersionedWalletAdjustments(...)` compares the immutable message
  semantics.
- `validateWalletPriorityFeeInstructions(...)` enforces opcode, count, unit,
  and total-fee limits.

## Alternatives Considered

### Alternative 1: Keep Byte-Identical Transactions Only

- **Description**: Reject every wallet-modified message.
- **Pros**: Simplest invariant.
- **Cons**: Legitimate wallet priority-fee estimation makes swaps unusable.
- **Rejection Reason**: It reproduced the owner-facing 400 without improving
  protection of the actual route or funds.

### Alternative 2: Accept Any Compute Budget Instructions

- **Description**: Ignore all instructions owned by the Compute Budget program.
- **Pros**: Maximum wallet compatibility.
- **Cons**: Allows unsupported opcodes, duplicate settings, and unbounded fees.
- **Rejection Reason**: It delegates a material spending bound to the wallet.

### Alternative 3: Strip Wallet Changes and Re-sign

- **Description**: Rebuild the reviewed transaction server-side.
- **Pros**: Server controls the exact message.
- **Cons**: The server cannot and must not possess the player's signing key.
- **Rejection Reason**: Violates self-custody.

## Consequences

### Positive

- Standard wallet fee estimation no longer breaks an otherwise unchanged swap.
- Route and account integrity remain server-enforced.
- A hard 0.005 SOL fee ceiling prevents extreme wallet priority fees.

### Negative

- Semantic validation is more complex than comparing one hash.
- Future legitimate Compute Budget opcodes require an explicit reviewed change.

### Risks

- **Semantic comparison omission**: mitigated by comparing ordered instruction
  account references and data plus all static roles and lookup indexes.
- **Fee arithmetic error**: mitigated with integer `BigInt` arithmetic and
  ceiling division.
- **Wallet incompatibility**: unknown or duplicate Compute Budget instructions
  deliberately fail closed with a specific player-facing error.

## Performance Implications

- **CPU**: one small in-memory semantic comparison only when the exact hash
  differs; negligible relative to the upstream request.
- **Memory**: temporary normalized message objects for one transaction.
- **Load Time**: no client-load impact.
- **Network**: no additional request.

## Migration Plan

No database migration is required. Deploy the verifier and UI error mapping,
then request a fresh quote for any attempt previously rejected with
`TRANSACTION_CHANGED`.

## Validation Criteria

- A realistic v0 transaction with two existing Compute Budget instructions and
  one address lookup table accepts a safe wallet repricing.
- The same route with a calculated fee above 0.005 SOL is rejected before
  upstream execution.
- Any signer, account role, lookup, program, instruction-account order, or
  non-Compute data mutation is rejected.
- The focused Sanctum suite, canonical Deploy gate, production build, and
  player-facing Battle Shop flow pass.

## Related Decisions

- [ADR-0019: clashSOL Sanctum Shop Integration](./adr-0019-clashsol-sanctum-shop-integration.md)
- [ADR-0025: clashSOL Daily Holder Rewards](./adr-0025-clashsol-daily-holder-rewards.md)
