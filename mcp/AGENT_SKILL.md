# Clash of Perps AI Agent Skill

Use this MCP server to manage a player's Clash base through tools instead of raw HTTP calls.

Connection:
- Local test endpoint: `http://127.0.0.1:4100/mcp`
- Hosted endpoint target: `https://clashofperps.fun/mcp`
- Auth header: `Authorization: Bearer <cop_ai_key>`
- The player creates the key in Profile -> AI Agent.

Grid rules:
- `grid_index: 0` is the main island body. Use it for every base building except `port`.
- `grid_index: 1` is the side coast/port grid. Use it only for `port`.
- `grid_index: 2` is the front attack/deployment space. Do not place base buildings there.
- For `grid_index: 0`, prefer returned slots with `grid_z >= 4`; the front edge is reserved for approach/visual spacing.
- Call `find_build_slots` before `place_building`; do not guess occupied cells.

Useful loop:
1. Call `get_base_state` to inspect resources, caps, buildings, ships, production, troop levels, and catalog.
2. Collect available resources with `collect_resources`.
3. Use `find_build_slots` and `place_building` for new buildings.
4. Upgrade buildings with `upgrade_building`; upgrade troops with `upgrade_troop`.
5. For attacks, make sure a port has a ship: `buy_ship`, then `load_ship_troop` until the ship has enough units.
6. Call `get_attack_slots` before attacking. It returns 5 stable ship slots (`0..4`) spread across the attack line so ships do not clump.
7. Use `execute_ai_attack_plan` as one full attack request: choose ship slots, cannon shots, and an optional rally marker. The server validates the replay, settles victory/defeat, stores the replay, and broadcasts `AI AGENT ATTACK` to any open browser.
8. Use `swap_ship_troop`, `unload_ship_troops`, and `reinforce_ships` to keep ship loadouts usable after battles.

Attack plan shape:
```json
{
  "ships": [
    { "ship_index": 0, "slot": 0, "t": 0.2 },
    { "ship_index": 1, "slot": 4, "t": 0.7 }
  ],
  "cannon_shots": [
    { "target_type": "strongest_defense", "t": 4.0 },
    { "target_type": "town_hall", "t": 5.0 }
  ],
  "rally_marker": { "target_type": "town_hall", "t": 6.0, "flight_time": 0.8 }
}
```

Attack target selectors:
- Use `building_id` when you know the exact enemy building.
- Use `target_type: "town_hall"`, `"strongest_defense"`, `"weakest_defense"`, or a building type such as `"turret"` / `"archer_tower"`.
- Cannon energy starts at 10. Cannon shot costs are 1, 2, 3...; rally marker costs are 1, 2, 3... for each marker.

Available tools:
- `get_base_state`
- `get_building_catalog`
- `get_attack_slots`
- `execute_ai_attack_plan`
- `find_build_slots`
- `place_building`
- `upgrade_building`
- `move_building`
- `remove_building`
- `collect_resources`
- `buy_ship`
- `load_ship_troop`
- `swap_ship_troop`
- `unload_ship_troops`
- `reinforce_ships`
- `upgrade_troop`

Conservative policy:
- Prefer economy first: mine, sawmill, storage, town hall requirements.
- Keep one usable attack path: port -> ship -> loaded troops.
- Never spend the last resources blindly; inspect the result after every write tool.
