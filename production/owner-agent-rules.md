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
- Check GitHub remote state only at the start of a new work session, not before every small
  task while the owner is actively working in the same conversation. A new work session means
  a fresh chat/context recovery, the owner returning after a meaningful break such as a new
  day, broad repo/goal startup, or the owner explicitly says they pushed/changed commits on
  GitHub. Then run `git fetch origin --prune`, check `git status --short --branch`, compare
  the current branch with `origin/main`, and summarize any new remote commits or authors.
  Local `git status` checks are still okay whenever needed to protect dirty work. Do not pull,
  merge, rebase, or discard local work unless the owner explicitly approves.
- When the owner asks to accept incoming changes, merge a branch, pull updates, or otherwise
  take GitHub changes into the workspace, resolve any conflicts that appear instead of
  leaving the repo half-merged. Preserve both the intended incoming changes and local owner
  work, remove conflict markers, check for unmerged paths, and run the closest practical
  verification so the project still works. If a conflict cannot be resolved safely, stop and
  explain the exact blocker before proceeding.
- Keep explanations simple and useful.
- Read the relevant project files before changing code.
- Make focused changes that match existing project patterns.
- Ordinary repository file edits do not need separate owner confirmation when they are part of
  the requested task or its documentation/checkpoint work. This includes `.md` docs, reports,
  rules, active-goal/session files, and local request logs. Still explain meaningful multi-file
  edits before applying them, and still preserve unrelated dirty work.
- When adding new functionality, preserve all existing working behavior. The new feature is
  not done if it breaks neighboring systems or old flows. For example, adding a new unit must
  leave every existing unit, deployment path, combat outcome, UI panel, server sync, and replay
  path working as before unless the owner explicitly approved a behavior change.
- When the owner starts executing a goal, first offer two execution modes unless the owner
  already chose one:
  1. Full goal run: the agent completes all planned subpoints, verifies them locally, fixes
     issues found during verification, and reports when the full goal/checkpoint is done.
  2. Step-by-step with owner checks: the agent completes one small meaningful action, reports
     what changed, says exactly where and how the owner can check the work, waits for owner
     feedback/approval, then continues to the next action until the goal is fully complete.
- When using mode 2, always include checkpoint progress in owner updates and completion
  reports: current checkpoint number, estimated total checkpoints, and how many checkpoints
  remain before the goal is fully done. If verification reveals new work, update the estimate
  explicitly instead of silently changing the plan.
- For either goal mode, if local verification needs game/admin/browser windows and the agent can
  open them safely, the agent should open the needed local windows, run the needed game/API/admin
  action itself, seed visible verification data when practical, and leave the owner a ready state
  to inspect. Do not only describe manual steps when an automated local setup is feasible. If this
  is blocked, explain what could not be opened or run and give the closest manual check.
- For local playtests and admin checks, open all local URLs in Chrome in one browser window with
  multiple tabs. Do not use Firefox or the operating system default browser as a fallback. If
  Chrome is unavailable, print the URLs and ask the owner to open them in Chrome.
- Local guest playtests should be quick to inspect: on localhost guest sessions only, suppress
  extra first-run/tutorial/news/update notices that the owner would otherwise need to close. Do
  not suppress those flows for production, non-local hosts, or normal non-guest accounts.
- Run the most relevant local check or simulation when feasible.
- Verify the actual behavior that changed, especially gameplay, UI, server, economy, and
  content changes. Do not stop at syntax checks when a local playtest, replay, simulation,
  browser flow, admin flow, or Godot inspection can prove the behavior.
- Verification must cover both the new behavior and the closest existing regression risks.
  If full regression verification is not practical, run the strongest focused checks available
  and clearly report what remains unverified.
- For combat/defense work, verify observable outcomes such as projectile spawn/travel/impact,
  target HP changes, death/cleanup behavior, and replay/telemetry events when applicable.
- If verification finds a bug caused by the change, fix it and rerun the focused check before
  calling the task complete.
- If the environment blocks real verification, explain the block and the remaining risk.
- Report what changed, what was verified, and what remains risky.
- Do not commit, push, deploy, merge, change production data, or run destructive operations
  without explicit owner approval.

## User Request Log

Every explicit owner request must be appended to:

`production/user-request-log.md`

Logging rules:

- Log before starting substantial work.
- Preserve the owner's original wording as much as possible.
- Include local timestamp when available.
- Use a stable entry ID like `UR-YYYY-MM-DD-###`.
- Do not log IDE context dumps or environment blocks as requests unless they contain an explicit instruction from the owner.
- Keep this request log local-only. It is ignored by Git and should not be committed or pushed
  to GitHub.
- If a request is unreadable because of broken encoding, first try to decode it. If it cannot
  be recovered into understandable text, do not keep the garbage entry; ask the owner or delete
  the unreadable log entry.

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
| `Play Test` | Full local playtest | Run `tools/codex/playtest-local.cmd -ExportGodot -GuestCount 2 -OpenServerDashboard`, open two local guest players plus admin, and report URL/status. |
| `Local Test` | Same as `Play Test` | Same full local playtest workflow: fresh local Godot export, local server/web, two guest players, and admin panel. |
| `Тест локально` | Same as `Play Test` | Same full local playtest workflow for Ukrainian input. |
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

React/UI preference:

- All game UI images, building previews, icons, thumbnails, and modal content should be visually centered by default.
- UI changes should look concise and polished: balanced spacing, readable scale, no accidental clipping, overflow, off-center assets, or noisy decoration.
- When a raw asset has uneven transparent padding or visual weight, adjust the React preview style so the visible object, not only the image bounding box, appears centered.
