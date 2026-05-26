# Path-Specific Rules

Codex rules live in `.codex/rules/`. They mirror the Claude rule intent but use this repository's current paths.

| Rule File | Primary Paths | Enforces |
| --- | --- | --- |
| `gameplay-code.md` | `scripts/**`, `server/combat_defs.js` | Data-driven gameplay, delta time, client/server sync |
| `engine-code.md` | `scripts/**`, `addons/**`, `tools/**` | Godot API safety, hot-path performance, engine references |
| `ai-code.md` | `server/hermes_client.js`, `hermes-orchestrator/**`, AI agent routes | Agent safety, tool-call verification, debuggability |
| `network-code.md` | `server/**`, `mcp/**`, `web/**` | Server authority, validation, compatibility, rate limits |
| `ui-code.md` | `scripts/**`, `web/**`, UI scenes | UI state boundaries, accessibility, responsive checks |
| `design-docs.md` | `design/gdd/**` | Required design sections, formulas, edge cases |
| `narrative.md` | `design/narrative/**`, narrative docs | Canon consistency and localization readiness |
| `data-files.md` | `assets/data/**`, JSON config files | Schema, naming, valid JSON, no orphaned entries |
| `test-standards.md` | `tests/**`, `server/test*`, test scenes | Deterministic tests and regression coverage |
| `prototype-code.md` | `prototypes/**`, `example/**` | Relaxed prototype rules and README requirements |
| `shader-code.md` | `shaders/**`, shader assets | Godot shader naming, performance, fallbacks |

When a path does not match perfectly, apply the closest rule by intent.
