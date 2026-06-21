param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LogDir = Join-Path $RepoRoot ".tmp\local-playtest"
$PidFile = Join-Path $LogDir "pids.json"

function Get-ChildProcessIds {
    param([int]$ParentId)

    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        Get-ChildProcessIds -ParentId ([int]$child.ProcessId)
        [int]$child.ProcessId
    }
}

function Stop-ProcessTree {
    param(
        [int]$RootId,
        [string]$Name
    )

    $ids = @()
    $ids += @(Get-ChildProcessIds -ParentId $RootId)
    $ids += $RootId
    $ids = $ids | ForEach-Object { [int]$_ } | Select-Object -Unique
    foreach ($id in $ids) {
        $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
        if (-not $proc) {
            continue
        }

        Write-Host "Stopping $Name process $id..."
        Stop-Process -Id $id -Force:$Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 250

        $stillRunning = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($stillRunning) {
            Write-Host "$Name process $id did not stop cleanly; forcing it now..."
            Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
        }
    }
}

if (-not (Test-Path -LiteralPath $PidFile)) {
    Write-Host "No local playtest PID file found at $PidFile"
    Write-Host "Nothing to stop from the last playtest command."
    exit 0
}

$rawEntries = Get-Content -LiteralPath $PidFile -Raw | ConvertFrom-Json
$entries = if ($rawEntries -is [System.Array]) { $rawEntries } else { @($rawEntries) }
foreach ($entry in @($entries)) {
    $id = [int]$entry.id
    $name = [string]$entry.name
    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $proc) {
        Write-Host "$name process $id is already stopped."
        continue
    }

    Stop-ProcessTree -RootId $id -Name $name
}

Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
Write-Host "Local playtest stop complete."
