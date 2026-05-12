param(
  [string]$RemoteHost = "92.205.29.88",
  [string]$RemoteUser = "bloxxdotfun",
  [string]$RemoteSourceDir = "/opt/clash",
  [string]$Branch = "main",
  [string]$GodotExe = $env:GODOT_EXE,
  [string]$PuttyDir = "C:\Program Files\PuTTY",
  [string]$HostKey = "ssh-ed25519 255 SHA256:Q2aRdzOkyAUCNA1VV+mVHRD+adpoLpE3o7Lrw5qfeVA",
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$webDir = Join-Path $repoRoot "web"
$localGodotDir = Join-Path $webDir "public\godot"
$exportHtml = Join-Path $localGodotDir "Work.html"
$plink = Join-Path $PuttyDir "plink.exe"
$pscp = Join-Path $PuttyDir "pscp.exe"

if (-not $GodotExe) {
  $candidates = @(
    "C:\Users\Admin\Downloads\Godot_v4.6-stable_win64.exe\Godot_v4.6-stable_win64_console.exe",
    "C:\Users\Admin\Downloads\Godot_v4.6-stable_win64.exe\Godot_v4.6-stable_win64.exe"
  )
  $GodotExe = ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

if (-not (Test-Path $GodotExe)) { throw "Godot executable not found. Set GODOT_EXE or pass -GodotExe." }
if (-not (Test-Path $plink)) { throw "plink.exe not found at $plink" }
if (-not (Test-Path $pscp)) { throw "pscp.exe not found at $pscp" }

$password = $env:CLASH_SSH_PASSWORD
if (-not $password) {
  $secure = Read-Host "SSH password for $RemoteUser@$RemoteHost" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Push-Location $repoRoot
try {
  Write-Host "==> Generating Godot export manifest"
  node (Join-Path $webDir "generate-godot-export-manifest.cjs")

  Write-Host "==> Exporting Godot Web release"
  New-Item -ItemType Directory -Force -Path $localGodotDir | Out-Null
  & $GodotExe --headless --path $repoRoot --export-release "Web" $exportHtml
  if ($LASTEXITCODE -ne 0) { throw "Godot export failed with exit code $LASTEXITCODE" }
  if (-not (Test-Path (Join-Path $localGodotDir "Work.pck"))) { throw "Godot export did not produce Work.pck" }

  $remoteGodotDir = "$RemoteSourceDir/web/public/godot"
  $remote = "$RemoteUser@$RemoteHost"
  $remoteTarget = "${remote}:$remoteGodotDir/"

  Write-Host "==> Updating canonical source checkout on server: $RemoteSourceDir"
  $pullCmd = "cd '$RemoteSourceDir' && git fetch origin '$Branch' && git pull --ff-only origin '$Branch' && mkdir -p '$remoteGodotDir'"
  & $plink -batch -ssh -P 22 -pw $password -hostkey $HostKey $remote $pullCmd
  if ($LASTEXITCODE -ne 0) { throw "Remote git pull failed with exit code $LASTEXITCODE" }

  Write-Host "==> Uploading Godot export to $remoteGodotDir"
  & $pscp -batch -scp -P 22 -pw $password -hostkey $HostKey -r (Join-Path $localGodotDir "*") $remoteTarget
  if ($LASTEXITCODE -ne 0) { throw "Godot upload failed with exit code $LASTEXITCODE" }

  if (-not $SkipDeploy) {
    Write-Host "==> Running atomic deploy from /opt/clash"
    $deployCmd = "cd '$RemoteSourceDir' && sudo -n bash deploy/deploy.sh"
    & $plink -batch -ssh -P 22 -pw $password -hostkey $HostKey $remote $deployCmd
    if ($LASTEXITCODE -ne 0) { throw "Remote deploy failed with exit code $LASTEXITCODE" }
  }
} finally {
  Pop-Location
}
