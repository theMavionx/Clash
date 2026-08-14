$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$deployScriptPath = Join-Path $repoRoot "deploy\export-upload-deploy.ps1"
$source = Get-Content -LiteralPath $deployScriptPath -Raw

if ($source -notmatch 'current/web/dist/godot/godot-runtime-manifest\.json') {
    throw "Godot deploy detection must read the active runtime manifest"
}
if ($source -notmatch "remoteRuntimeBuild -match '\(\[0-9a-fA-F\]\{8,40\}\)\$'") {
    throw "Godot deploy detection must extract the active runtime commit"
}
if ($source -notmatch 'falling back to source HEAD') {
    throw "Godot deploy detection must retain a source-HEAD fallback"
}

$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
    $deployScriptPath,
    [ref]$tokens,
    [ref]$errors
) | Out-Null
if ($errors.Count -gt 0) {
    throw "export-upload-deploy.ps1 has parser errors: $($errors[0].Message)"
}

Write-Output "DEPLOY_GODOT_RUNTIME_BASE_TEST_PASS"
