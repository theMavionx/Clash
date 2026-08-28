$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$relay = Join-Path $repoRoot 'deploy\putty-http-connect-proxy.ps1'
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ("clash-proxy-relay-{0}.txt" -f [guid]::NewGuid().ToString('N'))

try {
    @(
        '# comment',
        '127.0.0.1:3128',
        'http://127.0.0.2:8080',
        '127.0.0.3:9000:test-user:test-password',
        'socks5://127.0.0.4:1080'
    ) | Set-Content -LiteralPath $fixture -Encoding utf8

    $anonymous = & $relay -ProxyFile $fixture -ProxyIndex 0 -DestinationHost 'example.invalid' -DestinationPort 22 -ValidateEntryOnly
    if ($anonymous -ne 'proxy_entry_valid protocol=http auth=none') {
        throw "Anonymous host:port proxy entry was not accepted"
    }

    $prefixed = & $relay -ProxyFile $fixture -ProxyIndex 1 -DestinationHost 'example.invalid' -DestinationPort 22 -ValidateEntryOnly
    if ($prefixed -ne 'proxy_entry_valid protocol=http auth=none') {
        throw "Anonymous http://host:port proxy entry was not accepted"
    }

    $authenticated = & $relay -ProxyFile $fixture -ProxyIndex 2 -DestinationHost 'example.invalid' -DestinationPort 22 -ValidateEntryOnly
    if ($authenticated -ne 'proxy_entry_valid protocol=http auth=basic') {
        throw "Authenticated proxy entry regressed"
    }

    $socks5 = & $relay -ProxyFile $fixture -ProxyIndex 3 -DestinationHost 'example.invalid' -DestinationPort 22 -ValidateEntryOnly
    if ($socks5 -ne 'proxy_entry_valid protocol=socks5 auth=none') {
        throw "Anonymous SOCKS5 proxy entry was not accepted"
    }

    Write-Host 'DEPLOY_PROXY_RELAY_TEST_PASS'
} finally {
    Remove-Item -LiteralPath $fixture -Force -ErrorAction SilentlyContinue
}
