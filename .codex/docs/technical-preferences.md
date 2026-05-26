# Technical Preferences

## Stack

- Engine: Godot 4.6.1.
- Language: GDScript for the game client.
- Backend: Node.js with SQLite in `server/`.
- Rendering: Godot Forward+ unless an existing scene uses a different renderer.
- MCP: Use the Godot MCP server when scene inspection or live editor state matters.

## Naming

- Classes and scene names: PascalCase, for example `BaseTroop`, `Main.tscn`.
- Variables, functions, signals, and files: snake_case.
- Constants: UPPER_SNAKE_CASE.
- Private helper functions: leading underscore, for example `_do_attack()`.
- Server JavaScript: follow existing local style in the touched file.

## Architecture

- Prefer existing project systems over new abstractions.
- Keep gameplay values data-driven where the project already has definitions:
  `building_defs`, `BUILDING_DEFS`, troop definitions, combat definitions, and server config.
- Keep client/server definitions synchronized when behavior exists on both sides.
- Use Godot signals/events for cross-system communication instead of tight UI/gameplay coupling.
- Prototype or test risky scene work in `res://scenes/TestMain.tscn` before moving it to `res://scenes/Main.tscn`.

## Performance

- Target 60 fps and a 16.6 ms frame budget.
- Do not call `get_nodes_in_group()` or broad tree scans every frame; cache or index.
- Avoid per-frame allocations in hot loops.
- Profile before and after meaningful optimizations.

## Forbidden Patterns

- Do not manually edit `.import` files.
- Do not hardcode balance numbers when a project definition already owns the value.
- Do not make client-side gameplay-critical state authoritative when the server owns it.
- Do not mix experimental `TestMain.tscn` helpers into `Main.tscn` without user approval.
