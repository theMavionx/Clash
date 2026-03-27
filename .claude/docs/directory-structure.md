# Directory Structure

```text
/
├── CLAUDE.md                    # Master configuration
├── .claude/                     # Agent definitions, skills, hooks, rules, docs
│   ├── agents/                  # Agent definitions (Godot-focused)
│   ├── skills/                  # Slash commands
│   ├── hooks/                   # Automated validation
│   ├── rules/                   # Path-scoped coding standards
│   └── docs/                    # Internal docs for agents
├── scripts/                     # GDScript game scripts
│   ├── building_system.gd       # Grid-based building placement & management
│   ├── attack_system.gd         # Ship spawning & troop deployment
│   ├── base_troop.gd            # Base class for all troops
│   ├── knight.gd / mage.gd...  # Individual troop scripts
│   └── skeleton_guard.gd        # Defensive skeleton unit (Tombstone)
├── scenes/                      # Godot scene files (.tscn)
├── Model/                       # 3D models (GLB/GLTF)
│   ├── Characters/              # Troop & skeleton models + animations
│   ├── Ship/                    # Ship model
│   ├── Mine/, Barn/, Port/...   # Building models (per level)
│   ├── Storage/                 # Storage building models
│   ├── Archer_towers/           # Archer tower models
│   └── Tombstone/               # Tombstone models
├── server/                      # Node.js backend
│   ├── db.js                    # SQLite database & game logic
│   ├── routes.js                # REST API routes
│   └── websocket.js             # WebSocket handlers
├── design/                      # Game design documents
└── production/                  # Sprint plans, milestones
```
