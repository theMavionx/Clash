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
    $global:LASTEXITCODE = 0
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

function Resolve-GodotExe {
    $Candidates = @(
        $env:GODOT_EXE,
        "C:\Users\Admin\Downloads\Godot_v4.6.1-stable_win64.exe\Godot_v4.6.1-stable_win64_console.exe",
        (Join-Path $RepoRoot ".tmp-godot\engine\Godot_v4.6.1-stable_win64_console.exe")
    )
    return ($Candidates | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_)
    } | Select-Object -First 1)
}

$NodeFiles = @(
    "tools/combat-grid/generate-combat-grid-config.cjs",
    "server/combat_grid_config.js",
    "server/test-combat-grid-sync.js",
    "server/casualty_report.js",
    "server/test-casualty-report.js",
    "server/test-battle-result-idempotency.js",
    "server/test-battle-casualty-http.js",
    "server/test-player-ship-migration.js",
    "server/test-town-hall-complete-village-gate.js",
    "server/ranked_raid_tournaments.js",
    "server/test-ranked-raid-tournaments.js",
    "server/test-ranked-global-matchmaking.js",
    "server/test-client-server-combat-parity.js",
    "server/hermes_jobs.js",
    "server/hermes_jobs_worker.js",
    "server/test-hermes-jobs-worker.js",
    "server/aptos_api.js",
    "server/test-aptos-api.js",
    "server/bridge_helpers.js",
    "server/custodial_marketplace.js",
    "server/nft_v3_endpoints.js",
    "server/earnings.js",
    "server/test-ondo-earnings.js",
    "server/test-aster-earnings.js",
    "server/gmx_ui_fees.js",
    "server/test-gmx-ui-fee-earnings.js",
    "server/test-rh-lighter-earnings.js",
    "server/test-rhlighter-tournament-migration.js",
    "server/index.js",
    "server/routes.js",
    "server/db.js",
    "server/tournament_trade_sync.js",
    "server/test-tournament-trade-cursor.js",
    "server-futures/aptos-key-pool.js",
    "server-futures/avantis-price-payload.js",
    "server-futures/test-avantis-price-payload.js",
    "server-futures/test-aptos-key-pool.js",
    "server-futures/hyperliquid-rewards-worker.js",
    "server-futures/test-hyperliquid-rewards-worker.js",
    "server-futures/decibel-bulk-rewards.js",
    "server-futures/decibel-rewards-worker.js",
    "server-futures/test-decibel-exact-fill-reconciliation.js",
    "server-futures/test-decibel-bulk-rewards.js",
    "server-futures/test-decibel-referral.js",
    "server-futures/test-aster-adapter.js",
    "server-futures/test-aster-builder-tracking.js",
    "server-futures/test-rh-lighter-adapter.js",
    "server-futures/gmx-ui-fee.js",
    "server-futures/gmx-rewards-worker.js",
    "server-futures/test-gmx-ui-fee-attribution.js",
    "server-futures/index.js",
    "server-futures/routes.js",
    "server-futures/gmtrade.js",
    "deploy/reconcile-decibel-bulk-volume.js",
    "mcp/src/server.mjs"
)

Invoke-Step "combat grid snapshot" { node tools/combat-grid/generate-combat-grid-config.cjs --check }
Invoke-Step "combat grid regression" { node server/test-combat-grid-sync.js }
Invoke-Step "casualty report regression" { node server/test-casualty-report.js }
Invoke-Step "battle result idempotency regression" { node server/test-battle-result-idempotency.js }
Invoke-Step "battle casualty HTTP regression" { node server/test-battle-casualty-http.js }
Invoke-Step "player ship migration regression" { node server/test-player-ship-migration.js }
Invoke-Step "Town Hall complete-village gate" { node server/test-town-hall-complete-village-gate.js }
Invoke-Step "ranked raid tournament rules" { node server/test-ranked-raid-tournaments.js }
Invoke-Step "ranked global exact-TH matchmaking" { node server/test-ranked-global-matchmaking.js }
Invoke-Step "client/server combat parity" { node server/test-client-server-combat-parity.js }
Invoke-Step "shared Aptos API client" { node server/test-aptos-api.js }
Invoke-Step "Aptos server key pool" { node server-futures/test-aptos-key-pool.js }
Invoke-Step "Avantis price payload" { node server-futures/test-avantis-price-payload.js }
Invoke-Step "Avantis browser price payload" { node web/test-avantis-price-payload.mjs }
Invoke-Step "Aptos browser key pool" { node scripts/verify-aptos-browser-key-pool.mjs }
Invoke-Step "Aptos RPC routing" { node scripts/verify-aptos-rpc-routing.mjs }
Invoke-Step "Hyperliquid rewards worker" { node server-futures/test-hyperliquid-rewards-worker.js }
Invoke-Step "Decibel bulk rewards worker" { node server-futures/test-decibel-bulk-rewards.js }
Invoke-Step "Decibel exact-fill reconciliation" { node server-futures/test-decibel-exact-fill-reconciliation.js }
Invoke-Step "Decibel referral enforcement" { node server-futures/test-decibel-referral.js }
Invoke-Step "Aster adapter" { node server-futures/test-aster-adapter.js }
Invoke-Step "Aster builder tracking" { node server-futures/test-aster-builder-tracking.js }
Invoke-Step "Aster earnings" { node server/test-aster-earnings.js }
Invoke-Step "GMX exact UI-fee attribution" { node server-futures/test-gmx-ui-fee-attribution.js }
Invoke-Step "GMX exact UI-fee earnings" { node server/test-gmx-ui-fee-earnings.js }
Invoke-Step "GMX browser routing" { node web/test-gmx-ui-fee.mjs }
Invoke-Step "RH Lighter adapter" { node server-futures/test-rh-lighter-adapter.js }
Invoke-Step "RH Lighter earnings" { node server/test-rh-lighter-earnings.js }
Invoke-Step "RH Lighter tournament schema migration" { node server/test-rhlighter-tournament-migration.js }
Invoke-Step "Aster browser integration" { node web/test-aster-v3.mjs }
Invoke-Step "Decibel browser referral" { node web/test-decibel-referral.mjs }
Invoke-Step "RH Lighter browser integration" { node web/test-rh-lighter.mjs }
Invoke-Step "battle result responsive layout" { node --test web/test-battle-result-layout.mjs }
Invoke-Step "Godot deploy active-runtime base" { powershell -NoProfile -ExecutionPolicy Bypass -File tools/codex/test-deploy-godot-runtime-base.ps1 }
Invoke-Step "Tournament trade cursor" { node server/test-tournament-trade-cursor.js }
Invoke-Step "Hermes jobs worker" { node server/test-hermes-jobs-worker.js }
Invoke-Step "Ondo proof-gated builder earnings" { node server/test-ondo-earnings.js }

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
    $GodotExe = Resolve-GodotExe
    if (-not $GodotExe) {
        throw "Godot 4.6.1 executable not found; cannot run the Archer Tower late-wave deploy gate."
    }
    Invoke-Step "Archer Tower late-wave Godot regression" {
        & $GodotExe --headless --path $RepoRoot --script res://scripts/tests/tower_archer_late_wave_probe.gd
    }
    Invoke-Step "camera swipe smoothing Godot regression" {
        & $GodotExe --headless --path $RepoRoot res://scenes/TestMain.tscn -- --verify-camera-swipe-smoothing
    }
    Invoke-Step "building move smoothing and grid Godot regression" {
        & $GodotExe --headless --path $RepoRoot --script res://scripts/tests/building_move_smoothing_probe.gd
    }
    if (Test-Path "web/package.json") {
        Invoke-Step "web build" { npm.cmd --prefix web run build }
    }
}

Write-Host ""
Write-Host "Repo check completed in $Mode mode."
