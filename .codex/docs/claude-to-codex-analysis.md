# Claude To Codex Migration Analysis

## What Exists For Claude

- `CLAUDE.md`: Claude master instructions.
- `.claude/agents/`: role definitions for leadership, department leads, specialists, and Godot-focused agents.
- `.claude/skills/`: workflow skills such as code review, sprint planning, prototype, balance check, release checklist, and team orchestration.
- `.claude/rules/`: path-scoped rules for gameplay, engine, AI, networking, UI, tests, design docs, data, narrative, prototypes, and shaders.
- `.claude/docs/`: shared operating docs, templates, coordination maps, hooks reference, and coding standards.
- `.claude/hooks/`: Claude-specific shell hooks.

## What Already Existed For Codex

- `AGENTS.md`: Codex master instructions, but it referenced missing `.codex/docs/*` files.
- `.codex/config.toml`: local MCP config with an absolute machine path, intentionally kept untracked.
- `.codex/agents/*.toml`: local Codex agent conversions, intentionally kept untracked unless the user decides to publish them.
- `.codex/docs/scene-workflow.md`: Codex scene workflow.

## Migration Choices

- Preserved all Claude files.
- Added Codex docs that match Codex working style: concise, direct, implementation-oriented, and repo-path-aware.
- Replaced generic `src/**` rule paths from the Claude template with this project's actual paths: `scripts/**`, `server/**`, `shaders/**`, `design/**`, `production/**`, `mcp/**`, and `web/**`.
- Kept local Codex config ignored because it contains machine-specific paths.
- Unignored only `.codex/docs/**` and `.codex/rules/**` so project rules can be committed without exposing local config.

## Remaining Optional Work

- Convert `.claude/skills/**` into Codex skills if the team wants the workflows available outside Claude.
- Decide whether `.codex/agents/*.toml` should remain local or become tracked team assets.
- Add project-specific test commands once the Godot and Node test flows are standardized.
