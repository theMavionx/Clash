param(
    [ValidateSet("all", "th1-th4", "th1-th7", "th2-th3", "th2-th4", "th5-th7", "th1", "th2", "th3", "th4", "th5", "th6", "th7")]
    [string]$Profile = "th2-th4",
    [int]$Bases = 144,
    [int]$Matches = 300,
    [int]$AttackPolicies = 0,
    [int]$AdversarialRounds = 0,
    [int]$AdversarialMatches = 500,
    [int]$BreakabilityPolicies = 0,
    [int]$BreakabilityCandidatePolicies = 0,
    [int]$BreakabilityCalibrationBases = 5,
    [ValidateSet("common", "epic", "legendary", "unrevealed")]
    [string]$BreakabilityRarity = "common",
    [int]$UnitUtilityBases = 0,
    [int]$NftRarityProbeBases = 0,
    [int]$Seed = 42,
    [double]$TargetWinRate = 0.55,
    [double]$Band = 0.02,
    [int]$MinGroupSize = 6,
    [switch]$SameTownHallOnly,
    [ValidateSet("mixed-cycle", "low", "mid", "maxed", "mixed")]
    [string]$AttackLevelProfile = "mixed-cycle",
    [switch]$SkipBuild,
    [string]$ReportDir = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

if (-not $ReportDir) {
    $ReportDir = Join-Path $env:TEMP "clash-local-balance-reports"
}
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null

Write-Host "== Clash local balance test =="
Write-Host "Repo: $RepoRoot"
Write-Host "Profile: $Profile"
Write-Host "Bases: $Bases"
Write-Host "Matches: $Matches"
Write-Host "Attack policies: $AttackPolicies"
Write-Host "Adversarial rounds: $AdversarialRounds"
Write-Host "Adversarial matches/round: $AdversarialMatches"
Write-Host "Breakability policies/TH: $BreakabilityPolicies"
Write-Host "Breakability candidate policies: $BreakabilityCandidatePolicies"
Write-Host "Breakability calibration bases/TH: $BreakabilityCalibrationBases"
Write-Host "Breakability NFT rarity: $BreakabilityRarity"
Write-Host "Equal-slot utility bases/unit: $UnitUtilityBases"
Write-Host "Paired NFT rarity bases/unit: $NftRarityProbeBases"
Write-Host "Seed: $Seed"
Write-Host "Target win rate: $TargetWinRate +/- $Band"
Write-Host "Minimum report group: $MinGroupSize"
Write-Host "Same TH only: $SameTownHallOnly"
Write-Host "Attack levels: $AttackLevelProfile"
Write-Host "Reports: $ReportDir"
Write-Host ""
Write-Host "Safety: local only. This command does not deploy, push, merge, or commit."

Write-Host ""
Write-Host "== Quick repo check =="
tools\codex\check-repo.cmd -Mode Quick

Write-Host ""
Write-Host "== PvP balance simulation =="
$BalanceArgs = @(
    "run", "pvp:balance", "--",
    "--bases", $Bases,
    "--matches", $Matches,
    "--seed", $Seed,
    "--profile", $Profile,
    "--target-winrate", $TargetWinRate,
    "--band", $Band,
    "--min-group-size", $MinGroupSize,
    "--report-dir", $ReportDir,
    "--strict"
)
if ($AttackPolicies -gt 0) {
    $BalanceArgs += @("--attack-policies", $AttackPolicies)
}
if ($AdversarialRounds -gt 0) {
    $BalanceArgs += @(
        "--adversarial-rounds", $AdversarialRounds,
        "--adversarial-matches", $AdversarialMatches
    )
}
if ($BreakabilityPolicies -gt 0) {
    $BalanceArgs += @(
        "--breakability-policies", $BreakabilityPolicies,
        "--breakability-calibration-bases", $BreakabilityCalibrationBases,
        "--breakability-rarity", $BreakabilityRarity
    )
    if ($BreakabilityCandidatePolicies -gt 0) {
        $BalanceArgs += @(
            "--breakability-candidate-policies",
            $BreakabilityCandidatePolicies
        )
    }
}
if ($UnitUtilityBases -gt 0) {
    $BalanceArgs += @("--unit-utility-bases", $UnitUtilityBases)
}
if ($NftRarityProbeBases -gt 0) {
    $BalanceArgs += @("--nft-rarity-probe-bases", $NftRarityProbeBases)
}
if ($SameTownHallOnly) {
    $BalanceArgs += "--same-th-only"
}
if ($AttackLevelProfile -ne "mixed-cycle") {
    $BalanceArgs += @("--attack-level-profile", $AttackLevelProfile)
}
npm.cmd @BalanceArgs

if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "== Web production build smoke =="
    npm.cmd --prefix web run build
}

Write-Host ""
Write-Host "Local balance test completed."
