# Clash of Perps AI Agent Skill

Use this MCP server to manage a player's Clash base through tools instead of raw HTTP calls.

Connection:
- Local test endpoint: `http://127.0.0.1:4100/mcp`
- Hosted endpoint target: `https://mcp.clashofperps.fun/mcp`
- Skill document: `https://mcp.clashofperps.fun/skills.md`
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
7. Use `execute_ai_attack_plan` as one full attack request. The MCP server allows one AI battle per player per minute. By default `auto_tactics: true` lets the MCP server inspect the matched enemy and choose landing slots plus cannon targets. The server validates the replay, settles victory/defeat, stores the replay, and broadcasts a live `AI ONLINE BATTLE` to any open browser.
8. Use `swap_ship_troop`, `unload_ship_troops`, and `reinforce_ships` to keep ship loadouts usable after battles.

Attack best practices:
- Prefer a focused landing, not a full-line spread. For 1-3 ships, use neighboring slots on the side closest to valuable or exposed buildings. For 4-5 ships, widen the group but still keep it as one attack front.
- Exception: if the enemy side is heavily covered by defenses, split pressure across flanks (`0` and `4` for two ships, `0/2/4` for three). Do not concentrate all troops under one defense cone just to keep ships adjacent.
- Let `auto_tactics: true` do this unless the user asks for a manual plan. It scores the enemy base instead of blindly using the same slot pattern every time.
- Cannon shots are support fire, not Town Hall damage. Use them on `turret` and `archer_tower` targets that threaten the landing side. The auto-planner reserves enough energy for one rally marker when it chooses to use marker.
- Rally marker is a focus command, not damage. Put it after ships are landing, usually around `t: 5.0`, on a nearby non-Town-Hall objective: tombstone first, then a blocking economy/storage building. Avoid using marker to drag troops directly into a turret unless there is no safer useful target.
- If a base has no defenses and no meaningful front target, omit cannon shots and marker instead of forcing invalid targets.

Attack plan shape:
```json
{
  "auto_tactics": true,
  "ships": [
    { "ship_index": 0, "slot": 1, "t": 0.2 },
    { "ship_index": 1, "slot": 2, "t": 0.55 }
  ],
  "cannon_shots": [
    { "target_type": "strongest_defense", "t": 4.0 },
    { "target_type": "weakest_defense", "t": 5.1 }
  ],
  "rally_marker": { "target_type": "tombstone", "t": 5.0, "flight_time": 0.8 }
}
```

Minimal smart attack request:
```json
{}
```

Calling `execute_ai_attack_plan` with no manual plan uses the server auto-tactics. It chooses landing slots, defense cannon shots, and a single rally marker when a useful nearby non-defense focus exists. Use `auto_tactics: false` only when you need exact manual replay coordinates.

Attack target selectors:
- Use `building_id` when you know the exact enemy building.
- For `cannon_shots`, target defensive towers only: `target_type: "strongest_defense"`, `"weakest_defense"`, `"turret"`, or `"archer_tower"`. Do not shoot the Town Hall with the cannon.
- If the enemy has no turret or archer tower, omit `cannon_shots` instead of targeting economy buildings or Town Hall.
- Cannon energy starts at 10. Cannon shot costs are 1, 2, 3...; rally marker costs are 1, 2, 3... for each marker.
- Cannon shots must be at least 1.0s apart. Cannon damage lands when the cannonball impacts, not at launch time.
- Rally marker damage/focus lands on impact too. Keep `flight_time` realistic (`0.6-1.2s`) so server and Godot replay stay aligned.

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
