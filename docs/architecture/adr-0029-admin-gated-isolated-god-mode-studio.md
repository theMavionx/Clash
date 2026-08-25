# ADR-0029: Admin-Gated Isolated God Mode Studio

## Status

Accepted

## Date

2026-08-25

## Context

### Problem Statement

Clash needs a production-hosted creator mode at `/godmodegg` for building video
setups and testing battles. An administrator must grant access per player. The
authorized player must be able to place buildings without progression or count
limits, assemble mixed armies without ship-capacity limits, and attack the same
sandbox base without changing the live account.

The existing `TestMain` scene proves these mechanics locally, but it contains a
large diagnostic harness and is intentionally excluded from production exports.
Adding bypass flags to the normal village and PvP APIs would put live economy,
ranking, reward, and tournament state at risk.

### Constraints

- Access is granted and revoked through the existing authenticated admin panel.
- The route must fail closed before downloading or starting the Godot sandbox.
- Normal village, resource, trophy, task, tournament, reward, matchmaking, and
  replay records must remain unchanged.
- The production export must not include the diagnostic `TestMain` harness.
- God Mode can remove gameplay limits, but collision and island bounds remain
  necessary spatial rules.
- The same Godot visuals, buildings, units, camera, and combat presentation must
  be used so recorded footage represents the shipped game.

### Requirements

- Persist one auditable enabled/disabled grant per player.
- Revalidate access at startup, on focus, and periodically while the route is
  open.
- Run base editing, army configuration, damage, and self-attack entirely in an
  isolated client scene with no normal mutation API calls.
- Support arbitrary non-negative mixed-unit quantities without enforcing the
  production ship-capacity table.
- Provide a polished, collapsible studio deck and a reversible clean-frame mode.
- Keep the normal `/` game flow and production gameplay rules unchanged.

## Decision

Implement God Mode as a separately routed, server-gated, client-local production
sandbox:

1. A `god_mode_access` table stores only access grants and their audit metadata.
2. Admin-authenticated endpoints grant, revoke, and list access. A
   player-authenticated read endpoint reports the current player's grant with
   `Cache-Control: no-store`.
3. `/godmodegg` mounts a minimal React gate. It restores the existing game token,
   checks access before mounting `GodotCanvas`, and revalidates the grant while
   open.
4. Godot boots through a small scene router. Only an already-authorized web page
   sets the in-page God Mode flag; the router otherwise loads the normal main
   scene.
5. The dedicated `GodMode.tscn` inherits the production `Main.tscn`, enables
   `BuildingSystem.test_mode`, and attaches a compact production controller.
6. The controller owns only sandbox state: local buildings, army loadout,
   defender snapshots, self-attacks, camera presets, time scale, and studio UI.
   It never calls live village, attack-result, reward, or progression mutations.

### Architecture Diagram

```text
Admin UI --x-admin-key--> Admin access API --> god_mode_access
                                                    |
Player /godmodegg --x-token--> GET /god-mode/access-+
        |
        +-- denied/revoked --> no Godot runtime
        |
        +-- allowed --> React Studio shell
                         |
                         +--> scene router --> GodMode.tscn
                                              |
                                              +--> Main visuals/combat
                                              +--> BuildingSystem test_mode
                                              +--> local Studio controller
                                                   (no live mutations)
```

### Key Interfaces

- `GET /api/god-mode/access`
  - Requires player authentication.
  - Returns `{ allowed, access, isolation }`.
  - Uses `Cache-Control: no-store`.
- `GET /api/admin/god-mode/access`
  - Requires admin authentication.
  - Lists access records for audit and UI state.
- `POST /api/admin/god-mode/access`
  - Requires admin authentication.
  - Accepts a player identifier, `enabled`, and optional `note`.
- `POST /api/admin/players/:id/god-mode-access`
  - Requires admin authentication.
  - Row/drawer grant or revoke action.
- React-to-Godot `god_mode_command` with `command: set_clean_frame`
  - Toggles the reversible Studio overlay without changing gameplay state.

## Alternatives Considered

### Alternative 1: Bypass Limits in Normal Village and Battle APIs

- **Description**: Add a God Mode flag to existing placement, army, matchmaking,
  settlement, resource, and reward routes.
- **Pros**: Reuses normal persistence and UI paths.
- **Cons**: Spreads privileged branches through central server-authoritative
  systems and makes accidental economy, ranking, or reward writes likely.
- **Rejection Reason**: It violates the required isolation boundary and would be
  substantially harder to audit and test.

### Alternative 2: Export the Existing TestMain Harness

- **Description**: Include `TestMain.tscn` and `test_scene_harness.gd` in the Web
  export and select it for `/godmodegg`.
- **Pros**: Most sandbox controls already exist.
- **Cons**: The harness contains thousands of lines of capture, profiling,
  automated quit, and developer-only diagnostics; it is deliberately excluded
  from production and is not a video-ready user interface.
- **Rejection Reason**: Shipping diagnostic controls increases production risk,
  export size, and UI complexity. Only the proven sandbox behavior is extracted.

### Alternative 3: Ungated Browser-Only Hidden Route

- **Description**: Treat the obscure URL as the access mechanism and enable
  sandbox mode entirely from a query/path flag.
- **Pros**: Minimal server work.
- **Cons**: Anyone who learns the route can open it; revocation and admin audit
  are impossible.
- **Rejection Reason**: It does not satisfy admin-issued access or fail-closed
  behavior.

## Consequences

### Positive

- Live player state is protected by construction because sandbox edits never
  enter normal mutation routes.
- The Studio reuses production models, combat, camera, and building behavior.
- Grants are explicit, revocable, and auditable in one table.
- Normal gameplay code keeps its existing authoritative limits.
- The production controller stays small and purpose-built instead of inheriting
  the diagnostic test harness.

### Negative

- Sandbox layouts and armies are not durable server state by design.
- The Godot export gains one scene, controller, and startup routing step.
- Extremely large armies can reduce browser FPS or consume substantial memory.
- Studio controls need their own focused regression coverage.

### Risks

- **Client flag spoofing**: a user may force the local scene flag.
  Mitigation: the scene is local-only and has no reward or mutation authority;
  the official route still gates and revalidates access before launch.
- **Future code adds a server write**: a shared helper could accidentally call a
  live mutation route. Mitigation: validation asserts `test_mode`, a null
  BuildingSystem network client, and absence of God Mode mutation endpoints.
- **Large army performance**: high quantities can overwhelm the browser.
  Mitigation: warn without changing the requested quantity, preload unit assets,
  and keep hold-to-deploy cadence predictable.
- **Grant revoked while open**: an already-running session could continue
  locally. Mitigation: revalidate on focus and a bounded interval, then unmount
  the runtime and block new Studio commands.

## Performance Implications

- **CPU**: Normal game startup adds only a small scene-route decision. God Mode
  combat cost scales with the number of deployed units.
- **Memory**: Normal play is unchanged. God Mode army staging and active models
  scale with the selected quantities.
- **Load Time**: The access check occurs before the Godot download. Authorized
  sessions load the same runtime package plus a small controller scene.
- **Network**: One access read at startup, on focus, and periodically. Sandbox
  building and battle activity generates no live gameplay mutations.

## Migration Plan

1. Add the access table and database access helpers as an idempotent migration.
2. Add player/admin access endpoints and expose grant state in the existing
   admin player payload.
3. Add grant/revoke controls to Player Tools.
4. Add the route gate and revalidation behavior.
5. Add the scene router, dedicated God Mode scene/controller, and explicit Web
   export inclusion.
6. Verify DB grant/revoke, HTTP gate behavior, normal-main routing, sandbox
   placement, over-capacity mixed army construction, self-attack, clean-frame,
   Web export, and local browser/admin flows.
7. Deploy atomically and verify the denied route before granting any production
   account.

## Validation Criteria

- An unauthenticated or ungranted user cannot start the `/godmodegg` runtime.
- Admin grant and revoke are immediately visible in the player tools and access
  endpoint.
- God Mode accepts a mixed army whose selected slot total exceeds the maximum
  production ship capacity and starts a self-attack.
- Multiple copies of the same building can be placed without economy, Town Hall,
  unlock, or per-type count rejection until spatially blocked.
- Exiting or refreshing the Studio leaves the player's normal resources,
  buildings, trophies, rewards, tournaments, and battle history byte-for-byte
  unchanged.
- The normal `/` route continues to load `Main.tscn` and preserve all production
  limits.
- Clean-frame mode hides and restores both React and Godot Studio chrome.

## Related Decisions

- [ADR-0011: Server Bot Bases And Recovery Matchmaking](adr-0011-server-bot-bases-and-recovery-matchmaking.md)
- [Ranked raid tournament ledger](adr-0016-ranked-raid-tournament-ledger.md)
- [Project scene workflow](../../docs/scene-workflow.md)
