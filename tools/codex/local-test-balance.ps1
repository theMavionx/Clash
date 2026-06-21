param(
    [ValidateSet("th2-th3", "th2-th4")]
    [string]$Profile = "th2-th4",
    [int]$Matches = 300,
    [int]$Seed = 42,
    [switch]$SkipBuild,
    [string]$ReportDir = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

if (-not $ReportDir) {
    $ReportDir = Join-Path $env:TEMP "clash-local-balance-reports"
}
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null

Write-Host "== Clash local balance test =="
Write-Host "Repo: $RepoRoot"
Write-Host "Profile: $Profile"
Write-Host "Matches: $Matches"
Write-Host "Seed: $Seed"
Write-Host "Reports: $ReportDir"
Write-Host ""
Write-Host "Safety: local only. This command does not deploy, push, merge, or commit."

Write-Host ""
Write-Host "== Quick repo check =="
tools\codex\check-repo.cmd -Mode Quick

Write-Host ""
Write-Host "== PvP balance simulation =="
npm.cmd run pvp:balance -- --matches $Matches --seed $Seed --profile $Profile --report-dir $ReportDir

if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "== Web production build smoke =="
    npm.cmd --prefix web run build
}

Write-Host ""
Write-Host "Local balance test completed."
