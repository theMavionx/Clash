$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location $RepoRoot

Write-Host "pre-push: quick Clash repo check"
git fetch origin --prune

$Branch = git rev-parse --abbrev-ref HEAD
Write-Host "Branch: $Branch"

if (git rev-parse --verify origin/main 2>$null) {
    Write-Host "HEAD...origin/main:"
    git rev-list --left-right --count HEAD...origin/main
}

if ($Branch -ne "main") {
    Write-Host "Notice: pushing a non-main branch may create a GitHub Compare & pull request prompt."
}

if (git rev-parse --verify origin/codex/mm-bots 2>$null) {
    Write-Host "origin/codex/mm-bots...origin/main:"
    git rev-list --left-right --count origin/codex/mm-bots...origin/main
}

& "tools/codex/check-repo.ps1" -Mode Quick

Write-Host "pre-push: ok"
