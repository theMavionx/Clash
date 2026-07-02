param(
    [string]$Branch = "main",
    [switch]$SkipDeploy,
    [switch]$AllowDirty,
    [switch]$ForceGodotExport
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

Write-Host "== Deploy preflight =="
git fetch origin --prune
git status --short --branch

$Dirty = git status --porcelain
if ($Dirty -and -not $AllowDirty) {
    Write-Error "Working tree is dirty. Commit/stash changes or rerun with -AllowDirty if the user explicitly accepts it."
}

& (Join-Path $PSScriptRoot "check-repo.ps1") -Mode Deploy

Write-Host ""
Write-Host "== Deploy =="
$DeployScript = Join-Path $RepoRoot "deploy/export-upload-deploy.ps1"
if (-not (Test-Path $DeployScript)) {
    Write-Error "Missing deploy script: $DeployScript"
}

if ($SkipDeploy) {
    & $DeployScript -Branch $Branch -SkipDeploy:$SkipDeploy -ForceGodotExport:$ForceGodotExport
} else {
    & $DeployScript -Branch $Branch -ForceGodotExport:$ForceGodotExport
}
