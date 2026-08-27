param(
    [string]$Branch = "main",
    [string]$ProxyFile = $env:CLASH_DEPLOY_PROXY_FILE,
    [int]$ProxyMaxAttempts = 20,
    [switch]$SkipDeploy,
    [switch]$AllowDirty,
    [switch]$ForceGodotExport
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

# Load local operator credentials from a gitignored env file. Explicit process
# variables keep precedence for CI and one-off operator sessions.
$DeployEnvFile = Join-Path $PSScriptRoot ".env.deploy"
if (Test-Path -LiteralPath $DeployEnvFile) {
    foreach ($line in Get-Content -LiteralPath $DeployEnvFile) {
        $match = [regex]::Match($line, "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")
        if (-not $match.Success) { continue }
        $name = $match.Groups[1].Value
        if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name, "Process"))) { continue }
        $value = $match.Groups[2].Value
        $doubleQuoted = $value.StartsWith('"') -and $value.EndsWith('"')
        $singleQuoted = $value.StartsWith("'") -and $value.EndsWith("'")
        if ($doubleQuoted -or $singleQuoted) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

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
    & $DeployScript -Branch $Branch -ProxyFile $ProxyFile -ProxyMaxAttempts $ProxyMaxAttempts -SkipDeploy:$SkipDeploy -ForceGodotExport:$ForceGodotExport
} else {
    & $DeployScript -Branch $Branch -ProxyFile $ProxyFile -ProxyMaxAttempts $ProxyMaxAttempts -ForceGodotExport:$ForceGodotExport
}
