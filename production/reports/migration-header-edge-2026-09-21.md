# Migration header alignment — 2026-09-21

- Removed centered1200px cap from header only. Desktop brand begins24px from viewport edge; mobile remains16px. Main content width unchanged; wallet button uses matching right gutter.
- Browser regression passed with actual logo left coordinates at1440/390/320 in addition to existing wallet/MAX/deposit/admin flows. Production build and visual review passed.
- Released `9b23cdda` as `20260921093833-9b23cdda`; canonical health passed09:41:18UTC. Live browser measured24px logo left at762px viewport and no horizontal overflow.
- Standard retention removed old connector build `20260921091852-d051ab43`, reproducible from source; prior MAX release retained. User data untouched.
- No migration settings, keys or transactions changed.
