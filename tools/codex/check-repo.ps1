param(
    [ValidateSet("Quick", "Full", "Deploy")]
    [string]$Mode = "Quick"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

function Invoke-Step($Name, [scriptblock]$Command) {
    Write-Host ""
    Write-Host "== $Name =="
    & $Command
}

$NodeFiles = @(
    "tools/combat-grid/generate-combat-grid-config.cjs",
    "server/combat_grid_config.js",
    "server/test-combat-grid-sync.js",
    "server/test-player-ship-migration.js",
    "server/test-client-server-combat-parity.js",
    "server/index.js",
    "server/routes.js",
    "server/db.js",
    "server-futures/index.js",
    "server-futures/routes.js",
    "server-futures/gmtrade.js",
    "mcp/src/server.mjs"
)

Invoke-Step "combat grid snapshot" { node tools/combat-grid/generate-combat-grid-config.cjs --check }
Invoke-Step "combat grid regression" { node server/test-combat-grid-sync.js }
Invoke-Step "player ship migration regression" { node server/test-player-ship-migration.js }
Invoke-Step "client/server combat parity" { node server/test-client-server-combat-parity.js }

$CombatRegressionTests = @(
    "server/test-mimic-combat.js",
    "server/test-shark-trap.js",
    "server/test-necromancer-combat.js",
    "server/test-horror-evolution-combat.js",
    "server/test-mechanical-dragon-combat.js",
    "server/test-ice-golem-combat.js",
    "server/test-th6-progression.js"
)
foreach ($TestFile in $CombatRegressionTests) {
    if (Test-Path $TestFile) {
        Invoke-Step "combat regression $TestFile" { node $TestFile }
    }
}

foreach ($File in $NodeFiles) {
    if (Test-Path $File) {
        Invoke-Step "node --check $File" { node --check $File }
    }
}

if ($Mode -in @("Full", "Deploy")) {
    if (Test-Path "web/package.json") {
        Invoke-Step "web lint" { npm.cmd --prefix web run lint }
    }
}

if ($Mode -eq "Deploy") {
    if (Test-Path "web/package.json") {
        Invoke-Step "web build" { npm.cmd --prefix web run build }
    }
}

Write-Host ""
Write-Host "Repo check completed in $Mode mode."
