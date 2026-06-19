param(
    [int]$WebPort = 5173,
    [int]$ServerPort = 4000,
    [switch]$SkipServer,
    [switch]$SkipWeb,
    [switch]$NoOpen,
    [switch]$OpenServerDashboard,
    [string]$LocalAdminKey = "local-dev-admin",
    [int]$WaitSeconds = 45
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LogDir = Join-Path $RepoRoot ".tmp\local-playtest"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

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
    param([string[]]$Urls)

    $chromePath = Get-ChromePath
    if ($chromePath) {
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
    $serverCommand = "`$env:PORT='$ServerPort'; `$env:ADMIN_KEY='$LocalAdminKey'; `$env:CLASH_ADMIN_KEY='$LocalAdminKey'; npm.cmd --prefix server run dev"
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

$webWasRunning = Test-TcpPort -Port $WebPort
if ($SkipWeb) {
    Write-Host "Skipping Vite web start."
} elseif ($webWasRunning) {
    Write-Host "Web port $WebPort is already in use; using existing local web server."
} else {
    $webOut = Join-Path $LogDir "web.out.log"
    $webErr = Join-Path $LogDir "web.err.log"
    $webCommand = "`$env:VITE_API_PROXY='http://127.0.0.1:$ServerPort'; `$env:VITE_WS_PROXY='ws://127.0.0.1:$ServerPort'; npm.cmd --prefix web run dev -- --host 127.0.0.1 --port $WebPort"
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

$gameUrl = "http://127.0.0.1:$WebPort/?guest=new"
$adminKeyForUrl = [uri]::EscapeDataString($LocalAdminKey)
$adminUrl = "http://127.0.0.1:$WebPort/admin.html?admin_key=$adminKeyForUrl"
$serverUrl = "http://127.0.0.1:$ServerPort/"

Write-Host ""
Write-Host "Manual test URLs:"
Write-Host "Game guest mode: $gameUrl"
Write-Host "Admin panel:     $adminUrl"
Write-Host "Local admin key: $LocalAdminKey"
if ($OpenServerDashboard) {
    Write-Host "Server panel:    $serverUrl"
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
    $urlsToOpen = @($gameUrl, $adminUrl)
    if ($OpenServerDashboard) {
        $urlsToOpen += $serverUrl
    }
    Open-LocalUrls -Urls $urlsToOpen
}
