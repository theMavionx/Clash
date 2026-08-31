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
    "server/reconcile_ranked_raid_days.js",
    "server/test-ranked-raid-tournaments.js",
    "server/test-ranked-global-matchmaking.js",
    "server/test-ranked-bot-pool-capacity.js",
    "server/test-ranked-raid-http.js",
    "server/test-bot-display-names.js",
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
    "server/test-leverup-earnings.js",
    "server/test-domfi-rewards.js",
    "server/test-etoro-rewards.js",
    "server/sanctum.js",
    "server/sanctum_rewards.js",
    "server/sanctum_rate_limit.js",
    "server/test-sanctum.js",
    "server/test-sanctum-rewards.js",
    "server/test-sanctum-migration.js",
    "server/test-sanctum-rate-limit.js",
    "server/index.js",
    "server/routes.js",
    "server/db.js",
    "server/task_rewards.js",
    "server/recover_task_reward_losses.js",
    "server/test-task-rewards.js",
    "server/tournament_trade_sync.js",
    "server/test-tournament-trade-cursor.js",
    "server-futures/aptos-key-pool.js",
    "server-futures/avantis-price-payload.js",
    "server-futures/domfi.js",
    "server-futures/test-domfi-adapter.js",
    "server-futures/etoro.js",
    "server-futures/test-etoro-adapter.js",
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
    "server-futures/leverup.js",
    "server-futures/gmx-ui-fee.js",
    "server-futures/gmx-rewards-worker.js",
    "server-futures/test-gmx-ui-fee-attribution.js",
    "server-futures/hibachi-proxy-pool.js",
    "server-futures/test-hibachi-proxy-pool.js",
    "server-futures/test-hibachi-rate-limit.js",
    "server-futures/test-hibachi-volume-attribution.js",
    "server-futures/index.js",
    "server-futures/routes.js",
    "server-futures/gmtrade.js",
    "deploy/reconcile-decibel-bulk-volume.js",
    "mcp/src/server.mjs"
)

$PowerShellFiles = @(
    "deploy/export-upload-deploy.ps1",
    "deploy/putty-http-connect-proxy.ps1",
    "tools/codex/test-deploy-proxy-relay.ps1",
    "tools/codex/deploy-local-to-prod.ps1"
)

Invoke-Step "combat grid snapshot" { node tools/combat-grid/generate-combat-grid-config.cjs --check }
Invoke-Step "combat grid regression" { node server/test-combat-grid-sync.js }
Invoke-Step "quest reward storage, recovery and HTTP idempotency" { node --test server/test-task-rewards.js web/test-quest-reward-delivery.mjs }
Invoke-Step "casualty report regression" { node server/test-casualty-report.js }
Invoke-Step "battle result idempotency regression" { node server/test-battle-result-idempotency.js }
Invoke-Step "battle casualty HTTP regression" { node server/test-battle-casualty-http.js }
Invoke-Step "player ship migration regression" { node server/test-player-ship-migration.js }
Invoke-Step "Town Hall complete-village gate" { node server/test-town-hall-complete-village-gate.js }
Invoke-Step "ranked raid tournament rules" { node server/test-ranked-raid-tournaments.js }
Invoke-Step "ranked global exact-TH matchmaking" { node server/test-ranked-global-matchmaking.js }
Invoke-Step "ranked bot pool covers configured daily capacity" { node server/test-ranked-bot-pool-capacity.js }
Invoke-Step "ranked raid HTTP rules" { node server/test-ranked-raid-http.js }
Invoke-Step "raid bot display names" { node server/test-bot-display-names.js }
Invoke-Step "client/server combat parity" { node server/test-client-server-combat-parity.js }
Invoke-Step "shared Aptos API client" { node server/test-aptos-api.js }
Invoke-Step "Aptos server key pool" { node server-futures/test-aptos-key-pool.js }
Invoke-Step "Avantis price payload" { node server-futures/test-avantis-price-payload.js }
Invoke-Step "Avantis browser price payload" { node web/test-avantis-price-payload.mjs }
Invoke-Step "DomFi adapter and reward normalization" { node server-futures/test-domfi-adapter.js }
Invoke-Step "DomFi browser calldata and referral" { node web/test-domfi-client.mjs }
Invoke-Step "client log retry queue and backoff" { node web/test-client-logger-retry.mjs }
Invoke-Step "DomFi Gold, quests, and tournament attribution" { node server/test-domfi-rewards.js }
Invoke-Step "eToro adapter contract" { node server-futures/test-etoro-adapter.js }
Invoke-Step "eToro browser integration" { node web/test-etoro-client.mjs }
Invoke-Step "eToro Gold, quests, and tournament attribution" { node server/test-etoro-rewards.js }
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
Invoke-Step "Hibachi REST proxy pool" { node --test server-futures/test-hibachi-proxy-pool.js }
Invoke-Step "Hibachi rate-limit and metadata cache" { node --test server-futures/test-hibachi-rate-limit.js }
Invoke-Step "Hibachi stable volume attribution" { node --test server-futures/test-hibachi-volume-attribution.js }
Invoke-Step "Hibachi browser error classification" { node --test web/test-hibachi-error-classification.mjs }
Invoke-Step "GMX exact UI-fee earnings" { node server/test-gmx-ui-fee-earnings.js }
Invoke-Step "GMX browser routing" { node web/test-gmx-ui-fee.mjs }
Invoke-Step "RH Lighter adapter" { node server-futures/test-rh-lighter-adapter.js }
Invoke-Step "RH Lighter earnings" { node server/test-rh-lighter-earnings.js }
Invoke-Step "RH Lighter tournament schema migration" { node server/test-rhlighter-tournament-migration.js }
Invoke-Step "LeverUp V2 broker routing" { node web/test-leverup-v2.mjs }
Invoke-Step "LeverUp broker earnings" { node server/test-leverup-earnings.js }
Invoke-Step "Aster browser integration" { node web/test-aster-v3.mjs }
Invoke-Step "Decibel browser referral" { node web/test-decibel-referral.mjs }
Invoke-Step "RH Lighter browser integration" { node web/test-rh-lighter.mjs }
Invoke-Step "Sanctum swap integration" { node server/test-sanctum.js }
Invoke-Step "Sanctum daily holder rewards" { node server/test-sanctum-rewards.js }
Invoke-Step "Sanctum schema migration" { node server/test-sanctum-migration.js }
Invoke-Step "Sanctum upstream quotas" { node server/test-sanctum-rate-limit.js }
Invoke-Step "Sanctum Battle Shop" { node web/test-sanctum-shop.mjs }
Invoke-Step "Sanctum admin controls" { node web/test-sanctum-admin.mjs }
Invoke-Step "battle result responsive layout" { node --test web/test-battle-result-layout.mjs }
Invoke-Step "tournament panel layout and volume-window labels" { node --test web/test-tournament-panel-layout.mjs }
Invoke-Step "Godot deploy active-runtime base" { powershell -NoProfile -ExecutionPolicy Bypass -File tools/codex/test-deploy-godot-runtime-base.ps1 }
Invoke-Step "deploy proxy relay formats" { powershell -NoProfile -ExecutionPolicy Bypass -File tools/codex/test-deploy-proxy-relay.ps1 }
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

foreach ($File in $PowerShellFiles) {
    if (Test-Path $File) {
        Invoke-Step "PowerShell parse $File" {
            $Tokens = $null
            $Errors = $null
            [void][System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path -LiteralPath $File),
                [ref]$Tokens,
                [ref]$Errors
            )
            if ($Errors.Count -gt 0) {
                $Messages = $Errors | ForEach-Object {
                    "line $($_.Extent.StartLineNumber): $($_.Message)"
                }
                throw "$File has PowerShell parse errors: $($Messages -join '; ')"
            }
        }
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
