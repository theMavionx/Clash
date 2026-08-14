param(
  [string]$RemoteHost = "31.97.72.65",
  [string]$RemoteUser = "root",
  [string]$RemoteDb = "/opt/clash/shared/server/clash.db",
  [string]$OutputRoot = "C:\Users\Admin\Documents\ClashBackups",
  [string]$PuttyDir = "C:\Program Files\PuTTY",
  [string]$HostKey = "SHA256:7ewi+hdoJkhNQSeN/YaarW8D+GMi2JYLGq2243jsc6I"
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptRoot ".env.deploy"
$plink = Join-Path $PuttyDir "plink.exe"
$pscp = Join-Path $PuttyDir "pscp.exe"
$gzip = "C:\Program Files\Git\usr\bin\gzip.exe"

if (-not (Test-Path -LiteralPath $plink)) { throw "plink.exe not found at $plink" }
if (-not (Test-Path -LiteralPath $pscp)) { throw "pscp.exe not found at $pscp" }
if (-not (Test-Path -LiteralPath $gzip)) { throw "gzip.exe not found at $gzip" }

if (-not $env:CLASH_SSH_PASSWORD -and (Test-Path -LiteralPath $envFile)) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    $match = [regex]::Match($line, "^\s*CLASH_SSH_PASSWORD\s*=\s*(.*?)\s*$")
    if (-not $match.Success) { continue }
    $value = $match.Groups[1].Value
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $env:CLASH_SSH_PASSWORD = $value
  }
}
if (-not $env:CLASH_SSH_PASSWORD) { throw "CLASH_SSH_PASSWORD is not configured" }

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$backupDir = Join-Path $OutputRoot $timestamp
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$archive = Join-Path $backupDir "clash.sql.gz"
$stderr = Join-Path $backupDir "clash.sql.gz.stderr.log"
$metadata = Join-Path $backupDir "metadata.txt"
$envCopy = Join-Path $backupDir "production.env"
$remote = "$RemoteUser@$RemoteHost"
$commonArgs = @(
  "-batch", "-ssh", "-P", "22", "-pw", $env:CLASH_SSH_PASSWORD,
  "-hostkey", $HostKey, $remote
)

function Start-CheckedProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$StdoutPath,
    [Parameter(Mandatory = $true)][string]$StderrPath
  )
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
  if ($process.ExitCode -ne 0) {
    throw "$FilePath failed with exit code $($process.ExitCode); see $StderrPath"
  }
}

function ConvertTo-RemoteBashCommand {
  param([Parameter(Mandatory = $true)][string]$Script)
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Script))
  return "echo $encoded | base64 -d | bash"
}

$metadataErr = Join-Path $backupDir "metadata.stderr.log"
$metadataScript = @'
stat -c 'db_bytes=%s' '__REMOTE_DB__'
sqlite3 '__REMOTE_DB__' "SELECT 'tournaments=' || COUNT(*) FROM tournaments; SELECT 'participants=' || COUNT(*) FROM tournament_participants; PRAGMA journal_mode;"
'@.Replace('__REMOTE_DB__', $RemoteDb)
$metadataCommand = ConvertTo-RemoteBashCommand -Script $metadataScript
Start-CheckedProcess -FilePath $plink -Arguments ($commonArgs + @($metadataCommand)) -StdoutPath $metadata -StderrPath $metadataErr

$dumpScript = @'
set -o pipefail
sqlite3 '__REMOTE_DB__' '.timeout 5000' '.dump' | gzip -6 -c
'@.Replace('__REMOTE_DB__', $RemoteDb)
$dumpCommand = ConvertTo-RemoteBashCommand -Script $dumpScript
Start-CheckedProcess -FilePath $plink -Arguments ($commonArgs + @($dumpCommand)) -StdoutPath $archive -StderrPath $stderr

$archiveInfo = Get-Item -LiteralPath $archive
if ($archiveInfo.Length -le 0) { throw "Production DB archive is empty" }
& $gzip -t $archive
if ($LASTEXITCODE -ne 0) { throw "gzip integrity verification failed for $archive" }

$copyArgs = @(
  "-batch", "-scp", "-P", "22", "-pw", $env:CLASH_SSH_PASSWORD,
  "-hostkey", $HostKey, "${remote}:/opt/clash/shared/.env", $envCopy
)
$copy = Start-Process -FilePath $pscp -ArgumentList $copyArgs -WindowStyle Hidden -PassThru -Wait
if ($copy.ExitCode -ne 0) { throw "Production env copy failed with exit code $($copy.ExitCode)" }

$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
Add-Content -LiteralPath $metadata -Value "archive_bytes=$($archiveInfo.Length)"
Add-Content -LiteralPath $metadata -Value "archive_sha256=$hash"
Add-Content -LiteralPath $metadata -Value "archive_verified_gzip=1"
Add-Content -LiteralPath $metadata -Value "created_utc=$timestamp"

Write-Host "Verified production main DB logical backup: $archive"
Write-Host "SHA256: $hash"
