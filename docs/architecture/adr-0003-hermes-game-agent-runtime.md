# ADR-0003: Hermes Game Agent Runtime Contract

## Status
Accepted

## Date
2026-05-18

## Context

### Problem Statement
The in-game AI chat was too often behaving like a generic assistant and action
requests such as "attack someone" could spend multiple slow retries before the
player saw progress. We need the model to remain the real decision-maker while
making every per-player Hermes agent immediately game-aware and faster for
game-action requests.

### Constraints
- The Clash MCP server remains the only authority for game actions.
- The backend must not bypass the AI for attacks, builds, upgrades, or resource
collection.
- Browser clients must not receive OpenRouter, Hermes, or MCP secrets.
- Each player must keep isolated Hermes sessions and memory.

### Requirements
- Every provisioned agent starts with a Clash-specific playbook.
- Action requests must tell the model to use MCP tools before answering.
- General chat can use a normal retry policy, but game actions need a shorter
fallback path and a long enough timeout for one MCP tool loop.
- The frontend should show safe progress states, not hidden reasoning.

## Decision

We will keep AI-driven gameplay, but tighten the runtime contract:

- The game backend classifies incoming chat messages into gameplay intents such
  as battle, collect resources, build, upgrade, fleet, skills, or general.
- The backend passes this intent to Hermes as metadata and as a request-specific
  instruction block.
- Hermes appends shared game memory, per-player memory, and recent player
  conversation memory to the agent instructions.
- Hermes uses separate retry and timeout defaults for action requests:
  one primary attempt, one fallback attempt, and a 75-second action timeout.
- Hermes keeps the regular three-retry profile for non-action chat.
- Opening the AI chat provisions and starts the player's Hermes agent instead
  of waiting for the first message.

### Architecture Diagram

```text
Browser AI Chat
  |
  v
Clash backend
  | classify intent + attach recent chat context
  v
Hermes orchestrator
  | shared memory + per-player memory + action contract
  v
Per-player Hermes gateway
  | model selects MCP tools
  v
Clash MCP server
  | validated game action + websocket event
  v
Game frontend
```

### Key Interfaces

The backend still exposes the same game chat API:

```text
GET  /api/ai-chat/status
POST /api/ai-chat/message
POST /api/ai-chat/reset
```

Hermes receives extra metadata:

```json
{
  "metadata": {
    "game_intent": {
      "kind": "battle",
      "action_required": true,
      "goal": "Start an AI online battle only through MCP tools.",
      "required_loop": "get_base_state -> confirm loaded ships -> execute_ai_attack_plan({ auto_tactics: true }) -> summarize result and losses"
    }
  }
}
```

## Alternatives Considered

### Alternative 1: Backend Fast Path
- **Description**: Detect "attack" or "collect" server-side and call MCP
  directly without the model.
- **Pros**: Fastest possible response.
- **Cons**: Violates the product requirement that the AI agent plans and plays.
- **Rejection Reason**: The agent must remain responsible for tactics and tool
  selection.

### Alternative 2: Prompt Only
- **Description**: Keep retries/timeouts unchanged and only add stronger prompt
  text.
- **Pros**: Smallest code change.
- **Cons**: Still allows minutes of retries on slow action requests.
- **Rejection Reason**: Does not address the main latency failure mode.

### Alternative 3: One Shared Long-Running Agent
- **Description**: Keep one warm Hermes agent for all players.
- **Pros**: Fast warm starts.
- **Cons**: Breaks per-player isolation and memory safety.
- **Rejection Reason**: Privacy and credential isolation are mandatory.

## Consequences

### Positive
- The AI still performs the action through MCP tools.
- First-turn behavior is game-specific instead of generic.
- Action commands should fail over faster without cutting off legitimate MCP
  tool loops.
- Per-player memory gives agents continuity across sessions.

### Negative
- More prompt and memory context is sent to models.
- Action timeout is longer than normal chat timeout, so a single bad route can
  still take up to 75 seconds.
- Intent classification is heuristic and must be tuned as players phrase more
  commands.

### Risks
- A model may still fail to call tools despite the stronger contract.
  - Mitigation: log intent, attempts, progress, model, and final answer.
- More memory context could reduce response quality on weak models.
  - Mitigation: cap memory file lengths and keep recent memory small.

## Performance Implications
- **CPU**: No meaningful extra backend CPU beyond intent classification and
  small file reads/writes.
- **Memory**: One small memory directory per provisioned player.
- **Load Time**: Opening the chat warms the player Hermes process earlier.
- **Network**: Action requests can make fewer model attempts but each attempt
  can wait longer for MCP tool completion.

## Migration Plan
1. Bump Clash agent prompt version to clear old Hermes sessions.
2. Add shared/player/recent memory files to every player Hermes home.
3. Add backend intent metadata and action instruction blocks.
4. Add action-specific Hermes retry/timeout settings to deploy scripts.
5. Deploy backend, MCP, frontend, and Hermes orchestrator.
6. Stress-test configured OpenRouter models and compare stability/latency.

## Validation Criteria
- "Які твої скіли" returns only Clash gameplay capabilities.
- "Атакуй когось" triggers MCP tool usage by the agent, not a generic answer.
- Chat progress shows game phases such as planning an AI battle.
- Action commands no longer spend three primary timeouts before trying fallback.
- Stress test shows which configured model is faster and more stable.

## Related Decisions
- [ADR-0001: Remote MCP Deployment](./adr-0001-remote-mcp-deployment.md)
- [ADR-0002: Per-Player Hermes AI Chat](./adr-0002-per-player-hermes-ai-chat.md)
