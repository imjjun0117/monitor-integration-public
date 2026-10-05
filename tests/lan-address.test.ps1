$ErrorActionPreference = 'Stop'
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $RepositoryRoot 'scripts/process-helpers.ps1')

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Assert-Throws([scriptblock]$Action, [string]$Pattern, [string]$Message) {
    $Failure = $null
    try { & $Action } catch { $Failure = $_ }
    Assert-True ($null -ne $Failure) $Message
    Assert-True ($Failure.Exception.Message -match $Pattern) "$Message (unexpected error: $($Failure.Exception.Message))"
}

$ExamplePrivateLanAddress = '192.168.200.123'
$UnownedExamplePrivateLanAddress = '192.168.200.124'
$Private = @('10.1.2.3', '172.16.0.1', '172.31.255.254', $ExamplePrivateLanAddress)
foreach ($Address in $Private) {
    Assert-True (Test-PrivateLanIPv4Address -Address $Address) "$Address should be private LAN IPv4"
}

$Rejected = @('not-an-ip', '10.1', '0.0.0.0', '127.0.0.1', '169.254.2.3', '172.15.1.1', '172.32.1.1',
    '192.0.2.1', '8.8.8.8', '224.0.0.1', '::1')
foreach ($Address in $Rejected) {
    Assert-True (-not (Test-PrivateLanIPv4Address -Address $Address)) "$Address should be rejected"
}

$Candidates = @(
    [pscustomobject]@{ Address = '10.37.129.2'; InterfaceName = 'example-bridge'; HasDefaultGateway = $false },
    [pscustomobject]@{ Address = $ExamplePrivateLanAddress; InterfaceName = 'example-default'; HasDefaultGateway = $true }
)
Assert-True ((Resolve-LanIPv4Address -Candidates $Candidates) -eq $ExamplePrivateLanAddress) `
    'automatic selection should choose the active default-gateway LAN address'
Assert-True ((Resolve-LanIPv4Address -RequestedAddress '10.37.129.2' -Candidates $Candidates) -eq '10.37.129.2') `
    'an explicitly requested private address owned by an active interface should be accepted'
Assert-Throws { Resolve-LanIPv4Address -RequestedAddress '8.8.8.8' -Candidates $Candidates } `
    'private|LAN|공인|유효' 'public address was accepted'
Assert-Throws { Resolve-LanIPv4Address -RequestedAddress $UnownedExamplePrivateLanAddress -Candidates $Candidates } `
    'interface|host|소유' 'unowned private address was accepted'
Assert-Throws { Resolve-LanIPv4Address -Candidates @(
    [pscustomobject]@{ Address = '10.0.0.2'; InterfaceName = 'example-default-a'; HasDefaultGateway = $true },
    [pscustomobject]@{ Address = '192.168.1.2'; InterfaceName = 'example-default-b'; HasDefaultGateway = $true }
) } 'multiple|여러|LanAddress' 'ambiguous automatic selection was accepted'

Write-Host 'LAN address validation tests: 19/19 PASS'
