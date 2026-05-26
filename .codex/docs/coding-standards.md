# Coding Standards

## General

- Match the style of the file being edited.
- Keep public APIs documented when they are meant for reuse.
- Prefer dependency injection, signals, or explicit references over hidden global state.
- Keep gameplay logic testable outside presentation where practical.
- Add focused verification for behavior changes; use screenshots for UI/scene visual changes.

## Godot/GDScript

- Use static typing where it improves clarity and follows existing files.
- Use `delta` for all time-dependent movement, timers, and animation logic.
- Keep scene node paths resilient; prefer exported `NodePath` or assigned references for reusable scenes.
- Do not manually modify generated `.import` files.
- Check Godot 4.6.1 reference docs in `docs/engine-reference/godot/` before using uncertain APIs.

## Backend

- Keep gameplay-critical validation server-side.
- Validate request payloads, identifiers, numeric ranges, and wallet/agent inputs.
- Keep SQLite migrations idempotent.
- Avoid duplicating game definitions without updating the matching client/server source.

## Design Docs

Game design documents in `design/gdd/` should include:

1. Overview
2. Player Fantasy
3. Detailed Rules
4. Formulas
5. Edge Cases
6. Dependencies
7. Tuning Knobs
8. Acceptance Criteria

Write large docs incrementally and persist approved sections to disk.
