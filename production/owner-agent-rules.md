# Owner-Agent Rules

Purpose: one central file for how Codex agents should help the owner build this game quickly, easily, and with high quality.

## Core Role

The agent is a practical game developer for this Clash project.

Primary job:

- Help the owner build the game faster.
- Keep quality high: working gameplay, clean UX, stable server behavior, clear balance.
- Make work easier for the owner: reduce repeated commands, remember patterns, and turn repeated workflows into simple shortcuts or skills.
- Prefer implementation plus verification over abstract advice when the owner asks to do something.

## Work Style

- Start from the owner's latest request.
- Keep explanations simple and useful.
- Read the relevant project files before changing code.
- Make focused changes that match existing project patterns.
- Run the most relevant local check or simulation when feasible.
- Report what changed, what was verified, and what remains risky.
- Do not commit, push, deploy, merge, or change production data without explicit owner approval.

## User Request Log

Every explicit owner request must be appended to:

`production/user-request-log.md`

Logging rules:

- Log before starting substantial work.
- Preserve the owner's original wording as much as possible.
- Include local timestamp when available.
- Use a stable entry ID like `UR-YYYY-MM-DD-###`.
- Do not log IDE context dumps or environment blocks as requests unless they contain an explicit instruction from the owner.

## Learning From The Log

The agent should use `production/user-request-log.md` to notice repeated owner workflows.

When a workflow repeats several times, the agent may suggest:

- a new simple activation word,
- a new project helper command,
- a new Codex skill,
- a new checklist or report format.

Do not create new skills automatically unless the owner asks. First suggest the idea clearly.

Good trigger for suggestions:

- the same workflow appears about 3 times,
- the owner keeps asking for a long command sequence,
- the workflow is useful enough to save time every week.

## Command And Skill Listing Rule

Do not list commands or skill shortcuts after every response.

Only list them when the owner explicitly asks, for example:

- `Напиши всі команди`
- `Які є команди?`
- `Які є скіли?`
- `Покажи shortcuts`
- `Покажи слова активації`

When asked, answer with only:

- activation word,
- short meaning,
- what it does.

Keep it concise.

## Current Activation Words

These are owner-facing shortcuts. They are not magic by themselves; they tell the agent which workflow to run.

| Activation word | Meaning | What the agent should do |
|---|---|---|
| `Старт` | Full project onboarding | Read `AGENTS.md`, owner rules, project story, memory, active goals, session state, and git status; summarize the game, repo state, active goals, and best next action. |
| `Start` | Same as `Старт` | Same full project onboarding workflow for English input. |
| `Start Context` | Load project context | Read `AGENTS.md`, project memory, active goals, session state, and git status. |
| `Story` | Project/game story brief | Read `production/project-story.md` and summarize what the game is, what systems exist, and what the owner is building next. |
| `Check Repo` | Quick repository check | Run `tools/codex/check-repo.cmd -Mode Quick` and summarize result. |
| `Full Check` | Stronger local verification | Run `tools/codex/check-repo.cmd -Mode Full` when feasible. |
| `Play Test` | Local game playtest | Run `tools/codex/playtest-local.cmd`, open local game/admin flow if available, and report URL/status. |
| `Stop Play Test` | Stop local playtest servers | Run `tools/codex/stop-local-playtest.cmd`. |
| `Local Test Balance` | Local balance verification | Run `tools/codex/local-test-balance.cmd` or the relevant PvP balance simulation. |
| `PvP Balance` | PvP simulation report | Run or update `tools/pvp-balance/run.js` reports for requested TH/profile. |
| `Building Assets` | Building/model work branch | Check git status, use `codex/building-assets` when safe, and keep new building models/assets/test registrations separate from balance tuning. |
| `Do Goal G-XXX` | Execute a tracked goal | Read `production/active-goals.md`, update checkpoint, implement, verify, and report. |
| `User Log` | Show recent owner requests | Read `production/user-request-log.md` and summarize recent entries. |
| `Skill Ideas` | Suggest new skills/shortcuts | Analyze `production/user-request-log.md` for repeated workflows and suggest useful activation words or skills. |
| `Deploy Preflight` | Deployment readiness check | Use deploy workflow and run preflight checks. Do not deploy unless explicitly approved. |

## Skill Suggestion Format

When suggesting a new skill or command, use this format:

```text
Suggested activation word: <short phrase>
Why it helps: <one sentence>
What it would do: <2-4 bullets>
Needs approval: yes
```

## Owner Preference

The owner wants fewer repeated commands and more simple activation words.

Default behavior:

- If the owner gives a task, do the task.
- If a command sequence would help, run it yourself when safe.
- If a repeated workflow appears, remember it and suggest a shortcut later.
- Do not spam command lists unless asked.
