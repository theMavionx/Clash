param(
  [string]$ProxyFile = $env:CLASH_DEPLOY_PROXY_FILE,
  [Parameter(Mandatory = $true)][int]$ProxyIndex,
  [Parameter(Mandatory = $true)][string]$DestinationHost,
  [Parameter(Mandatory = $true)][int]$DestinationPort,
  [int]$ConnectTimeoutSeconds = 12,
  [switch]$ValidateEntryOnly
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-ProxyError {
  param([Parameter(Mandatory = $true)][string]$Message)
  [Console]::Error.WriteLine("[deploy-proxy index=$ProxyIndex] $Message")
}

function Read-ProxyEntry {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][int]$Index
  )

  if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Proxy file is unavailable"
  }

  $entries = @(Get-Content -LiteralPath $Path | ForEach-Object { $_.Trim() } | Where-Object {
    $_ -and -not $_.StartsWith('#')
  })
  if ($Index -lt 0 -or $Index -ge $entries.Count) {
    throw "Proxy index is outside the configured pool"
  }

  $match = [regex]::Match(
    $entries[$Index],
    '^(?:http://)?(?<host>[^:\s/]+):(?<port>\d{1,5})(?::(?<user>[^:\s]+):(?<password>.+))?/?$',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
  if (-not $match.Success) {
    throw "Proxy entry must use host:port or host:port:user:password"
  }

  $port = [int]$match.Groups['port'].Value
  if ($port -lt 1 -or $port -gt 65535) {
    throw "Proxy port is outside the valid TCP range"
  }

  $hasUser = $match.Groups['user'].Success
  $hasPassword = $match.Groups['password'].Success
  if ($hasUser -ne $hasPassword) {
    throw "Proxy credentials must include both user and password"
  }

  return [pscustomobject]@{
    Host = $match.Groups['host'].Value
    Port = $port
    User = if ($hasUser) { $match.Groups['user'].Value } else { $null }
    Password = if ($hasPassword) { $match.Groups['password'].Value } else { $null }
    RequiresAuthentication = $hasUser
  }
}

function Read-HttpConnectResponse {
  param([Parameter(Mandatory = $true)][System.IO.Stream]$Stream)

  $buffer = [System.Collections.Generic.List[byte]]::new()
  $window = [System.Collections.Generic.Queue[byte]]::new()
  while ($buffer.Count -lt 16384) {
    $value = $Stream.ReadByte()
    if ($value -lt 0) { throw "Proxy closed before completing the CONNECT response" }
    $byte = [byte]$value
    $buffer.Add($byte)
    $window.Enqueue($byte)
    while ($window.Count -gt 4) { [void]$window.Dequeue() }
    if ($window.Count -eq 4) {
      $tail = $window.ToArray()
      if ($tail[0] -eq 13 -and $tail[1] -eq 10 -and $tail[2] -eq 13 -and $tail[3] -eq 10) {
        return [System.Text.Encoding]::ASCII.GetString($buffer.ToArray())
      }
    }
  }
  throw "Proxy CONNECT response headers exceeded the safety limit"
}

$client = $null
try {
  $proxy = Read-ProxyEntry -Path $ProxyFile -Index $ProxyIndex
  if ($ValidateEntryOnly) {
    $authMode = if ($proxy.RequiresAuthentication) { 'basic' } else { 'none' }
    Write-Output "proxy_entry_valid auth=$authMode"
    return
  }

  $client = [System.Net.Sockets.TcpClient]::new()
  $connectTask = $client.ConnectAsync($proxy.Host, $proxy.Port)
  if (-not $connectTask.Wait([TimeSpan]::FromSeconds($ConnectTimeoutSeconds))) {
    throw "Proxy connection timed out"
  }
  $connectTask.GetAwaiter().GetResult()

  $stream = $client.GetStream()
  $stream.ReadTimeout = $ConnectTimeoutSeconds * 1000
  $stream.WriteTimeout = $ConnectTimeoutSeconds * 1000

  $authority = "${DestinationHost}:$DestinationPort"
  $authorizationHeader = ''
  $authorization = $null
  if ($proxy.RequiresAuthentication) {
    $credentialBytes = [System.Text.Encoding]::UTF8.GetBytes("$($proxy.User):$($proxy.Password)")
    $authorization = [Convert]::ToBase64String($credentialBytes)
    [Array]::Clear($credentialBytes, 0, $credentialBytes.Length)
    $authorizationHeader = "Proxy-Authorization: Basic $authorization`r`n"
  }
  $request = "CONNECT $authority HTTP/1.1`r`nHost: $authority`r`n${authorizationHeader}Proxy-Connection: Keep-Alive`r`nUser-Agent: Clash-Deploy-Relay/1.0`r`n`r`n"
  $requestBytes = [System.Text.Encoding]::ASCII.GetBytes($request)
  $stream.Write($requestBytes, 0, $requestBytes.Length)
  $stream.Flush()
  [Array]::Clear($requestBytes, 0, $requestBytes.Length)
  $authorization = $null
  $authorizationHeader = $null
  $request = $null
  $proxy.Password = $null

  $response = Read-HttpConnectResponse -Stream $stream
  $statusLine = ($response -split "`r`n", 2)[0]
  if ($statusLine -notmatch '^HTTP/\d(?:\.\d)?\s+2\d\d(?:\s|$)') {
    $printableStatus = $statusLine -replace '[^\x20-\x7E]', '?'
    $safeStatus = if ($printableStatus.Length -le 160) { $printableStatus } else { $printableStatus.Substring(0, 160) }
    throw "Proxy rejected CONNECT: $safeStatus"
  }
  $response = $null

  $stream.ReadTimeout = [System.Threading.Timeout]::Infinite
  $stream.WriteTimeout = [System.Threading.Timeout]::Infinite
  $stdin = [Console]::OpenStandardInput()
  $stdout = [Console]::OpenStandardOutput()
  $upload = $stdin.CopyToAsync($stream)
  $download = $stream.CopyToAsync($stdout)
  [void][System.Threading.Tasks.Task]::WhenAny($upload, $download).GetAwaiter().GetResult()
} catch {
  Write-ProxyError -Message $_.Exception.Message
  exit 1
} finally {
  if ($client) {
    try { $client.Client.Shutdown([System.Net.Sockets.SocketShutdown]::Both) } catch {}
    $client.Dispose()
  }
}
