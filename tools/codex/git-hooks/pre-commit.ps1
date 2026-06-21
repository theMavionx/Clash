$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location $RepoRoot

Write-Host "pre-commit: quick Clash repo check"
git status --short --branch

& "tools/codex/check-repo.ps1" -Mode Quick

$StagedImports = git diff --cached --name-only -- "*.import"
if ($StagedImports) {
    Write-Host ""
    Write-Host "Notice: staged Godot .import files:"
    $StagedImports | ForEach-Object { Write-Host "- $_" }
}

$ActiveGoalsChanged = git diff --cached --name-only -- "production/active-goals.md"
if ($ActiveGoalsChanged) {
    Write-Host ""
    Write-Host "Active goals were updated in this commit."
}

Write-Host "pre-commit: ok"
