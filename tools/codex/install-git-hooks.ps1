$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$GitDir = Join-Path $RepoRoot ".git"
$HooksDir = Join-Path $GitDir "hooks"

if (-not (Test-Path $GitDir)) {
    Write-Error "No .git directory found at $GitDir"
}

New-Item -ItemType Directory -Force -Path $HooksDir | Out-Null

$PreCommit = @'
#!/bin/sh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "tools/codex/git-hooks/pre-commit.ps1"
'@

$PrePush = @'
#!/bin/sh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "tools/codex/git-hooks/pre-push.ps1"
'@

Set-Content -Path (Join-Path $HooksDir "pre-commit") -Value $PreCommit -Encoding ASCII
Set-Content -Path (Join-Path $HooksDir "pre-push") -Value $PrePush -Encoding ASCII

Write-Host "Installed git hooks:"
Write-Host "- .git/hooks/pre-commit"
Write-Host "- .git/hooks/pre-push"
