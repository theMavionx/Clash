# Clash — Game Studio Agent Architecture

Clash of Clans style game built with Godot 4.6.1, managed through coordinated Claude Code subagents.

## Technology Stack

- **Engine**: Godot 4.6.1
- **Language**: GDScript
- **Backend**: Node.js + SQLite
- **Version Control**: Git
- **MCP**: Godot MCP server for live scene inspection

## Project Structure

@.claude/docs/directory-structure.md

## Technical Preferences

@.claude/docs/technical-preferences.md

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**

- Agents follow user instructions directly
- Multi-file changes should be explained before applying
- No commits without user instruction
- Use Godot MCP tools when available for scene inspection

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

@.claude/docs/context-management.md

## Engine Version Reference

@docs/engine-reference/godot/VERSION.md

## Game Systems

### Buildings
Defined in `scripts/building_system.gd` → `building_defs` dictionary.
Server definitions in `server/db.js` → `BUILDING_DEFS`.
Types: Town Hall, Mine, Barn, Port, Sawmill, Barracks, Turret, Storage, Archer Tower, Tombstone.

### Troops
Base class: `scripts/base_troop.gd`. Individual: knight, mage, barbarian, archer, ranger.
Deployed from ships via `scripts/attack_system.gd`.
Dual targeting: closest building OR skeleton guard.

### Defense
- **Turrets**: Auto-fire at troops
- **Archer Towers**: Ranged defense
- **Tombstone**: Spawns skeleton guards that chase and attack troops

### Server Sync
Buildings and troop levels sync with Node.js backend.
Resources: gold, wood, ore. Production buildings generate resources over time.
