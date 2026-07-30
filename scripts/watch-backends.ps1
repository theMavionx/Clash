param(
  [int]$MainPort = 4000,
  [int]$FuturesPort = 3999,
  [int]$WebPort = 5173,
  [switch]$WithWeb,
  [switch]$FullWorkers
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$MainDir = Join-Path $Root 'server'
$FuturesDir = Join-Path $Root 'server-futures'
$WebDir = Join-Path $Root 'web'
$LogDir = Join-Path $Root '.local-logs'
$CombatGridGenerator = Join-Path $Root 'tools\combat-grid\generate-combat-grid-config.cjs'
$BundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$DefaultLighterPythonBin = if (Test-Path $BundledPython) { $BundledPython } else { 'python' }
$BotApiProxy = if ($env:VITE_BOT_API_PROXY) { $env:VITE_BOT_API_PROXY } else { 'http://62.72.35.202:8080' }
$BotWsProxy = if ($env:VITE_BOT_WS_PROXY) {
  $env:VITE_BOT_WS_PROXY
} elseif ($BotApiProxy -match '^https://') {
  $BotApiProxy -replace '^https://', 'wss://'
} else {
  $BotApiProxy -replace '^http://', 'ws://'
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Sync-CombatGrid {
  & node $CombatGridGenerator
  if ($LASTEXITCODE -ne 0) {
    throw "Combat grid generation failed with exit code $LASTEXITCODE"
  }
}

function New-Service([string]$Name, [string]$Dir, [int]$Port, [string]$FileName, [string[]]$Arguments, [hashtable]$EnvVars, [string[]]$WatchDirs) {
  @{
    Name = $Name
    Dir = $Dir
    Port = $Port
    FileName = $FileName
    Arguments = $Arguments
    EnvVars = $EnvVars
    WatchDirs = $WatchDirs
    Out = Join-Path $LogDir "$Name-$Port.out.log"
    Err = Join-Path $LogDir "$Name-$Port.err.log"
    Proc = $null
    LastRestart = [DateTime]::MinValue
    RestartCount = 0
  }
}

function Get-PortPids([int]$Port) {
  @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ })
}

function Stop-PortProcess([int]$Port, [int]$ExceptPid = 0) {
  foreach ($pidValue in Get-PortPids -Port $Port) {
    if ($ExceptPid -and [int]$pidValue -eq [int]$ExceptPid) { continue }
    Write-Host "[local-dev] stopping PID $pidValue on port $Port"
    Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
  }
}

function Test-PortReady([int]$Port, [int]$ProcessId, [int]$TimeoutMs = 15000) {
  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  while ((Get-Date) -lt $deadline) {
    $pids = Get-PortPids -Port $Port
    if ($pids -contains $ProcessId) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Start-ServiceProcess([hashtable]$Service) {
  Stop-PortProcess -Port $Service.Port
  Start-Sleep -Milliseconds 400

  if (Test-Path $Service.Out) { Remove-Item -LiteralPath $Service.Out -Force -ErrorAction SilentlyContinue }
  if (Test-Path $Service.Err) { Remove-Item -LiteralPath $Service.Err -Force -ErrorAction SilentlyContinue }

  $oldEnv = @{}
  try {
    foreach ($key in $Service.EnvVars.Keys) {
      $oldEnv[$key] = (Get-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue).Value
      Set-Item -LiteralPath "Env:$key" -Value ([string]$Service.EnvVars[$key])
    }

    Write-Host "[local-dev] starting $($Service.Name) on 127.0.0.1:$($Service.Port)"
    $Service['Proc'] = Start-Process -FilePath $Service['FileName'] `
      -ArgumentList $Service['Arguments'] `
      -WorkingDirectory $Service['Dir'] `
      -RedirectStandardOutput $Service['Out'] `
      -RedirectStandardError $Service['Err'] `
      -WindowStyle Hidden `
      -PassThru
  } finally {
    foreach ($key in $Service.EnvVars.Keys) {
      if ($null -eq $oldEnv[$key]) {
        Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
      } else {
        Set-Item -LiteralPath "Env:$key" -Value $oldEnv[$key]
      }
    }
  }

  $Service.RestartCount += 1
  $Service.LastRestart = Get-Date

  if (Test-PortReady -Port $Service['Port'] -ProcessId $Service['Proc'].Id) {
    Write-Host "[local-dev] $($Service.Name) ready: http://127.0.0.1:$($Service.Port) (PID $($Service['Proc'].Id))"
  } else {
    Write-Warning "[local-dev] $($Service.Name) did not bind port $($Service.Port) in time. Check $($Service.Err)"
  }
}

function Restart-ServiceProcess([hashtable]$Service, [string]$Reason) {
  $now = Get-Date
  if (($now - $Service.LastRestart).TotalMilliseconds -lt 1500) { return }
  Write-Host "[local-dev] restarting $($Service.Name): $Reason"
  if ($Service['Proc'] -and -not $Service['Proc'].HasExited) {
    Stop-Process -Id $Service['Proc'].Id -Force -ErrorAction SilentlyContinue
  }
  Start-ServiceProcess -Service $Service
}

function New-ServiceWatcher([hashtable]$Service, [string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  $watcher = New-Object System.IO.FileSystemWatcher
  $watcher.Path = $Path
  $watcher.IncludeSubdirectories = $true
  $watcher.Filter = '*.*'
  $watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'
  $watcher.EnableRaisingEvents = $true

  $action = {
    $path = $Event.SourceEventArgs.FullPath
    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    if ($ext -eq '.tscn') {
      if ([System.IO.Path]::GetFileName($path) -ne 'Main.tscn') { return }
      & node $CombatGridGenerator
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "[local-dev] combat grid generation failed after scene change: $path"
      }
      return
    }
    if ($ext -notin @('.js', '.cjs', '.mjs', '.json', '.env')) { return }
    if ($path -match '\\node_modules\\|\\.git\\|\\.local-logs\\|\\dist\\') { return }
    $service = $Event.MessageData
    Restart-ServiceProcess -Service $service -Reason "file changed: $path"
  }.GetNewClosure()

  Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $action -MessageData $Service | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Created -Action $action -MessageData $Service | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action $action -MessageData $Service | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $action -MessageData $Service | Out-Null
  return $watcher
}

$services = @(
  (New-Service `
    -Name 'main' `
    -Dir $MainDir `
    -Port $MainPort `
    -FileName 'node' `
    -Arguments @('index.js') `
    -EnvVars @{
      PORT = [string]$MainPort
      CLASH_MARKETPLACE_INDEXER = $(if ($FullWorkers) { '1' } else { '0' })
      CLASH_BRIDGE_RETRY_WORKER = $(if ($FullWorkers) { '1' } else { '0' })
      NFT_SUPPLY_REFRESH_DISABLE = $(if ($FullWorkers) { '0' } else { '1' })
      CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER = $(if ($FullWorkers) { '1' } else { '0' })
    } `
    -WatchDirs @($MainDir, (Join-Path $Root 'scenes'))),
  (New-Service `
    -Name 'futures' `
    -Dir $FuturesDir `
    -Port $FuturesPort `
    -FileName 'node' `
    -Arguments @('--experimental-wasm-modules', 'index.js') `
    -EnvVars @{
      FUTURES_PORT = [string]$FuturesPort
      DECIBEL_REWARDS_WORKER = $(if ($FullWorkers) { '1' } else { '0' })
      AVANTIS_REWARDS_WORKER = $(if ($FullWorkers) { '1' } else { '0' })
      GMX_REWARDS_WORKER = $(if ($FullWorkers) { '1' } else { '0' })
      HYPERLIQUID_REWARDS_WORKER = $(if ($FullWorkers) { '1' } else { '0' })
      HOTSTUFF_REWARDS_WORKER = $(if ($FullWorkers) { '1' } else { '0' })
      OSTIUM_BUILDER_ADDRESS = $(if ($env:OSTIUM_BUILDER_ADDRESS) { $env:OSTIUM_BUILDER_ADDRESS } else { '0xB36402e87a86206D3a114a98B53f31362291fe1B' })
      OSTIUM_BUILDER_FEE_BPS = $(if ($env:OSTIUM_BUILDER_FEE_BPS) { $env:OSTIUM_BUILDER_FEE_BPS } else { '2' })
      LIGHTER_PYTHON_BIN = $(if ($env:LIGHTER_PYTHON_BIN) { $env:LIGHTER_PYTHON_BIN } else { $DefaultLighterPythonBin })
    } `
    -WatchDirs @($FuturesDir))
)

if ($WithWeb) {
  $services += (New-Service `
    -Name 'web' `
    -Dir $WebDir `
    -Port $WebPort `
    -FileName 'node' `
    -Arguments @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', [string]$WebPort) `
    -EnvVars @{
      VITE_API_PROXY = "http://127.0.0.1:$MainPort"
      VITE_WS_PROXY = "ws://127.0.0.1:$MainPort"
      VITE_FUTURES_PROXY = "http://127.0.0.1:$FuturesPort"
      VITE_BOT_API_BASE_URL = $BotApiProxy
      VITE_BOT_WS_BASE_URL = $BotWsProxy
      VITE_BOT_API_PROXY = $BotApiProxy
      VITE_BOT_WS_PROXY = $BotWsProxy
      VITE_CLASH_BOT_URL = $BotApiProxy
      VITE_CLASH_BOT_WS_URL = $BotWsProxy
      VITE_OSTIUM_BUILDER_ADDRESS = $(if ($env:VITE_OSTIUM_BUILDER_ADDRESS) { $env:VITE_OSTIUM_BUILDER_ADDRESS } else { '0xB36402e87a86206D3a114a98B53f31362291fe1B' })
      VITE_OSTIUM_BUILDER_FEE_BPS = $(if ($env:VITE_OSTIUM_BUILDER_FEE_BPS) { $env:VITE_OSTIUM_BUILDER_FEE_BPS } else { '2' })
    } `
    -WatchDirs @())
}

$watchers = @()
try {
  Sync-CombatGrid
  foreach ($service in $services) {
    Start-ServiceProcess -Service $service
    foreach ($path in $service.WatchDirs) {
      $watcher = New-ServiceWatcher -Service $service -Path $path
      if ($watcher) { $watchers += $watcher }
    }
  }

  Write-Host ''
  Write-Host '[local-dev] running'
  Write-Host "[local-dev] main API:    http://127.0.0.1:$MainPort"
  Write-Host "[local-dev] futures API: http://127.0.0.1:$FuturesPort"
  if ($WithWeb) { Write-Host "[local-dev] web:         http://127.0.0.1:$WebPort" }
  Write-Host "[local-dev] logs:        $LogDir"
  Write-Host '[local-dev] press Ctrl+C to stop.'

  while ($true) {
    foreach ($service in $services) {
      if (-not $service['Proc']) { continue }
      $service['Proc'].Refresh()
      if ($service['Proc'].HasExited) {
        Restart-ServiceProcess -Service $service -Reason "process exited with code $($service['Proc'].ExitCode)"
      }
    }
    Start-Sleep -Seconds 1
  }
} finally {
  foreach ($watcher in $watchers) {
    if ($watcher) {
      $watcher.EnableRaisingEvents = $false
      $watcher.Dispose()
    }
  }
  foreach ($service in $services) {
    if ($service['Proc'] -and -not $service['Proc'].HasExited) {
      Stop-Process -Id $service['Proc'].Id -Force -ErrorAction SilentlyContinue
    }
  }
}
