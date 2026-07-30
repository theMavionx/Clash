param(
    [int]$WebPort = 5173,
    [int]$ServerPort = 4000,
    [int]$FuturesPort = 3999,
    [switch]$SkipServer,
    [switch]$SkipFutures,
    [switch]$SkipWeb,
    [switch]$NoOpen,
    [switch]$OpenServerDashboard,
    [string]$LocalAdminKey = "local-dev-admin",
    [int]$WaitSeconds = 45,
    [int]$GuestCount = 1,
    [switch]$ExportGodot,
    [string]$GodotExe = $env:GODOT_EXE,
    [ValidateSet("release", "debug")]
    [string]$GodotExportMode = "release"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LogDir = Join-Path $RepoRoot ".tmp\local-playtest"
$WebDir = Join-Path $RepoRoot "web"
$LocalGodotDir = Join-Path $WebDir "public\godot"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Resolve-GodotExe {
    param([string]$Preferred)
    if ($Preferred -and (Test-Path -LiteralPath $Preferred)) {
        return (Resolve-Path -LiteralPath $Preferred).Path
    }

    $candidates = @(
        (Join-Path $RepoRoot ".tmp-godot\engine\Godot_v4.6.1-stable_win64_console.exe"),
        (Join-Path $RepoRoot ".tmp-godot\engine\Godot_v4.6.1-stable_win64.exe"),
        "C:\Users\Admin\Downloads\Godot_v4.6-stable_win64.exe\Godot_v4.6-stable_win64_console.exe",
        "C:\Users\Admin\Downloads\Godot_v4.6-stable_win64.exe\Godot_v4.6-stable_win64.exe",
        "C:\Users\Admin\Godot_v4.6.3-stable_win64.exe\Godot_v4.6.3-stable_win64_console.exe",
        "C:\Users\Admin\Godot_v4.6.3-stable_win64.exe\Godot_v4.6.3-stable_win64.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw "Godot executable not found. Set GODOT_EXE or pass -GodotExe."
}

function Invoke-LocalGodotExport {
    $godotPath = Resolve-GodotExe -Preferred $GodotExe
    $exportHtml = Join-Path $LocalGodotDir "Work.html"
    $manifestScript = Join-Path $WebDir "generate-godot-export-manifest.cjs"
    $runtimeManifestScript = Join-Path $WebDir "write-godot-runtime-manifest.cjs"
    $exportFlag = if ($GodotExportMode -eq "debug") { "--export-debug" } else { "--export-release" }

    Write-Host "==> Generating Godot export manifest"
    & node $manifestScript
    if ($LASTEXITCODE -ne 0) { throw "Godot export manifest failed with exit code $LASTEXITCODE" }

    Write-Host "==> Exporting Godot Web $GodotExportMode"
    New-Item -ItemType Directory -Force -Path $LocalGodotDir | Out-Null
    & $godotPath --headless --path $RepoRoot $exportFlag "Web" $exportHtml
    if ($LASTEXITCODE -ne 0) { throw "Godot export failed with exit code $LASTEXITCODE" }
    if (-not (Test-Path -LiteralPath (Join-Path $LocalGodotDir "Work.pck"))) {
        throw "Godot export did not produce Work.pck"
    }

    Write-Host "==> Writing Godot runtime manifest"
    & node $runtimeManifestScript $LocalGodotDir "local-export"
    if ($LASTEXITCODE -ne 0) { throw "Godot runtime manifest failed with exit code $LASTEXITCODE" }
}

function Test-TcpPort {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(250, $false)) {
            return $false
        }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Wait-ForPort {
    param(
        [string]$Name,
        [int]$Port
    )
    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-TcpPort -Port $Port) {
            Write-Host "$Name is ready on 127.0.0.1:$Port"
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "$Name did not become ready on 127.0.0.1:$Port within $WaitSeconds seconds."
}

function Start-HiddenPowerShell {
    param(
        [string]$Name,
        [string]$Command,
        [string]$StdOut,
        [string]$StdErr
    )
    Write-Host "Starting $Name..."
    return Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $Command) `
        -WorkingDirectory $RepoRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $StdOut `
        -RedirectStandardError $StdErr `
        -PassThru
}

function Get-ChromePath {
    $candidates = @()
    if ($env:ProgramFiles) {
        $candidates += Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates += Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"
    }
    if ($env:LocalAppData) {
        $candidates += Join-Path $env:LocalAppData "Google\Chrome\Application\chrome.exe"
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    return $null
}

function Open-LocalUrls {
    param(
        [string[]]$Urls,
        [int]$GuestProfileCount = 1
    )

    $chromePath = Get-ChromePath
    if ($chromePath) {
        if ($GuestProfileCount -gt 1) {
            Write-Host "Opening local playtest in Chrome with separate local profiles..."
            for ($i = 0; $i -lt $Urls.Count; $i++) {
                $profileName = if ($i -lt $GuestProfileCount) { "chrome-guest-$($i + 1)" } else { "chrome-admin" }
                $profileDir = Join-Path $LogDir $profileName
                New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
                Start-Process -FilePath $chromePath -ArgumentList @(
                    "--new-window",
                    "--no-first-run",
                    "--user-data-dir=$profileDir",
                    $Urls[$i]
                )
                Start-Sleep -Milliseconds 500
            }
            return
        }

        Write-Host "Opening local playtest in Chrome..."
        Start-Process -FilePath $chromePath -ArgumentList (@("--new-window") + $Urls)
        return
    }

    Write-Host "Chrome was not found; opening local playtest with the default browser..."
    foreach ($url in $Urls) {
        Start-Process $url
        Start-Sleep -Milliseconds 500
    }
}

Write-Host "== Clash local manual playtest =="
Write-Host "Repo: $RepoRoot"
Write-Host "Logs: $LogDir"
Write-Host ""
Write-Host "Safety: local only. This command does not deploy, push, merge, or commit."
Write-Host ""

if ($ExportGodot) {
    Invoke-LocalGodotExport
    Write-Host ""
}

$startedProcesses = @()

$serverWasRunning = Test-TcpPort -Port $ServerPort
if ($SkipServer) {
    Write-Host "Skipping local server start."
} elseif ($serverWasRunning) {
    Write-Host "Server port $ServerPort is already in use; using existing local server."
    Write-Host "If admin login fails, stop local servers and restart so ADMIN_KEY is set to the local playtest key."
} else {
    $serverOut = Join-Path $LogDir "server.out.log"
    $serverErr = Join-Path $LogDir "server.err.log"
    $serverCommand = @(
        "`$env:PORT='$ServerPort'"
        "`$env:ADMIN_KEY='$LocalAdminKey'"
        "`$env:CLASH_ADMIN_KEY='$LocalAdminKey'"
        "`$env:CLASH_MARKETPLACE_INDEXER='0'"
        "`$env:CLASH_BRIDGE_RETRY_WORKER='0'"
        "`$env:CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER='0'"
        "`$env:NFT_OWNERSHIP_DAILY_SYNC='0'"
        "`$env:NFT_SUPPLY_REFRESH_DISABLE='1'"
        "`$env:GAME_SHOP_SOLANA_RECONCILE_ENABLED='0'"
        "`$env:CLASH_HERMES_JOBS_ENABLED='0'"
        "npm.cmd --prefix server start"
    ) -join "; "
    $serverProcess = Start-HiddenPowerShell -Name "local Clash server" -Command $serverCommand -StdOut $serverOut -StdErr $serverErr
    Write-Host "Server PID: $($serverProcess.Id)"
    $startedProcesses += [pscustomobject]@{
        name = "server"
        id = $serverProcess.Id
        port = $ServerPort
        started_at = (Get-Date).ToString("o")
    }
}

if (-not $SkipServer) {
    Wait-ForPort -Name "Server" -Port $ServerPort
}

$futuresWasRunning = Test-TcpPort -Port $FuturesPort
if ($SkipFutures) {
    Write-Host "Skipping local futures server start."
} elseif ($futuresWasRunning) {
    Write-Host "Futures port $FuturesPort is already in use; using existing local futures server."
} else {
    $futuresOut = Join-Path $LogDir "futures.out.log"
    $futuresErr = Join-Path $LogDir "futures.err.log"
    $futuresCommand = "`$env:FUTURES_PORT='$FuturesPort'; npm.cmd --prefix server-futures start"
    $futuresProcess = Start-HiddenPowerShell -Name "local Clash futures server" -Command $futuresCommand -StdOut $futuresOut -StdErr $futuresErr
    Write-Host "Futures PID: $($futuresProcess.Id)"
    $startedProcesses += [pscustomobject]@{
        name = "futures"
        id = $futuresProcess.Id
        port = $FuturesPort
        started_at = (Get-Date).ToString("o")
    }
}

if (-not $SkipFutures) {
    Wait-ForPort -Name "Futures server" -Port $FuturesPort
}

$webWasRunning = Test-TcpPort -Port $WebPort
if ($SkipWeb) {
    Write-Host "Skipping Vite web start."
} elseif ($webWasRunning) {
    Write-Host "Web port $WebPort is already in use; using existing local web server."
} else {
    $webOut = Join-Path $LogDir "web.out.log"
    $webErr = Join-Path $LogDir "web.err.log"
    $webCommand = "`$env:VITE_API_PROXY='http://127.0.0.1:$ServerPort'; `$env:VITE_WS_PROXY='ws://127.0.0.1:$ServerPort'; `$env:VITE_FUTURES_PROXY='http://127.0.0.1:$FuturesPort'; npm.cmd --prefix web run dev -- --host 127.0.0.1 --port $WebPort"
    $webProcess = Start-HiddenPowerShell -Name "local Vite web client" -Command $webCommand -StdOut $webOut -StdErr $webErr
    Write-Host "Web PID: $($webProcess.Id)"
    $startedProcesses += [pscustomobject]@{
        name = "web"
        id = $webProcess.Id
        port = $WebPort
        started_at = (Get-Date).ToString("o")
    }
}

if (-not $SkipWeb) {
    Wait-ForPort -Name "Web" -Port $WebPort
}

$GuestCount = [Math]::Max(1, $GuestCount)
$guestStamp = Get-Date -Format "yyyyMMddHHmmss"
$gameUrls = @()
for ($i = 1; $i -le $GuestCount; $i++) {
    $guestId = "g_local_${guestStamp}_$i"
    $gameUrls += "http://127.0.0.1:$WebPort/?guest=1&guest_id=$guestId"
}
$gameUrl = $gameUrls[0]
$adminKeyForUrl = [uri]::EscapeDataString($LocalAdminKey)
$adminUrl = "http://127.0.0.1:$WebPort/admin.html?admin_key=$adminKeyForUrl"
$serverUrl = "http://127.0.0.1:$ServerPort/"
$futuresUrl = "http://127.0.0.1:$FuturesPort/"

Write-Host ""
Write-Host "Manual test URLs:"
for ($i = 0; $i -lt $gameUrls.Count; $i++) {
    Write-Host "Player $($i + 1) guest: $($gameUrls[$i])"
}
Write-Host "Admin panel:     $adminUrl"
Write-Host "Local admin key: $LocalAdminKey"
if ($OpenServerDashboard) {
    Write-Host "Server panel:    $serverUrl"
    Write-Host "Futures panel:   $futuresUrl"
}
Write-Host ""
if ($startedProcesses.Count -gt 0) {
    $pidFile = Join-Path $LogDir "pids.json"
    @($startedProcesses) | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding UTF8
    Write-Host "Started process IDs were saved to: $pidFile"
}
Write-Host "Close the browser tabs when done."
Write-Host "Stop background local servers with: tools\codex\stop-local-playtest.cmd"

if (-not $NoOpen) {
    $urlsToOpen = @($gameUrls) + @($adminUrl)
    if ($OpenServerDashboard) {
        $urlsToOpen += @($serverUrl, $futuresUrl)
    }
    Open-LocalUrls -Urls $urlsToOpen -GuestProfileCount $GuestCount
}
