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
    '^(?:(?<protocol>http|socks5)://)?(?<host>[^:\s/]+):(?<port>\d{1,5})(?::(?<user>[^:\s]+):(?<password>.+))?/?$',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
  if (-not $match.Success) {
    throw "Proxy entry must use [http://|socks5://]host:port or host:port:user:password"
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
    Protocol = if ($match.Groups['protocol'].Success) { $match.Groups['protocol'].Value.ToLowerInvariant() } else { 'http' }
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

function Read-ExactBytes {
  param(
    [Parameter(Mandatory = $true)][System.IO.Stream]$Stream,
    [Parameter(Mandatory = $true)][int]$Count
  )

  $buffer = [byte[]]::new($Count)
  $offset = 0
  while ($offset -lt $Count) {
    $read = $Stream.Read($buffer, $offset, $Count - $offset)
    if ($read -le 0) { throw "Proxy closed before completing the SOCKS5 response" }
    $offset += $read
  }
  return $buffer
}

function Open-Socks5Tunnel {
  param(
    [Parameter(Mandatory = $true)][System.IO.Stream]$Stream,
    [Parameter(Mandatory = $true)][pscustomobject]$Proxy,
    [Parameter(Mandatory = $true)][string]$HostName,
    [Parameter(Mandatory = $true)][int]$Port
  )

  if ($Proxy.RequiresAuthentication) {
    throw "Authenticated SOCKS5 proxy entries are not supported by this relay"
  }

  $greeting = [byte[]](0x05, 0x01, 0x00)
  $Stream.Write($greeting, 0, $greeting.Length)
  $Stream.Flush()
  $greetingResponse = Read-ExactBytes -Stream $Stream -Count 2
  if ($greetingResponse[0] -ne 0x05 -or $greetingResponse[1] -ne 0x00) {
    throw "SOCKS5 proxy does not permit unauthenticated tunneling"
  }

  $destinationIp = $null
  $addressType = [byte]0x03
  $addressBytes = $null
  if ([System.Net.IPAddress]::TryParse($HostName, [ref]$destinationIp)) {
    $addressBytes = $destinationIp.GetAddressBytes()
    $addressType = if ($addressBytes.Length -eq 4) { [byte]0x01 } else { [byte]0x04 }
  } else {
    $addressBytes = [System.Text.Encoding]::ASCII.GetBytes($HostName)
    if ($addressBytes.Length -lt 1 -or $addressBytes.Length -gt 255) {
      throw "SOCKS5 destination host is outside the supported length"
    }
  }

  $request = [System.Collections.Generic.List[byte]]::new()
  $request.Add(0x05)
  $request.Add(0x01)
  $request.Add(0x00)
  $request.Add($addressType)
  if ($addressType -eq 0x03) { $request.Add([byte]$addressBytes.Length) }
  $request.AddRange($addressBytes)
  $request.Add([byte](($Port -shr 8) -band 0xff))
  $request.Add([byte]($Port -band 0xff))
  $requestBytes = $request.ToArray()
  $Stream.Write($requestBytes, 0, $requestBytes.Length)
  $Stream.Flush()
  [Array]::Clear($requestBytes, 0, $requestBytes.Length)

  $response = Read-ExactBytes -Stream $Stream -Count 4
  if ($response[0] -ne 0x05) { throw "Proxy returned an invalid SOCKS5 version" }
  if ($response[1] -ne 0x00) { throw "SOCKS5 CONNECT was rejected with code $($response[1])" }
  if ($response[2] -ne 0x00) { throw "Proxy returned an invalid SOCKS5 reserved byte" }

  switch ($response[3]) {
    0x01 { [void](Read-ExactBytes -Stream $Stream -Count 4) }
    0x03 {
      $length = (Read-ExactBytes -Stream $Stream -Count 1)[0]
      [void](Read-ExactBytes -Stream $Stream -Count $length)
    }
    0x04 { [void](Read-ExactBytes -Stream $Stream -Count 16) }
    default { throw "Proxy returned an invalid SOCKS5 address type" }
  }
  [void](Read-ExactBytes -Stream $Stream -Count 2)
}

$client = $null
try {
  $proxy = Read-ProxyEntry -Path $ProxyFile -Index $ProxyIndex
  if ($ValidateEntryOnly) {
    $authMode = if ($proxy.RequiresAuthentication) { 'basic' } else { 'none' }
    Write-Output "proxy_entry_valid protocol=$($proxy.Protocol) auth=$authMode"
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

  if ($proxy.Protocol -eq 'socks5') {
    Open-Socks5Tunnel -Stream $stream -Proxy $proxy -HostName $DestinationHost -Port $DestinationPort
  } else {
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

    $response = Read-HttpConnectResponse -Stream $stream
    $statusLine = ($response -split "`r`n", 2)[0]
    if ($statusLine -notmatch '^HTTP/\d(?:\.\d)?\s+2\d\d(?:\s|$)') {
      $printableStatus = $statusLine -replace '[^\x20-\x7E]', '?'
      $safeStatus = if ($printableStatus.Length -le 160) { $printableStatus } else { $printableStatus.Substring(0, 160) }
      throw "Proxy rejected CONNECT: $safeStatus"
    }
    $response = $null
  }
  $proxy.Password = $null

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
