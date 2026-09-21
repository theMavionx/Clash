# Migration header alignment — 2026-09-21

- Removed centered1200px cap from header only. Desktop brand begins24px from viewport edge; mobile remains16px. Main content width unchanged; wallet button uses matching right gutter.
- Browser regression now asserts actual logo left coordinates at1440/390/320 in addition to existing wallet/MAX/deposit/admin flows. Build/release verification pending.
- No migration settings, keys or transactions changed.
