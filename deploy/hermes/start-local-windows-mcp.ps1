param(
  [int]$Port = 4100,
  [string]$HostAddress = "0.0.0.0",
  [string]$PublicUrl = "http://127.0.0.1:4100",
  [string]$GameApiUrl = "http://127.0.0.1:4000/api"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$mcpDir = Join-Path $repoRoot "mcp"

if (-not (Test-Path (Join-Path $mcpDir "src\server.mjs"))) {
  throw "MCP server not found at $mcpDir"
}

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($processId in $listeners) {
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

$env:CLASH_MCP_HOST = $HostAddress
$env:CLASH_MCP_PORT = [string]$Port
$env:CLASH_MCP_PUBLIC_URL = $PublicUrl
$env:CLASH_GAME_API_URL = $GameApiUrl
$env:CLASH_MCP_CORS_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4000,http://localhost:4000"

Start-Process -FilePath "node" -ArgumentList "src/server.mjs" -WorkingDirectory $mcpDir -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(15)
do {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
    if ($health.ok) {
      Write-Host "Local Windows MCP is healthy on $HostAddress`:$Port"
      exit 0
    }
  } catch {
    if ((Get-Date) -gt $deadline) { throw }
  }
} while ((Get-Date) -lt $deadline)

throw "MCP did not become healthy on port $Port"
