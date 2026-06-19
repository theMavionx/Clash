param(
    [switch]$Full
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

function Write-Section($Title) {
    Write-Host ""
    Write-Host "== $Title =="
}

Write-Section "Repository"
Write-Host "Path: $RepoRoot"
git status --short --branch

Write-Section "Remote"
git fetch origin --prune
git log --oneline -5 origin/main

Write-Section "Current Branch Vs origin/main"
$Head = git rev-parse --abbrev-ref HEAD
Write-Host "Branch: $Head"
if (git rev-parse --verify origin/main 2>$null) {
    git rev-list --left-right --count HEAD...origin/main
}

if (git rev-parse --verify origin/codex/mm-bots 2>$null) {
    Write-Section "codex/mm-bots Vs origin/main"
    git rev-list --left-right --count origin/codex/mm-bots...origin/main
    git log --oneline -5 origin/codex/mm-bots
}

Write-Section "Project Memory"
if (Test-Path "production/agent-memory.md") {
    Get-Content "production/agent-memory.md" -TotalCount 120
} else {
    Write-Host "Missing production/agent-memory.md"
}

Write-Section "Owner Rules"
if (Test-Path "production/owner-agent-rules.md") {
    if ($Full) {
        Get-Content "production/owner-agent-rules.md"
    } else {
        Select-String -Path "production/owner-agent-rules.md" -Pattern '^## |^\|' |
            ForEach-Object { $_.Line }
    }
} else {
    Write-Host "Missing production/owner-agent-rules.md"
}

Write-Section "Project Story"
if (Test-Path "production/project-story.md") {
    if ($Full) {
        Get-Content "production/project-story.md"
    } else {
        Select-String -Path "production/project-story.md" -Pattern '^## |^- |^[0-9]+\.' |
            ForEach-Object { $_.Line }
    }
} else {
    Write-Host "Missing production/project-story.md"
}

Write-Section "Active Goals"
if (Test-Path "production/active-goals.md") {
    if ($Full) {
        Get-Content "production/active-goals.md"
    } else {
        Select-String -Path "production/active-goals.md" -Pattern "^## |^- Status:|^- Priority:|^Next checkpoint:" |
            ForEach-Object { $_.Line }
    }
} else {
    Write-Host "Missing production/active-goals.md"
}

Write-Section "Dirty Files"
git status --short

Write-Host ""
Write-Host "Context loaded. For broad edits, read AGENTS.md, owner rules, project story, agent memory, and active goals first."
