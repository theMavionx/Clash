# Unresolved Phantom message difference

Request 5f9bfc93-916a-44fa-8187-b954399f1477 failed TRANSACTION_CHANGED on release 600193a1, trace 1588cf61-4c17-4a8e-867f-df2618f3df79. Read-only stored quote inspection confirmed both explicit compute-budget instructions, six instructions and 605 wire bytes. There is no deposit hash. The fee-only theory is insufficient for this owner's actual failure.

Add safe error diagnostics: booleans for fee payer, blockhash, account order, header, program IDs, instruction data and account metas, plus expected/received instruction counts. Router independently allowlists fields and types. No raw messages, signatures, wallet addresses or arbitrary exception details are logged by this addition. Strict message equality remains unchanged.

13 focused chain/HTTP tests passed including structured-difference generation and sentinel redaction. Deployment and another owner-signed attempt are required to identify the concrete difference. This is diagnostic instrumentation, not a claimed repair of the outstanding wallet compatibility error.

The console warning comes from wallet-standard-wallet-adapter-react filtering the duplicate legacy Phantom adapter. It is not an exception and does not account for the server's validation error. User browser was inspected read-only; no signing or deposit control was activated.
