---
paths:
  - "scripts/**"
  - "server/combat_defs.js"
---

# Gameplay Code Rules

- Keep gameplay values data-driven through existing definitions such as `building_defs`, `BUILDING_DEFS`, troop definitions, and combat definitions.
- Use `delta` for time-dependent GDScript logic.
- Keep UI and gameplay separated; communicate through signals/events or explicit commands.
- Keep client and server definitions synchronized when both sides know the same entity, cost, stat, or rule.
- State machines need clear states and explicit transitions.
- Add regression coverage or a focused manual verification note for gameplay changes.
- Do not make `Main.tscn` the first home for risky experimental features; use `TestMain.tscn`.
