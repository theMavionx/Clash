param(
  [string]$RemoteHost = "31.97.72.65",
  [string]$RemoteUser = "root",
  [string]$RemoteSourceDir = "/opt/clash",
  [string]$Branch = "main",
  [string]$GodotExe = $env:GODOT_EXE,
  [string]$PuttyDir = "C:\Program Files\PuTTY",
  [string]$HostKey = "ssh-ed25519 255 SHA256:7ewi+hdoJkhNQSeN/YaarW8D+GMi2JYLGq2243jsc6I",
  [switch]$SkipDeploy,
  [switch]$ForceGodotExport
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$webDir = Join-Path $repoRoot "web"
$localGodotDir = Join-Path $webDir "public\godot"
$exportHtml = Join-Path $localGodotDir "Work.html"
$plink = Join-Path $PuttyDir "plink.exe"
$pscp = Join-Path $PuttyDir "pscp.exe"

function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$FailureMessage
  )

  # Git and SSH tools legitimately write progress to stderr. Windows PowerShell
  # promotes that stream to error records, so rely on the native exit code here.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $FilePath @Arguments
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) { throw "$FailureMessage with exit code $exitCode" }
}

function Resolve-GodotExe {
  param([string]$Preferred)
  if ($Preferred -and (Test-Path $Preferred)) { return $Preferred }
  $candidates = @(
    "C:\Users\Admin\Downloads\Godot_v4.6-stable_win64.exe\Godot_v4.6-stable_win64_console.exe",
    "C:\Users\Admin\Downloads\Godot_v4.6-stable_win64.exe\Godot_v4.6-stable_win64.exe",
    "C:\Users\Admin\Downloads\Godot_v4.6.1-stable_win64.exe\Godot_v4.6.1-stable_win64_console.exe",
    "C:\Users\Admin\Downloads\Godot_v4.6.1-stable_win64.exe\Godot_v4.6.1-stable_win64.exe",
    (Join-Path $repoRoot ".tmp-godot\engine\Godot_v4.6.1-stable_win64_console.exe"),
    (Join-Path $repoRoot ".tmp-godot\engine\Godot_v4.6.1-stable_win64.exe")
  )
  return ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

function Get-GodotChangedFiles {
  param(
    [string]$BaseRef,
    [string]$HeadRef = "HEAD"
  )
  if (-not $BaseRef) { return @("__unknown_remote_head__") }
  $pathspecs = @(
    "project.godot",
    "export_presets.cfg",
    "scripts",
    "scenes",
    "shaders",
    "Model",
    "textures",
    "assets"
  )
  $diff = git diff --name-only "$BaseRef..$HeadRef" -- $pathspecs 2>$null
  if ($LASTEXITCODE -ne 0) { return @("__diff_failed__") }
  return @($diff | Where-Object { $_ })
}

if (-not (Test-Path $plink)) { throw "plink.exe not found at $plink" }

$password = $env:CLASH_SSH_PASSWORD
if (-not $password) {
  $secure = Read-Host "SSH password for $RemoteUser@$RemoteHost" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Push-Location $repoRoot
try {
  $remoteGodotDir = "$RemoteSourceDir/web/public/godot"
  $remote = "$RemoteUser@$RemoteHost"
  $remoteTarget = "${remote}:$remoteGodotDir/"

  $remoteHead = ""
  $remoteHeadCmd = "cd '$RemoteSourceDir' && git rev-parse HEAD"
  try {
    $remoteHead = (& $plink -batch -ssh -P 22 -pw $password -hostkey $HostKey $remote $remoteHeadCmd 2>$null | Select-Object -Last 1).Trim()
  } catch {
    $remoteHead = ""
  }

  $godotChangedFiles = if ($ForceGodotExport -or $env:CLASH_FORCE_GODOT_EXPORT -eq "1") {
    @("__forced__")
  } else {
    Get-GodotChangedFiles -BaseRef $remoteHead
  }
  $shouldExportGodot = $godotChangedFiles.Count -gt 0

  if ($shouldExportGodot) {
    Write-Host "==> Godot-visible changes detected; exporting and uploading Godot runtime"
    if ($godotChangedFiles.Count -le 12) {
      $godotChangedFiles | ForEach-Object { Write-Host "    $_" }
    } else {
      $godotChangedFiles | Select-Object -First 12 | ForEach-Object { Write-Host "    $_" }
      Write-Host "    ... +$($godotChangedFiles.Count - 12) more"
    }

    $GodotExe = Resolve-GodotExe -Preferred $GodotExe
    if (-not $GodotExe -or -not (Test-Path $GodotExe)) { throw "Godot executable not found. Set GODOT_EXE or pass -GodotExe." }
    if (-not (Test-Path $pscp)) { throw "pscp.exe not found at $pscp" }

    Write-Host "==> Generating Godot export manifest"
    node (Join-Path $webDir "generate-godot-export-manifest.cjs")

    Write-Host "==> Exporting Godot Web release"
    New-Item -ItemType Directory -Force -Path $localGodotDir | Out-Null
    & $GodotExe --headless --path $repoRoot --export-release "Web" $exportHtml
    if ($LASTEXITCODE -ne 0) { throw "Godot export failed with exit code $LASTEXITCODE" }
    if (-not (Test-Path (Join-Path $localGodotDir "Work.pck"))) { throw "Godot export did not produce Work.pck" }

    Write-Host "==> Writing Godot runtime manifest"
    node (Join-Path $webDir "write-godot-runtime-manifest.cjs") $localGodotDir "local-export"
    if ($LASTEXITCODE -ne 0) { throw "Godot runtime manifest failed with exit code $LASTEXITCODE" }
  } else {
    Write-Host "==> No Godot-visible changes since server HEAD $remoteHead; skipping local Godot export and upload"
  }

  Write-Host "==> Updating canonical source checkout on server: $RemoteSourceDir"
  $pullCmd = "cd '$RemoteSourceDir' && git fetch origin '$Branch' && git pull --ff-only origin '$Branch' && mkdir -p '$remoteGodotDir'"
  Invoke-NativeChecked -FilePath $plink -Arguments @("-batch", "-ssh", "-P", "22", "-pw", $password, "-hostkey", $HostKey, $remote, $pullCmd) -FailureMessage "Remote git pull failed"

  if ($shouldExportGodot) {
    Write-Host "==> Uploading Godot export to $remoteGodotDir"
    Invoke-NativeChecked -FilePath $pscp -Arguments @("-batch", "-scp", "-P", "22", "-pw", $password, "-hostkey", $HostKey, "-r", (Join-Path $localGodotDir "*"), $remoteTarget) -FailureMessage "Godot upload failed"
  }

  if (-not $SkipDeploy) {
    Write-Host "==> Running atomic deploy from /opt/clash"
    $godotChangedValue = if ($shouldExportGodot) { "1" } else { "0" }
    $deployCmd = "cd '$RemoteSourceDir' && sudo -n env CLASH_GODOT_CHANGED=$godotChangedValue bash deploy/deploy.sh"
    Invoke-NativeChecked -FilePath $plink -Arguments @("-batch", "-ssh", "-P", "22", "-pw", $password, "-hostkey", $HostKey, $remote, $deployCmd) -FailureMessage "Remote deploy failed"
  }
} finally {
  Pop-Location
}
