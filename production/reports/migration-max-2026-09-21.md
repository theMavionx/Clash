# Migration MAX — 2026-09-21

- MAX fills exact min(current balance, remaining snapshot allocation), using integer base units without Number rounding. Missing/invalid/zero data disables it; authenticated/available/not-busy requirements match the input.
- Type=button, explicit accessible label, separate input label,44px target, mobile full-width amount above token/MAX row. No submission or signing triggered.
- Six model tests passed including tiny units,18-decimal precision and invalid data. Expanded full mocked browser flow passed at1440/390/320: balance-bound and allocation-bound maximum, disconnected disabled, no quote/sign/submit from MAX. Existing wallet/admin/reconciliation flows retained.
- Production build passed; UX/art review at1440/320 passed. Released `8e440adc` as `20260921093253-8e440adc`; canonical service/runtime health passed09:35:29UTC. Actual production browser shows MAX correctly disabled without wallet, no console errors. No funded transaction.
- Standard retention pruned old logo build `20260921085938-ed382d97`, reproducible from source; preceding connector build retained. No ledger data removed.
