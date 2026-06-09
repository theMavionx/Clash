param(
  [int]$MainPort = 4000,
  [int]$FuturesPort = 3999
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$MainDir = Join-Path $Root 'server'
$FuturesDir = Join-Path $Root 'server-futures'
$LogDir = Join-Path $Root '.local-logs'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$services = @{
  main = @{
    Name = 'main'
    Dir = $MainDir
    Port = $MainPort
    Out = Join-Path $LogDir 'main-4000.out.log'
    Err = Join-Path $LogDir 'main-4000.err.log'
    Proc = $null
    LastRestart = [DateTime]::MinValue
  }
  futures = @{
    Name = 'futures'
    Dir = $FuturesDir
    Port = $FuturesPort
    Out = Join-Path $LogDir 'futures-3999.out.log'
    Err = Join-Path $LogDir 'futures-3999.err.log'
    Proc = $null
    LastRestart = [DateTime]::MinValue
  }
}

function Stop-PortProcess([int]$Port) {
  $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pidValue in $pids) {
    if ($pidValue) {
      Write-Host "Stopping process on port $Port (PID $pidValue)"
      Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
    }
  }
}

function Start-ServiceProcess([hashtable]$Service) {
  Stop-PortProcess -Port $Service.Port
  Start-Sleep -Milliseconds 500
  Write-Host "Starting $($Service.Name) backend on port $($Service.Port)"
  $envBlock = @{
    PORT = if ($Service.Name -eq 'main') { [string]$MainPort } else { $env:PORT }
    FUTURES_PORT = if ($Service.Name -eq 'futures') { [string]$FuturesPort } else { $env:FUTURES_PORT }
  }
  $oldPort = $env:PORT
  $oldFuturesPort = $env:FUTURES_PORT
  try {
    if ($envBlock.PORT) { $env:PORT = $envBlock.PORT }
    if ($envBlock.FUTURES_PORT) { $env:FUTURES_PORT = $envBlock.FUTURES_PORT }
    $Service.Proc = Start-Process -FilePath 'node' `
      -ArgumentList 'index.js' `
      -WorkingDirectory $Service.Dir `
      -RedirectStandardOutput $Service.Out `
      -RedirectStandardError $Service.Err `
      -WindowStyle Hidden `
      -PassThru
  } finally {
    $env:PORT = $oldPort
    $env:FUTURES_PORT = $oldFuturesPort
  }
}

function Restart-ServiceProcess([hashtable]$Service, [string]$Reason) {
  Write-Host "Restarting $($Service.Name) backend: $Reason"
  if ($Service.Proc -and -not $Service.Proc.HasExited) {
    Stop-Process -Id $Service.Proc.Id -Force -ErrorAction SilentlyContinue
  }
  Start-ServiceProcess -Service $Service
}

function New-ServiceWatcher([hashtable]$Service) {
  $watcher = New-Object System.IO.FileSystemWatcher
  $watcher.Path = $Service.Dir
  $watcher.IncludeSubdirectories = $true
  $watcher.Filter = '*.*'
  $watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'
  $watcher.EnableRaisingEvents = $true

  $action = {
    $path = $Event.SourceEventArgs.FullPath
    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    if ($ext -notin @('.js', '.cjs', '.mjs', '.json', '.env')) { return }
    if ($path -match '\\node_modules\\|\\.git\\') { return }
    $now = Get-Date
    $service = $Event.MessageData
    if (($now - $service.LastRestart).TotalMilliseconds -lt 2500) { return }
    $service.LastRestart = $now
    Restart-ServiceProcess -Service $service -Reason $path
  }.GetNewClosure()

  Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $action -MessageData $Service | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Created -Action $action -MessageData $Service | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action $action -MessageData $Service | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $action -MessageData $Service | Out-Null
  return $watcher
}

Start-ServiceProcess -Service $services.main
Start-ServiceProcess -Service $services.futures

$watchers = @(
  New-ServiceWatcher -Service $services.main
  New-ServiceWatcher -Service $services.futures
)

Write-Host "Watching backends. Logs: $LogDir"
Write-Host "Main: http://127.0.0.1:$MainPort"
Write-Host "Futures: http://127.0.0.1:$FuturesPort"
Write-Host 'Press Ctrl+C to stop the watcher.'

try {
  while ($true) { Start-Sleep -Seconds 1 }
} finally {
  foreach ($watcher in $watchers) {
    if ($watcher) {
      $watcher.EnableRaisingEvents = $false
      $watcher.Dispose()
    }
  }
}
