# Technical Preferences

## Engine & Language

- **Engine**: Godot 4.6.1
- **Language**: GDScript
- **Rendering**: Forward+ (Vulkan)
- **Physics**: Godot Physics 3D

## Naming Conventions

- **Classes**: PascalCase (e.g., `BaseTroop`, `SkeletonGuard`)
- **Variables**: snake_case (e.g., `move_speed`, `attack_range`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `SHIP_COST_WOOD`)
- **Functions**: snake_case with `_` prefix for private (e.g., `_do_attack()`)
- **Signals**: snake_case (e.g., `health_changed`)
- **Files**: snake_case (e.g., `building_system.gd`)
- **Scenes**: PascalCase (e.g., `Main.tscn`)
- **Enums**: PascalCase values (e.g., `State.IDLE`)

## Project Architecture

- **Building System**: Grid-based placement with server sync
- **Attack System**: Ship-based troop deployment (Clash of Clans style)
- **Troop System**: BaseTroop base class with Knight, Mage, Barbarian, Archer, Ranger
- **Defense System**: Turrets, Archer Towers, Tombstone skeleton guards
- **Server**: Node.js + SQLite (server/ folder)
- **MCP**: Godot MCP server available for scene inspection

## Performance Budgets

- **Target Framerate**: 60fps
- **Frame Budget**: 16.6ms

## Forbidden Patterns

- Do not use `get_nodes_in_group()` every frame — use static per-frame caches
- Do not hardcode magic numbers for game balance — use building_defs/troop_defs
- Do not modify .import files manually
