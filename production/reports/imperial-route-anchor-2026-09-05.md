# Bug Report: Imperial venue selector positioning

- ID: BUG-IMPERIAL-ANCHOR; severity S2-Major; priority P2; reported 2026-09-05 by owner.
- Category: UI / Imperial trading; frequency always; regression from a7da6e8f.
- Environment: browser, right-hand trading panel and mobile ticket.
- Reproduction: open Imperial, leave size empty, open route selector; repeat with quote and expand fees.
- Expected: compact selector; popup next to ticket; selectable advertised venues even before size entry.
- Actual: full-width selector, viewport-centred native modal (bottom-aligned on mobile), no candidates without quote.
- Cause: flex:1 trigger; showModal default centring and mobile margin; candidates sourced only from quote.
- Fix: bounded viewport coordinates from ticket rect, responsive reposition on resize/scroll/content changes; compact trigger; merge market-advertised venue names with quoted candidates. Missing fees remain explicitly unquoted, never shown as zero estimates.
- Files: ImperialRouteCard JSX/CSS, imperialPopoverPosition helper, FuturesPanel market metadata, local fixture and focused geometry tests.
- Evidence: owner's two screenshots in conversation. Verification results recorded below after execution.
- Related: imperial-route-popover-2026-09-05.md. No financial operations or backend order changes in this follow-up.

## Verification

- Four geometry tests pass: off-centre desktop, 320px mobile, open-above/height limit, visual-viewport offsets.
- Focused ESLint passes; all 18 Imperial adapter tests pass.
- Browser fixture uses the real component and hook, public Imperial quotes, mocked submission.
- Desktop 1280x720: selector and popup share right edge; popup begins 6px below ticket.
- Mobile 320x700: popup x=12..308, top=304.8; no page horizontal overflow. Settings bottom=688, internal scrollHeight=565 > visible383.2.
- With empty size, Phoenix and Jupiter remain selectable; Jupiter -> Auto works. Unquoted fees show a prompt, not fabricated zeros.
- Live SOL quote displays Phoenix24.8x/Jupiter250x and fee breakdown. Simulated Jupiter long sends underwriter0 and CLASH; browser error log empty. No funded order placed.
- Full `check-repo.cmd -Mode Deploy` passed (existing lint/bundle warnings only); production web build passed.
