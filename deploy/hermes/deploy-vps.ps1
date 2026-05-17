param(
  [string]$HostName = $env:CLASH_HERMES_VPS_HOST,
  [string]$User = $env:CLASH_HERMES_VPS_USER,
  [string]$Password = "",
  [string]$HostKey = "",
  [string]$RemoteRoot = "/opt/clash-hermes-deploy",
  [string]$OpenRouterApiKey = $env:OPENROUTER_API_KEY,
  [string]$OrchestratorToken = $env:CLASH_HERMES_ORCHESTRATOR_TOKEN
)

$ErrorActionPreference = "Stop"

if (-not $HostName) { throw "HostName is required" }
if (-not $User) { $User = "root" }
if (-not $Password) { $Password = Read-Host "VPS password" }
if (-not $OpenRouterApiKey) { $OpenRouterApiKey = Read-Host "OpenRouter API key" }
if (-not $OrchestratorToken) { $OrchestratorToken = "horg_" + [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 })).TrimEnd("=").Replace("+","-").Replace("/","_") }

$plink = "C:\Program Files\PuTTY\plink.exe"
$pscp = "C:\Program Files\PuTTY\pscp.exe"
if (-not (Test-Path $plink)) { $plink = "plink.exe" }
if (-not (Test-Path $pscp)) { $pscp = "pscp.exe" }

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$sshArgs = @("-ssh", "$User@$HostName", "-pw", $Password, "-batch")
$scpArgs = @("-r", "-pw", $Password, "-batch")
if ($HostKey) {
  $sshArgs += @("-hostkey", $HostKey)
  $scpArgs += @("-hostkey", $HostKey)
}

& $plink @sshArgs "rm -rf $RemoteRoot && mkdir -p $RemoteRoot/deploy"
& $pscp @scpArgs "$repoRoot\hermes-orchestrator" "${User}@${HostName}:$RemoteRoot/"
& $pscp @scpArgs "$repoRoot\deploy\hermes" "${User}@${HostName}:$RemoteRoot/deploy/"
& $pscp @scpArgs "$repoRoot\deploy\deploy-hermes.sh" "${User}@${HostName}:$RemoteRoot/deploy/"
& $pscp @scpArgs "$repoRoot\deploy\update-hermes.sh" "${User}@${HostName}:$RemoteRoot/deploy/"
& $pscp @scpArgs "$repoRoot\deploy\deploy-hermes-tunnel.sh" "${User}@${HostName}:$RemoteRoot/deploy/"
& $pscp @scpArgs "$repoRoot\deploy\update-hermes-tunnel.sh" "${User}@${HostName}:$RemoteRoot/deploy/"

$remote = "cd $RemoteRoot && OPENROUTER_API_KEY='$OpenRouterApiKey' HERMES_ORCHESTRATOR_TOKEN='$OrchestratorToken' CLASH_HERMES_ORCHESTRATOR_SOURCE='$RemoteRoot/hermes-orchestrator' bash deploy/hermes/setup-vps.sh"
& $plink @sshArgs $remote

Write-Host "Hermes orchestrator deployed to $HostName"
