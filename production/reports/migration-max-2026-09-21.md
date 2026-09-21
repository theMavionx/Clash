# Migration MAX — 2026-09-21

- MAX fills exact min(current balance, remaining snapshot allocation), using integer base units without Number rounding. Missing/invalid/zero data disables it; authenticated/available/not-busy requirements match the input.
- Type=button, explicit accessible label, separate input label,44px target, mobile full-width amount above token/MAX row. No submission or signing triggered.
- Six model tests passed including tiny units,18-decimal precision and invalid data. Expanded full mocked browser flow passed at1440/390/320: balance-bound and allocation-bound maximum, disconnected disabled, no quote/sign/submit from MAX. Existing wallet/admin/reconciliation flows retained.
- Production build/release verification pending. No funded transaction.
