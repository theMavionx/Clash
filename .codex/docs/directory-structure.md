# Directory Structure

```text
/
|-- AGENTS.md                    # Codex master instructions
|-- CLAUDE.md                    # Claude master instructions, preserved
|-- .codex/                      # Codex agents, MCP config, docs, rules
|   |-- agents/                  # Codex subagent definitions in TOML
|   |-- docs/                    # Codex-facing project instructions
|   `-- rules/                   # Path-scoped Codex rules
|-- .claude/                     # Claude agents, skills, hooks, rules, docs
|-- docs/                        # Shared project documentation
|-- design/                      # Game design documents
|-- production/                  # Sprint, milestone, and session state
|-- scenes/                      # Godot scene files
|-- scripts/                     # GDScript gameplay/client systems
|-- shaders/                     # Godot shader files
|-- Model/                       # 3D models and animations
|-- assets/                      # Game and web assets
|-- textures/                    # Texture assets
|-- server/                      # Node.js + SQLite backend
|-- hermes-orchestrator/         # Hermes AI chat/runtime integration
|-- mcp/                         # Hosted game MCP resources and skills
|-- web/                         # Web client/build assets
`-- nft/                         # NFT, bridge, and chain integration work
```

## High-Signal Gameplay Files

- `scripts/building_system.gd`: grid placement, building definitions, client building state.
- `scripts/attack_system.gd`: ship-based troop deployment and attack flow.
- `scripts/base_troop.gd`: shared troop behavior.
- `scripts/bs_battle.gd`: battle simulation and replay flow.
- `scripts/bs_production.gd`: production/resource collection UI logic.
- `server/db.js`: SQLite schema, building definitions, resource and player logic.
- `server/routes.js`: REST endpoints, auth, trading, AI agent, and gameplay APIs.
- `server/combat_defs.js`: server-side combat and troop definitions.

## Codex And Claude Coexistence

- Do not delete or rewrite `.claude/` or `CLAUDE.md` unless the user explicitly asks.
- Codex-specific instructions live in `AGENTS.md` and `.codex/`.
- Shared game documentation belongs in `docs/`, `design/`, or `production/`, not inside one assistant's private folder.
